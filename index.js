require("dotenv").config();
const express = require("express");

const {
  Client,
  GatewayIntentBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");

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
  // /daily（スラッシュ）
  if (interaction.isChatInputCommand() && interaction.commandName === "daily") {
    const modal = new ModalBuilder()
      .setCustomId("dailyModal")
      .setTitle("日報");

    const todayInput = new TextInputBuilder()
      .setCustomId("today")
      .setLabel("今日やったこと")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    const reflectionInput = new TextInputBuilder()
      .setCustomId("reflection")
      .setLabel("所感・学び")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    const tomorrowInput = new TextInputBuilder()
      .setCustomId("tomorrow")
      .setLabel("明日やること")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(todayInput),
      new ActionRowBuilder().addComponents(reflectionInput),
      new ActionRowBuilder().addComponents(tomorrowInput)
    );

    await interaction.showModal(modal);
    return;
  }

  // モーダル送信時
  if (interaction.isModalSubmit() && interaction.customId === "dailyModal") {
    const today = interaction.fields.getTextInputValue("today");
    const reflection = interaction.fields.getTextInputValue("reflection");
    const tomorrow = interaction.fields.getTextInputValue("tomorrow");

    // まずはログ（次でDBにする）
    console.log("DAILY REPORT", {
      user: interaction.user.tag,
      today,
      reflection,
      tomorrow,
      at: new Date().toISOString(),
    });

    await interaction.reply({
      content: "日報を受け取りました。",
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
