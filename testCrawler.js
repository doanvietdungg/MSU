import puppeteer from "puppeteer";
import fs from "fs";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  let loopCounter = 0;
  const LOOP_DELAY = 60000; // 1 phút delay giữa các vòng lặp

  console.log(`🚀 Bắt đầu vòng lặp vô hạn với delay ${LOOP_DELAY / 1000}s giữa các vòng...`);

  while (true) {
    loopCounter++;
    console.log(`\n🔄 ===== VÒNG LẶP ${loopCounter} =====`);
    
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
        console.log("❌ Không parse được JSON khi lấy list, nghỉ 5s...");
        await delay(5000);
      }
    }
  };

  page.on("response", onResponseList);

  await page.goto("https://msu.io/marketplace/character", {
    waitUntil: "networkidle2",
  });
  await delay(5000);

  // Crawl 10 nhân vật đầu tiên, nhưng sẽ lặp lại 10 lần
  const charactersToCrawl = allCharacters.slice(0, 10);
  const TOTAL_CYCLES = 10; // Crawl 10 lần
  const CHARACTERS_PER_CYCLE = charactersToCrawl.length;

  console.log(
    `👉 Bắt đầu crawl ${TOTAL_CYCLES} chu kỳ, mỗi chu kỳ ${CHARACTERS_PER_CYCLE} nhân vật...`
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

  // Reset checkpoint nếu vượt quá tổng số nhân vật cần crawl
  const totalCharactersToProcess = TOTAL_CYCLES * CHARACTERS_PER_CYCLE;
  if (checkpoint >= totalCharactersToProcess) {
    checkpoint = 0;
    console.log(`🔄 Checkpoint vượt quá giới hạn, reset về 0`);
  }

  // Tính toán chu kỳ hiện tại
  const currentCycle = Math.floor(checkpoint / CHARACTERS_PER_CYCLE) + 1;
  const currentCycleProgress = checkpoint % CHARACTERS_PER_CYCLE;

  console.log(`🔄 Chu kỳ hiện tại: ${currentCycle}/${TOTAL_CYCLES}`);
  console.log(`📊 Tiến độ trong chu kỳ: ${currentCycleProgress}/${CHARACTERS_PER_CYCLE}`);
  console.log(`🎯 Sẽ crawl từ index ${checkpoint} đến ${totalCharactersToProcess - 1} (${totalCharactersToProcess - checkpoint} nhân vật)`);

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
  const CONCURRENT_LIMIT = 1; // Giảm xuống 1 để tránh 429
  const BATCH_SIZE = 1; // Giảm batch size
  const REQUEST_DELAY = 5000; // 5 giây delay giữa các request

  const crawlCharacter = async (char, index) => {
    const tokenId = char.tokenId;
    const detailUrl = `https://msu.io/marketplace/character/${tokenId}`;
    const expectUrl = `https://msu.io/marketplace/api/marketplace/characters/${tokenId}`;

    const globalIndex = index + 1;
    const currentCycle = Math.floor(index / CHARACTERS_PER_CYCLE) + 1;
    const cycleProgress = (index % CHARACTERS_PER_CYCLE) + 1;
    console.log(`🔎 [${globalIndex}/${totalCharactersToProcess}] Chu kỳ ${currentCycle}/${TOTAL_CYCLES} - Nhân vật ${cycleProgress}/${CHARACTERS_PER_CYCLE} - Đang mở ${detailUrl}`);
    let detailJson = null;
    let retryCount = 0;
    const maxRetries = 5;

    while (!detailJson && retryCount < maxRetries) {
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
          retryCount++;
          const backoffDelay = Math.min(600000 * Math.pow(2, retryCount - 1), 1800000); // Max 30 phút
          console.log(`⏳ 429 cho ${tokenId} (lần ${retryCount}), nghỉ ${backoffDelay / 60000} phút...`);
          await delay(backoffDelay);
        } else {
          try {
            detailJson = await response.json();
            console.log(`✅ Lấy thành công detail cho ${tokenId}`);
          } catch (err) {
            retryCount++;
            const backoffDelay = Math.min(600000 * Math.pow(2, retryCount - 1), 1800000);
            console.log(
              `❌ Parse JSON lỗi cho ${tokenId} (lần ${retryCount}), nghỉ ${backoffDelay / 60000} phút...`
            );
            await delay(backoffDelay);
          }
        }
      } catch (err) {
        retryCount++;
        const backoffDelay = Math.min(600000 * Math.pow(2, retryCount - 1), 1800000);
        console.log(`❌ Lỗi mở trang ${detailUrl} (lần ${retryCount}):`, err.message);
        console.log(`⏳ Nghỉ ${backoffDelay / 60000} phút rồi thử lại...`);
        await delay(backoffDelay);
      }

      await detailPage.close();
    }

    if (!detailJson) {
      console.log(`❌ Không thể lấy detail cho ${tokenId} sau ${maxRetries} lần thử`);
      return null;
    }

    // === CRAWL VẬT PHẨM NHÂN VẬT ===
    const summaryEntry = {
      characterTokenId: tokenId,
      characterLink: detailUrl,
      characterPriceWei: "0",
      characterPriceEth: 0,
      items: [],
    };

    try {
      // Lấy giá nhân vật (ưu tiên từ API chính nếu có)
      const characterPriceWeiMain =
        detailJson?.character?.salesInfo?.priceWei ||
        detailJson?.salesInfo?.priceWei ||
        detailJson?.data?.salesInfo?.priceWei ||
        null;
      const characterPriceWei = characterPriceWeiMain || "0";
      const characterPriceEth = Number(characterPriceWei) / 1e18;
      summaryEntry.characterPriceWei = characterPriceWei;
      summaryEntry.characterPriceEth = characterPriceEth;

      const equip = detailJson?.character?.wearing?.equip || {};
      const equipTokens = Object.values(equip)
        .filter((v) => v && v.tokenId)
        .map((v) => v.tokenId);

      console.log(
        `🧩 Nhân vật ${tokenId} có ${equipTokens.length} vật phẩm cần crawl`
      );

      const itemDetails = [];
      const pricedItems = [];
      for (const itemToken of equipTokens) {
        const itemUrl = `https://msu.io/marketplace/nft/${itemToken}`;
        const itemApiUrl = `https://msu.io/marketplace/api/marketplace/items/${itemToken}`;
        const itemApiUrlTradeHistory = `https://msu.io/marketplace/api/marketplace/items/${itemToken}/trade-history`

        let itemJsonMain = null;
        let itemJsonTradeHistory = null;
        let retry = 0;

        while (!itemJsonMain && !itemJsonTradeHistory && retry < 3) {
          const itemPage = await browser.newPage();
          try {
            await itemPage.goto(itemUrl, {
              timeout: 60000,
              waitUntil: "domcontentloaded",
            });

            // Chờ cả hai API song song (API chính + trade history)
            const [mainRes, historyRes] = await Promise.allSettled([
              itemPage.waitForResponse((res) => res.url() === itemApiUrl, { timeout: 20000 }),
              itemPage.waitForResponse((res) => res.url() === itemApiUrlTradeHistory, { timeout: 20000 }),
            ]);

            let hit429 = false;
            let mainData = null;
            let historyData = null;

            if (mainRes.status === 'fulfilled') {
              const res = mainRes.value;
              if (res.status() === 429) {
                hit429 = true;
              } else {
                try {
                  mainData = await res.json();
                  console.log(`✅ Lấy item ${itemToken} từ API chính`);
                } catch {}
              }
            }

            if (historyRes.status === 'fulfilled') {
              const res = historyRes.value;
              if (res.status() === 429) {
                hit429 = true;
              } else {
                try {
                  historyData = await res.json();
                  console.log(`✅ Lấy item ${itemToken} từ trade history API`);
                } catch {}
              }
            }

            if (hit429) {
              console.log(`⏳ 429 khi lấy item ${itemToken}, nghỉ 10 phút...`);
              await delay(600000); // Tăng lên 10 phút
            }

            // Gán dữ liệu để dùng tiếp
            itemJsonMain = mainData;
            itemJsonTradeHistory = historyData;
          } catch (err) {
            retry++;
            console.log(
              `⚠️ Lỗi item ${itemToken}: ${err.message} → thử lại (${retry}/3)`
            );
            await delay(30000); // Tăng delay lên 30 giây
          }
          await itemPage.close();
        }

        if (itemJsonMain || itemJsonTradeHistory) {
          // Tính giá: ưu tiên API chính, fallback sang trade history
          const priceFromMainWei = itemJsonMain?.salesInfo?.priceWei || null;
          const priceFromHistoryWei = itemJsonTradeHistory?.histories?.[0]?.tradeInfo?.priceWei || null;
          const priceWei = priceFromMainWei || priceFromHistoryWei || "0";
          if (priceFromMainWei) {
            console.log(`💰 Lấy giá từ salesInfo: ${priceFromMainWei}`);
          } else if (priceFromHistoryWei) {
            console.log(`💰 Lấy giá từ trade history: ${priceFromHistoryWei}`);
          }

          const priceEth = Number(priceWei) / 1e18;

          summaryEntry.items.push({
            itemTokenId: itemToken,
            itemLink: itemUrl,
            priceWei,
            priceEth,
          });

          if (priceEth > 0) {
            pricedItems.push({ itemToken, itemUrl, priceEth });
          }

          itemDetails.push(itemJsonMain || itemJsonTradeHistory);
        } else {
          console.log(`❌ Bỏ qua item ${itemToken} sau 3 lần lỗi`);
        }
      }

      // Send a single consolidated Telegram message per character
      if (pricedItems.length > 0 && summaryEntry.characterPriceEth <= 1000000) {
        const itemsLines = pricedItems
          .map((it) => `• [${it.itemToken}](${it.itemUrl}) — ${it.priceEth} ETH`)
          .join("\n");
        const msg = `💰 *Tìm thấy vật phẩm có giá!*\n👤 Nhân vật: [${tokenId}](${detailUrl})\n💵 Giá nhân vật: ${summaryEntry.characterPriceEth} ETH\n\n${itemsLines}`;
        sendTelegramMessage(msg);
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

  for (let batchStart = checkpoint; batchStart < totalCharactersToProcess; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, totalCharactersToProcess);

    // Tính toán chu kỳ và index trong chu kỳ
    const currentBatchCycle = Math.floor(batchStart / CHARACTERS_PER_CYCLE) + 1;
    const startIndexInCycle = batchStart % CHARACTERS_PER_CYCLE;
    const endIndexInCycle = Math.min((batchEnd - 1) % CHARACTERS_PER_CYCLE + 1, CHARACTERS_PER_CYCLE);

    const batch = charactersToCrawl.slice(startIndexInCycle, endIndexInCycle);

    console.log(`🚀 Chu kỳ ${currentBatchCycle}/${TOTAL_CYCLES} - Xử lý batch ${batchStart + 1}-${batchEnd} (${batch.length} nhân vật)`);

    // Chạy tuần tự để tránh 429 (vì CONCURRENT_LIMIT = 1)
    const results = [];
    for (let i = 0; i < batch.length; i++) {
      const char = batch[i];
      const index = batchStart + i;

      console.log(`⏳ Delay ${REQUEST_DELAY / 1000}s trước khi crawl nhân vật ${index + 1}...`);
      await delay(REQUEST_DELAY);

      const result = await crawlCharacter(char, index);
      if (result) {
        results.push({ status: 'fulfilled', value: result });
      } else {
        results.push({ status: 'rejected', reason: `Failed to crawl character ${char.tokenId}` });
      }

      // Delay thêm sau mỗi nhân vật
      if (i < batch.length - 1) {
        console.log(`⏳ Delay thêm 3s giữa các nhân vật...`);
        await delay(3000);
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

    // Cập nhật checkpoint
    fs.writeFileSync("checkpoint.json", JSON.stringify(batchEnd));

    console.log(`✅ Hoàn thành batch ${batchStart + 1}-${batchEnd}`);

    // Delay giữa các batch lớn
    if (batchEnd < totalCharactersToProcess) {
      console.log(`⏳ Delay 5s giữa các batch...`);
      await delay(5000); // Tăng delay giữa batch lên 10 giây
    }
  }

    console.log(`🎉 Hoàn thành vòng lặp ${loopCounter}!`);
    console.log(`📊 Đã crawl ${TOTAL_CYCLES} chu kỳ (${totalCharactersToProcess} nhân vật)`);
    
    await browser.close();
    
    console.log(`⏳ Chờ ${LOOP_DELAY / 1000}s trước khi bắt đầu vòng lặp tiếp theo...`);
    await delay(LOOP_DELAY);
  }
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