require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");

// ---- Render向け: HTTPサーバ（必須） ----
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

// ---- Discord Bot ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "hello") {
    message.reply("Hello!");
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN is missing. Set it in environment variables.");
  process.exit(1);
}
client.login(token);
