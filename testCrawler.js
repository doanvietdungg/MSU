import puppeteer from "puppeteer";
import fs from "fs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  let allCharacters = [];

  // === BẮT LIST TỪ API EXPLORE ===
  const onResponseList = async (response) => {
    const url = response.url();
    if (
      url === "https://msu.io/marketplace/api/marketplace/explore/characters"
    ) {
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
    waitUntil: "networkidle2",
  });
  await delay(5000);

  console.log(
    `👉 Bắt đầu crawl chi tiết cho ${allCharacters.length} nhân vật...`
  );

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

  // === File tổng hợp nhân vật + vật phẩm ===
  const summaryFile = "character_item_summary.json";
  let summaryData = [];
  if (fs.existsSync(summaryFile)) {
    try {
      const raw = fs.readFileSync(summaryFile, "utf8").trim();
      summaryData = raw ? JSON.parse(raw) : [];
    } catch {
      console.log("⚠️ File summary bị lỗi, tạo mới.");
      summaryData = [];
    }
  }

  // === TỐI ƯU: CHẠY SONG SONG ===
  const CONCURRENT_LIMIT = 3; // Số nhân vật crawl cùng lúc
  const BATCH_SIZE = 10; // Xử lý theo batch để tránh quá tải

  const crawlCharacter = async (char, index) => {
    const tokenId = char.tokenId;
    const detailUrl = `https://msu.io/marketplace/character/${tokenId}`;
    const expectUrl = `https://msu.io/marketplace/api/marketplace/characters/${tokenId}`;

    console.log(`🔎 [${index + 1}/${allCharacters.length}] Đang mở ${detailUrl}`);
    let detailJson = null;

    while (!detailJson) {
      const detailPage = await browser.newPage();

      try {
        await detailPage.goto(detailUrl, {
          timeout: 60000,
          waitUntil: "domcontentloaded",
        });

        const response = await detailPage.waitForResponse(
          (res) => res.url() === expectUrl
        );

        if (response.status() === 429) {
          console.log(`⏳ 429 cho ${tokenId}, nghỉ 5 phút rồi thử lại...`);
          await delay(300000);
        } else {
          try {
            detailJson = await response.json();
          } catch (err) {
            console.log(
              `❌ Parse JSON lỗi cho ${tokenId}, nghỉ 5 phút rồi thử lại...`
            );
            await delay(300000);
          }
        }
      } catch (err) {
        console.log(`❌ Lỗi mở trang ${detailUrl}:`, err.message);
        console.log("⏳ Nghỉ 5 phút rồi thử lại...");
        await delay(300000);
      }

      await detailPage.close();
    }

    // === CRAWL VẬT PHẨM NHÂN VẬT ===
    const summaryEntry = {
      characterTokenId: tokenId,
      characterLink: detailUrl,
      items: [],
    };

    try {
      const equip = detailJson?.character?.wearing?.equip || {};
      const equipTokens = Object.values(equip)
        .filter((v) => v && v.tokenId)
        .map((v) => v.tokenId);

      console.log(
        `🧩 Nhân vật ${tokenId} có ${equipTokens.length} vật phẩm cần crawl`
      );

      const itemDetails = [];
      for (const itemToken of equipTokens) {
        const itemUrl = `https://msu.io/marketplace/nft/${itemToken}`;
        const itemApiUrl = `https://msu.io/marketplace/api/marketplace/items/${itemToken}`;

        let itemJson = null;
        let retry = 0;

        while (!itemJson && retry < 3) {
          const itemPage = await browser.newPage();
          try {
            await itemPage.goto(itemUrl, {
              timeout: 60000,
              waitUntil: "domcontentloaded",
            });

            const response = await itemPage.waitForResponse(
              (res) =>
                res.url() === itemApiUrl,
              { timeout: 20000 }
            );

            if (response.status() === 429) {
              console.log(`⏳ 429 khi lấy item ${itemToken}, nghỉ 5 phút...`);
              await delay(300000);
            } else {
              itemJson = await response.json();
              console.log(`✅ Lấy thành công item ${itemToken}`);
            }
          } catch (err) {
            retry++;
            console.log(
              `⚠️ Lỗi item ${itemToken}: ${err.message} → thử lại (${retry}/3)`
            );
            await delay(10000);
          }
          await itemPage.close();
        }

        if (itemJson) {
          const priceWei = itemJson?.salesInfo?.priceWei || "0";
          const priceEth = Number(priceWei) / 1e18;

          summaryEntry.items.push({
            itemTokenId: itemToken,
            itemLink: itemUrl,
            priceWei,
            priceEth,
          });

          if (priceEth > 0) {
            const msg = `💰 *Tìm thấy vật phẩm có giá!*
          👤 Nhân vật: [${tokenId}](${detailUrl})
          🎁 Item: [${itemToken}](${itemUrl})
          💵 Giá: ${priceEth} ETH`;
          
            sendTelegramMessage(msg);
          }

          itemDetails.push(itemJson);
        } else {
          console.log(`❌ Bỏ qua item ${itemToken} sau 3 lần lỗi`);
        }
      }

      return {
        detailJson,
        summaryEntry,
        itemDetails,
        tokenId,
        index
      };
    } catch (err) {
      console.log(
        `❌ Lỗi khi xử lý vật phẩm của nhân vật ${tokenId}: ${err.message}`
      );
      return {
        detailJson,
        summaryEntry,
        itemDetails: [],
        tokenId,
        index
      };
    }
  };

  // === XỬ LÝ THEO BATCH ===
  for (let batchStart = checkpoint; batchStart < allCharacters.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, allCharacters.length);
    const batch = allCharacters.slice(batchStart, batchEnd);
    
    console.log(`🚀 Xử lý batch ${batchStart + 1}-${batchEnd} (${batch.length} nhân vật)`);
    
    // Chạy song song với giới hạn concurrent
    const results = [];
    for (let i = 0; i < batch.length; i += CONCURRENT_LIMIT) {
      const concurrentBatch = batch.slice(i, i + CONCURRENT_LIMIT);
      const promises = concurrentBatch.map((char, idx) => 
        crawlCharacter(char, batchStart + i + idx)
      );
      
      const batchResults = await Promise.allSettled(promises);
      results.push(...batchResults);
      
      // Delay nhỏ giữa các batch concurrent
      if (i + CONCURRENT_LIMIT < batch.length) {
        await delay(1000);
      }
    }
    
    // === LƯU KẾT QUẢ BATCH ===
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        const { detailJson, summaryEntry, itemDetails, tokenId, index } = result.value;
        
        // ✅ Lưu chi tiết nhân vật
        existing.push(detailJson);
        console.log(`✅ Đã lưu detail cho tokenId ${tokenId}`);
        
        // ✅ Lưu file chi tiết item riêng
        if (itemDetails.length > 0) {
          const itemsFile = "items_detailed.json";
          let existingItems = [];
          if (fs.existsSync(itemsFile)) {
            try {
              const raw = fs.readFileSync(itemsFile, "utf8").trim();
              existingItems = raw ? JSON.parse(raw) : [];
            } catch {
              console.log("⚠️ File items_detailed.json bị lỗi, tạo mới.");
              existingItems = [];
            }
          }

          existingItems.push(...itemDetails);
          fs.writeFileSync(itemsFile, JSON.stringify(existingItems, null, 2));
          console.log(
            `💾 Đã lưu ${itemDetails.length} vật phẩm cho nhân vật ${tokenId}`
          );
        }

        // ✅ Lưu summary
        summaryData.push(summaryEntry);
        console.log(`📦 Đã cập nhật summary cho nhân vật ${tokenId}`);
      } else if (result.status === 'rejected') {
        console.log(`❌ Lỗi crawl nhân vật: ${result.reason}`);
      }
    }
    
    // ✅ Lưu checkpoint và files sau mỗi batch
    fs.writeFileSync(filename, JSON.stringify(existing, null, 2));
    fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2));
    fs.writeFileSync("checkpoint.json", JSON.stringify(batchEnd));
    
    console.log(`✅ Hoàn thành batch ${batchStart + 1}-${batchEnd}`);
    
    // Delay giữa các batch lớn
    if (batchEnd < allCharacters.length) {
      await delay(3000);
    }
  }

  console.log("🎉 Crawl hoàn tất!");
  await browser.close();
})();

const TELEGRAM_BOT_TOKEN = "8069462425:AAF_U3Yo-plaL7KZVeQmNAfxHxhFk3UQS0k"; // 🔑 thay bằng token bot
const TELEGRAM_CHAT_ID = "-4938863590"; // 💬 id chat hoặc group

async function sendTelegramMessage(text) {
  const fetch = (await import("node-fetch")).default;
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.log("⚠️ Không gửi được Telegram:", err.message);
  }
}