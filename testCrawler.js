import puppeteer from "puppeteer";
import fs from "fs";

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null
  });

  const page = await browser.newPage();
  let allCharacters = [];

  // === BẮT LIST TỪ API EXPLORE ===
  const onResponseList = async (response) => {
    const url = response.url();
    if (url === "https://msu.io/marketplace/api/marketplace/explore/characters") {
      try {
        const data = await response.json();
        const items = data?.characters || data?.data?.items || [];
        console.log(`📄 API list trả về ${items.length} nhân vật`);
        allCharacters = items;
        fs.writeFileSync("characters.json", JSON.stringify(items, null, 2));
        console.log("💾 Đã lưu danh sách vào characters.json");

        page.off("response", onResponseList);
      } catch (err) {
        console.log("❌ Không parse được JSON khi lấy list, nghỉ 10s...");
        await delay(10000);
      }
    }
  };

  page.on("response", onResponseList);

  await page.goto("https://msu.io/marketplace/character", {
    waitUntil: "networkidle2"
  });
  await delay(5000);

  console.log(`👉 Bắt đầu crawl chi tiết cho ${allCharacters.length} nhân vật...`);

  const filename = "characters_detailed.json";
  let existing = [];
  if (fs.existsSync(filename)) {
    existing = JSON.parse(fs.readFileSync(filename));
  }

  // === Load checkpoint index ===
  let checkpoint = 0;
  if (fs.existsSync("checkpoint.json")) {
    checkpoint = JSON.parse(fs.readFileSync("checkpoint.json"));
    console.log(`⏩ Tiếp tục từ index ${checkpoint}`);
  }

  for (let i = checkpoint; i < allCharacters.length; i++) {
    const char = allCharacters[i];
    const tokenId = char.tokenId;
    const detailUrl = `https://msu.io/marketplace/character/${tokenId}`;
    const expectUrl = `https://msu.io/marketplace/api/marketplace/characters/${tokenId}`;

    console.log(`🔎 [${i + 1}/${allCharacters.length}] Đang mở ${detailUrl}`);
    let detailJson = null;

    while (!detailJson) {
      const detailPage = await browser.newPage();

      try {
        await detailPage.goto(detailUrl, { waitUntil: "networkidle2" });

        const response = await detailPage.waitForResponse(
          res => res.url() === expectUrl,
          { timeout: 15000 }
        );

        if (response.status() === 429) {
          console.log(`⏳ 429 cho ${tokenId}, nghỉ 10 phút rồi thử lại...`);
          await delay(600000);
        } else {
          try {
            detailJson = await response.json();
          } catch (err) {
            console.log(`❌ Parse JSON lỗi cho ${tokenId}, nghỉ 10 phút rồi thử lại...`);
            await delay(600000);
          }
        }
      } catch (err) {
        console.log(`❌ Lỗi mở trang ${detailUrl}:`, err.message);
        console.log("⏳ Nghỉ 10 phút rồi thử lại...");
        await delay(600000);
      }

      await detailPage.close();
    }

    // ✅ Lưu kết quả
    existing.push(detailJson);
    fs.writeFileSync(filename, JSON.stringify(existing, null, 2));
    console.log(`✅ Đã lưu detail cho tokenId ${tokenId}`);

    // ✅ Lưu checkpoint
    fs.writeFileSync("checkpoint.json", JSON.stringify(i + 1));

    // Delay nhỏ tránh spam
    await delay(2000 + Math.random() * 2000);
  }

  console.log("🎉 Crawl hoàn tất!");
  await browser.close();
})();
