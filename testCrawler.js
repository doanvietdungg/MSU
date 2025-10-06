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

    // Chỉ crawl 20 nhân vật đầu tiên
    const charactersToCrawl = allCharacters.slice(0, 20);
    console.log(`👉 Bắt đầu crawl ${charactersToCrawl.length} nhân vật đầu tiên...`);

    // Delay giữa các request
    const REQUEST_DELAY = 5000; // 5 giây delay giữa các request

  const crawlCharacter = async (char, index) => {
    const tokenId = char.tokenId;
    const detailUrl = `https://msu.io/marketplace/character/${tokenId}`;
    const expectUrl = `https://msu.io/marketplace/api/marketplace/characters/${tokenId}`;

    console.log(`🔎 [${index + 1}/${charactersToCrawl.length}] Đang mở ${detailUrl}`);
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
      characterPriceNeso: 0,
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
      const characterPriceNeso = Number(characterPriceWei) / 1e18;
      summaryEntry.characterPriceWei = characterPriceWei;
      summaryEntry.characterPriceNeso = characterPriceNeso;

      console.log(`💰 Giá nhân vật ${tokenId}: ${characterPriceNeso} Neso (${characterPriceWei} Wei)`);

      // Check giá nhân vật <= 1000000 Neso trước khi crawl vật phẩm
      if (characterPriceNeso > 1000000) {
        console.log(`⏭️ Bỏ qua nhân vật ${tokenId} vì giá ${characterPriceNeso} Neso > 1000000 Neso`);
        return {
          detailJson,
          summaryEntry,
          itemDetails: [],
          tokenId,
          index
        };
      }

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

          const priceNeso = Number(priceWei) / 1e18;

          summaryEntry.items.push({
            itemTokenId: itemToken,
            itemLink: itemUrl,
            priceWei,
            priceNeso,
          });

          if (priceNeso > 0) {
            pricedItems.push({ itemToken, itemUrl, priceNeso });
          }

          itemDetails.push(itemJsonMain || itemJsonTradeHistory);
        } else {
          console.log(`❌ Bỏ qua item ${itemToken} sau 3 lần lỗi`);
        }
      }

      // Send a single consolidated Telegram message per character
      if (pricedItems.length > 0) {
        const itemsLines = pricedItems
          .map((it) => `• [${it.itemToken}](${it.itemUrl}) — ${it.priceNeso} Neso`)
          .join("\n");
        const msg = `💰 *Tìm thấy vật phẩm có giá!*\n👤 Nhân vật: [${tokenId}](${detailUrl})\n💵 Giá nhân vật: ${summaryEntry.characterPriceNeso} Neso\n\n${itemsLines}`;
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

  // === CHẠY TUẦN TỰ 20 NHÂN VẬT ĐẦU ===
  console.log(`🚀 Bắt đầu crawl tuần tự ${charactersToCrawl.length} nhân vật...`);

  for (let i = 0; i < charactersToCrawl.length; i++) {
    const char = charactersToCrawl[i];

    console.log(`⏳ Delay ${REQUEST_DELAY / 1000}s trước khi crawl nhân vật ${i + 1}...`);
    await delay(REQUEST_DELAY);

    const result = await crawlCharacter(char, i);
    if (result) {
      console.log(`✅ Hoàn thành nhân vật ${i + 1}/${charactersToCrawl.length}`);
    } else {
      console.log(`❌ Thất bại nhân vật ${i + 1}/${charactersToCrawl.length}`);
    }

    // Delay thêm sau mỗi nhân vật
    if (i < charactersToCrawl.length - 1) {
      console.log(`⏳ Delay thêm 3s giữa các nhân vật...`);
      await delay(3000);
    }
  }

  console.log(`🎉 Hoàn thành vòng lặp ${loopCounter}!`);
  console.log(`📊 Đã crawl ${charactersToCrawl.length} nhân vật`);
  
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