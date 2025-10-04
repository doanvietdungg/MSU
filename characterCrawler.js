import puppeteer from "puppeteer";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import config from "./config.js";
import Logger from "./logger.js";

class MSUCharacterCrawler {
    constructor() {
        this.browser = null;
        this.page = null;
        this.baseUrl = config.characterBaseUrl;
        this.outputDir = config.output?.directory || "./output"; // fallback
        this.logger = new Logger();
    }

    async init() {
        this.logger.start("Khởi tạo crawler nhân vật...");

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

    async crawlCharacters() {
        try {
            let allCharacters = [];
            let pageIndex = 1;
            let Index = 1; // You might want to make this dynamic or configurable

            while (pageIndex <= Index) {
                this.logger.info(`Đang crawl trang ${pageIndex} nhân vật...`);

                const url = pageIndex === 1 ? this.baseUrl : `${this.baseUrl}?page=${pageIndex}`;
                await this.page.goto(url, {
                    waitUntil: "networkidle2",
                    timeout: config.crawl.timeout,
                });

                // Chờ item load
                const selectorString = config.selectors.characterItems.join(", "); // Use new config for character selectors
                try {
                    await this.page.waitForSelector(selectorString, {
                        timeout: config.crawl.waitForSelector,
                    });
                } catch {
                    this.logger.warning(
                        `Không tìm thấy nhân vật ở trang ${pageIndex}, dừng crawl.`
                    );
                    break;
                }

                // Lấy data
                const characterData = await this.extractCharacterData();
                this.logger.success(
                    `Trang ${pageIndex}: lấy được ${characterData.length} nhân vật`
                );

                if (characterData.length === 0) {
                    this.logger.info("Hết data nhân vật, dừng crawl.");
                    break;
                }

                allCharacters.push(...characterData);


                // Điều chỉnh logic phân trang nếu cần
                if (characterData.length < 135) { // Adjust this number based on actual items per page
                    break;
                }
                pageIndex++;

                // Delay tránh bị block
                await this.randomDelay(config.crawl.delay.min, config.crawl.delay.max);
            }

            return allCharacters;
        } catch (error) {
            this.logger.error("Lỗi khi crawl dữ liệu nhân vật:", error.message);
            throw error;
        }
    }

    async extractCharacterData() {
        this.logger.info("Đang trích xuất dữ liệu nhân vật...");

        const characterData = await this.page.evaluate(() => {
            const items = document.querySelectorAll("article.BaseCard_itemCard__mTDZ2");

            return Array.from(items).map((el, index) => {
                console.log(el);

                const name = el.querySelector(".BaseCard_itemName__Z2GfD > div:first-child")?.textContent.trim() || "";
                const level = el.querySelector("span.BaseCard_starforceInCard__861PF")?.textContent.replace("Lv.", "").trim() || "";
                const job = Array.from(el.querySelectorAll(".Job_jobText__oGuaL span"))
                    .map(j => j.textContent.trim())
                    .join(" ");
                const price = el.querySelector(".CardPrice_number__OYpdb")?.textContent.trim() || "";
                const owner = el.querySelector(".BaseCard_userName__I01dD")?.textContent.trim() || "";
                const img = el.querySelector("img._4housa1")?.src || "";

                return {
                    id: index + 1,
                    name,
                    level,
                    class: job,
                    price,
                    owner,
                    image: img,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                };
            });
        });

        return characterData;
    }


    async saveData(data, filename = config.output.characterFilename) {
        try {
            const filePath = path.join(this.outputDir, filename);
            console.log("DEBUG save path:", filePath); // 👈 log đường dẫn ra test
            await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
            this.logger.success(`Đã lưu dữ liệu nhân vật vào: ${filePath}`);
        } catch (error) {
            this.logger.error("Lỗi khi lưu dữ liệu nhân vật:", error);
            console.error(error); // 👈 in full stack
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
            const characterData = await this.crawlCharacters();
            await this.saveData(characterData);

            this.logger.complete("Crawl nhân vật hoàn thành!", { totalCharacters: characterData.length });

            return characterData;
        } catch (error) {
            this.logger.error("Lỗi trong quá trình crawl nhân vật:", error);
            throw error;
        }
    }
}

// Chạy crawler
async function main() {
    const crawler = new MSUCharacterCrawler();

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

export default MSUCharacterCrawler;