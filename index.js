import puppeteer from "puppeteer";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "./config.js";
import Logger from "./logger.js";

class MSUNFTCrawler {
  constructor() {
    this.browser = null;
    this.page = null;
    this.baseUrl = config.baseUrl;
    this.outputDir = config.output.directory;
    this.logger = new Logger();
  }

  async init() {
    this.logger.start("Khởi tạo crawler...");

    // Tạo thư mục output nếu chưa có
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      // Thư mục đã tồn tại
    }

    // Khởi tạo browser với cấu hình từ config
    this.browser = await puppeteer.launch({
      headless: config.browser.headless,
      args: config.browser.args,
    });

    this.page = await this.browser.newPage();

    // Thiết lập proxy authentication nếu có
    if (config.proxy.enabled) {
      await this.page.authenticate({
        username: config.proxy.username,
        password: config.proxy.password,
      });
      this.logger.info(
        `Đã thiết lập proxy: ${config.proxy.host}:${config.proxy.port}`
      );
    }

    // Thiết lập viewport và user agent
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent(config.browser.userAgent);

    // Thêm các header để giống browser thật
    await this.page.setExtraHTTPHeaders(config.headers);

    this.logger.success("Browser đã được khởi tạo");
  }

  async crawlNFTs() {
    try {
      let allNFTs = [];
      let pageIndex = 1;
      let Index = 3;

      let hasNext = true;

      while (pageIndex <= Index) {
        this.logger.info(`Đang crawl trang ${pageIndex}...`);

        if (pageIndex == 1) {
            await this.page.goto(`${this.baseUrl}`, {
                waitUntil: "networkidle2",
                timeout: config.crawl.timeout,
              });
        }

        else {
            await this.page.goto(`${this.baseUrl}?page=${pageIndex}`, {
                waitUntil: "networkidle2",
                timeout: config.crawl.timeout,
              });
        }
        // Truy cập từng page


        // Chờ item load
        const selectorString = config.selectors.nftItems.join(", ");
        try {
          await this.page.waitForSelector(selectorString, {
            timeout: config.crawl.waitForSelector,
          });
        } catch {
          this.logger.warning(
            `Không tìm thấy item ở trang ${pageIndex}, dừng crawl.`
          );
          break;
        }

        // Lấy data
        const nftData = await this.extractNFTData();
        this.logger.success(
          `Trang ${pageIndex}: lấy được ${nftData.length} items`
        );

        if (nftData.length === 0) {
          this.logger.info("Hết data, dừng crawl.");
          break;
        }

        allNFTs.push(...nftData);

        // Nếu số lượng nhỏ hơn 135 → trang cuối
        if (nftData.length < 135) {
          hasNext = false;
        } else {
        //   pageIndex++;
        }
        pageIndex++

        // Delay tránh bị block
        await this.randomDelay(config.crawl.delay.min, config.crawl.delay.max);
      }

      return allNFTs;
    } catch (error) {
      this.logger.error("Lỗi khi crawl dữ liệu:", error.message);
      throw error;
    }
  }

  async extractNFTData() {
    this.logger.info("Đang trích xuất dữ liệu NFT...");

    const nftData = await this.page.evaluate((selectors) => {
      const nfts = [];

      // Thử nhiều selector khác nhau để tìm NFT items
      let nftElements = [];

      for (const selector of selectors.nftItems) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          nftElements = elements;
          console.log(
            `Tìm thấy ${elements.length} elements với selector: ${selector}`
          );
          break;
        }
      }

      // Nếu không tìm thấy, thử tìm tất cả các element có thể chứa NFT
      if (nftElements.length === 0) {
        nftElements = document.querySelectorAll(
          'div[class*="item"], div[class*="card"], div[class*="product"]'
        );
      }

      nftElements.forEach((element, index) => {
        try {
          const nft = {
            id: index + 1,
            title: "",
            price: "",
            image: "",
            description: "",
            owner: "",
            collection: "",
            attributes: [],
            url: window.location.href,
            timestamp: new Date().toISOString(),
          };

          // Tìm title từ alt text của ảnh
          const images = element.querySelectorAll("img");
          for (const img of images) {
            if (img.alt && img.alt.trim() && !img.alt.includes("neso ticker")) {
              nft.title = img.alt.trim();
              break;
            }
          }

          // Tìm price
          for (const selector of selectors.price) {
            const priceEl = element.querySelector(selector);
            if (priceEl && priceEl.textContent.trim()) {
              nft.price = priceEl.textContent.trim();
              break;
            }
          }

          // Tìm image - ưu tiên ảnh từ api-static.msu.io
          for (const img of images) {
            if (img.src && img.src.includes("api-static.msu.io")) {
              nft.image = img.src;
              break;
            }
          }

          // Tìm description
          for (const selector of selectors.description) {
            const descEl = element.querySelector(selector);
            if (descEl && descEl.textContent.trim()) {
              nft.description = descEl.textContent.trim();
              break;
            }
          }

          // Tìm owner
          for (const selector of selectors.owner) {
            const ownerEl = element.querySelector(selector);
            if (ownerEl && ownerEl.textContent.trim()) {
              nft.owner = ownerEl.textContent.trim();
              break;
            }
          }

          // Fallback: nếu không có title, dùng ID làm title tạm
          if (!nft.title) {
            nft.title = `NFT #${index + 1}`;
          }

          // Thêm NFT nếu có giá
          if (nft.price) {
            nfts.push(nft);
          }
        } catch (error) {
          console.error("Lỗi khi xử lý element:", error);
        }
      });

      return nfts;
    }, config.selectors);

    return nftData;
  }

  async saveData(data, filename = config.output.filename) {
    try {
      const filePath = path.join(this.outputDir, filename);
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      this.logger.success(`Đã lưu dữ liệu vào: ${filePath}`);
    } catch (error) {
      this.logger.error("Lỗi khi lưu dữ liệu:", error.message);
    }
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.logger.info("Browser đã được đóng");
    }
  }

  async run() {
    try {
      await this.init();
      const nftData = await this.crawlNFTs();
      await this.saveData(nftData);

      this.logger.complete("Crawl hoàn thành!", { totalNFTs: nftData.length });

      return nftData;
    } catch (error) {
      this.logger.error("Lỗi trong quá trình crawl:", error);
      throw error;
    } finally {
      await this.close();
    }
  }
}

// Chạy crawler
async function main() {
  const crawler = new MSUNFTCrawler();

  try {
    await crawler.run();
  } catch (error) {
    console.error("Lỗi chính:", error);
    process.exit(1);
  }
}

// Chạy nếu file được gọi trực tiếp
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export default MSUNFTCrawler;
