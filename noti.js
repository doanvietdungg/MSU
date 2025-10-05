import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import fetch from "node-fetch";

// === ⚙️ OPTION TỪ LỆNH CHẠY ===
// Chạy: node crawl_msu.js --use-proxy
const USE_PROXY = process.argv.includes("--use-proxy");
const PROXY_FILE = "proxies.txt";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// === LẤY PROXY NGẪU NHIÊN ===
function getRandomProxy() {
  if (!USE_PROXY || !fs.existsSync(PROXY_FILE)) return null;
  const proxies = fs
    .readFileSync(PROXY_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (proxies.length === 0) return null;
  const proxy = proxies[Math.floor(Math.random() * proxies.length)];
  console.log(`🌐 Dùng proxy: ${proxy}`);
  return proxy;
}

// === TẠO BROWSER CÓ PROXY (KHI CẦN) ===
async function launchBrowserWithProxy() {
  const proxy = getRandomProxy();
  const args = proxy ? [`--proxy-server=${proxy}`] : [];
  return puppeteer.launch({
    headless: true,
    args,
    defaultViewport: null,
  });
}

const TELEGRAM_BOT_TOKEN = "8069462425:AAF_U3Yo-plaL7KZVeQmNAfxHxhFk3UQS0k"; // 🔑 thay bằng token bot
const TELEGRAM_CHAT_ID = "-4938863590"; // 💬 id chat hoặc group

async function sendTelegramMessage(text) {
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
    console.log("⚠️ Telegram gửi lỗi:", err.message);
  }
}

// === MAIN ===
(async () => {
  console.log(`🚀 Khởi động crawler (${USE_PROXY ? "CÓ" : "KHÔNG"} proxy)`);

  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
  });
  const page = await browser.newPage();
  let allCharacters = [];

  // === 1️⃣ LẤY DANH SÁCH NHÂN VẬT ===
  const onResponseList = async (response) => {
    const url = response.url();
    console.log(url);
  
    if (url === "https://msu.io/marketplace/api/marketplace/explore/characters") {
      try {
        const data = await response.json();

        allCharacters = data?.characters || data?.data?.items || [];
        console.log(`📄 Có ${allCharacters.length} nhân vật.`);
        fs.writeFileSync("characters.json", JSON.stringify(allCharacters, null, 2));
        page.off("response", onResponseList);
      } catch {
        console.log("❌ Parse JSON lỗi, retry sau 10s");
        await delay(10000);
      }
    }
  };

  page.on("response", onResponseList);
  await page.goto("https://msu.io/marketplace/character", { waitUntil: "networkidle2" });
  await delay(4000);

  if (allCharacters.length === 0) {
    console.log("⚠️ Không lấy được danh sách nhân vật, dừng.");
    await browser.close();
    return;
  }

  // === 2️⃣ CRAWL CHI TIẾT NHÂN VẬT ===
  const BATCH_SIZE = 10;
  const CONCURRENT_LIMIT = 3;

  const checkpointFile = "checkpoint.json";
  let checkpoint = fs.existsSync(checkpointFile)
    ? JSON.parse(fs.readFileSync(checkpointFile))
    : 0;
  console.log(`⏩ Tiếp tục từ index ${checkpoint}`);

  const resultsFile = "characters_detailed.json";
  let existing = fs.existsSync(resultsFile)
    ? JSON.parse(fs.readFileSync(resultsFile))
    : [];

  const crawlCharacter = async (char, index) => {
    const tokenId = char.tokenId;
    const apiUrl = `https://msu.io/marketplace/api/marketplace/characters/${tokenId}`;
    const pageUrl = `https://msu.io/marketplace/character/${tokenId}`;
    console.log(`🔎 [${index + 1}] Crawl nhân vật ${tokenId}`);

    let json = null;
    while (!json) {
      const crawlBrowser = USE_PROXY ? await launchBrowserWithProxy() : browser;
      const crawlPage = await crawlBrowser.newPage();

      try {
        await crawlPage.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        const res = await crawlPage.waitForResponse((r) => r.url() === apiUrl);
        if (res.status() === 429) {
          console.log(`⚠️ 429 ${tokenId}, nghỉ 5p`);
          await delay(300000);
        } else {
          json = await res.json();
        }
      } catch (e) {
        console.log(`❌ Lỗi crawl ${tokenId}: ${e.message}, retry 5p`);
        await delay(300000);
      }

      await crawlPage.close();
      if (USE_PROXY) await crawlBrowser.close();
    }

    const equip = json?.character?.wearing?.equip || {};
    const itemTokens = Object.values(equip).map((v) => v?.tokenId).filter(Boolean);
    const items = [];

    for (const itemToken of itemTokens) {
      const itemApi = `https://msu.io/marketplace/api/marketplace/items/${itemToken}`;
      const itemUrl = `https://msu.io/marketplace/nft/${itemToken}`;
      let itemJson = null;

      const crawlBrowser = USE_PROXY ? await launchBrowserWithProxy() : browser;
      const itemPage = await crawlBrowser.newPage();

      try {
        await itemPage.goto(itemUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
        const res = await itemPage.waitForResponse((r) => r.url() === itemApi);
        if (res.status() === 429) {
          console.log(`⚠️ 429 item ${itemToken}, nghỉ 5p`);
          await delay(300000);
        } else {
          itemJson = await res.json();
          console.log(`✅ Lấy item ${itemToken}`);
        }
      } catch (e) {
        console.log(`❌ Lỗi item ${itemToken}: ${e.message}`);
      }

      await itemPage.close();
      if (USE_PROXY) await crawlBrowser.close();

      if (itemJson) {
        const priceEth = (Number(itemJson?.salesInfo?.priceWei || 0) / 1e18) || 0;
        if (priceEth > 0) {
          const msg = `💰 *Vật phẩm có giá!*\n👤 Nhân vật [${tokenId}](${pageUrl})\n🎁 Item [${itemToken}](${itemUrl})\n💵 ${priceEth} ETH`;
          await sendTelegramMessage(msg);
        }
        items.push(itemJson);
      }
    }

    return { tokenId, json, items };
  };

  for (let i = checkpoint; i < allCharacters.length; i += BATCH_SIZE) {
    const batch = allCharacters.slice(i, i + BATCH_SIZE);
    console.log(`🚀 Batch ${i + 1}-${i + batch.length}`);

    const promises = [];
    for (let j = 0; j < batch.length; j += CONCURRENT_LIMIT) {
      const part = batch.slice(j, j + CONCURRENT_LIMIT);
      const batchResults = await Promise.allSettled(
        part.map((c, idx) => crawlCharacter(c, i + j + idx))
      );
      promises.push(...batchResults);
      await delay(1000);
    }

    for (const res of promises) {
      if (res.status === "fulfilled" && res.value) {
        existing.push(res.value.json);
      }
    }

    fs.writeFileSync(resultsFile, JSON.stringify(existing, null, 2));
    fs.writeFileSync(checkpointFile, JSON.stringify(i + BATCH_SIZE));
    console.log(`✅ Hoàn thành batch ${i + 1}-${i + batch.length}`);
    await delay(2000);
  }

  console.log("🎉 Crawl hoàn tất!");
  await browser.close();
})();
