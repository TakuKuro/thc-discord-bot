require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

// ---- Render向け: HTTPサーバ ----
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.listen(PORT, () => console.log(`HTTP server listening on port ${PORT}`));

// ---- ここから診断ログ（追加）----
process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("TOKEN exists:", !!process.env.DISCORD_TOKEN);
console.log("TOKEN length:", process.env.DISCORD_TOKEN?.length);

// ---- Discord Bot ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("error", (e) => console.error("discord client error:", e));
client.on("shardError", (e) => console.error("discord shardError:", e));
client.on("warn", (m) => console.warn("discord warn:", m));
client.on("debug", (m) => {
  // 多すぎる場合はコメントアウトしてOK
  // console.log("discord debug:", m);
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "hello") message.reply("Hello!");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "daily") {
    await interaction.reply({
      content: "日報コマンドを受け取った（次はモーダル）",
      ephemeral: true,
    });
  }
});


(async () => {
  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    console.error("DISCORD_TOKEN is missing (empty/undefined). Check Render env vars.");
    process.exit(1);
  }

  console.log("About to login to Discord...");
  try {
    await client.login(token);
    console.log("client.login() resolved");
  } catch (e) {
    console.error("client.login() failed:", e);
    process.exit(1);
  }
})();
