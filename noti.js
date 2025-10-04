const TELEGRAM_BOT_TOKEN = "8069462425:AAF_U3Yo-plaL7KZVeQmNAfxHxhFk3UQS0k"; // 🔑 thay bằng token bot
const TELEGRAM_CHAT_ID = "-4938863590"; // 💬 id chat hoặc group

const fetch = (await import("node-fetch")).default;
const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: "Hello, world!",
    parse_mode: "Markdown",
  }),
});
