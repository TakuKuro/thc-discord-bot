require("dotenv").config();
const express = require("express");

const {
  Client,
  GatewayIntentBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

// ---- Render向け: HTTPサーバ ----
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => res.status(200).send("OK"));
app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));

app.listen(PORT, () => console.log(`HTTP server listening on port ${PORT}`));

// ---- ユーティリティ ----
function getJstDateParts() {
  // JST = UTC+9 を UTCメソッドで扱う
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const y = nowJst.getUTCFullYear();
  const m = String(nowJst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowJst.getUTCDate()).padStart(2, "0");
  const hh = nowJst.getUTCHours();
  const mm = nowJst.getUTCMinutes();
  return { y, m, d, hh, mm, dateKey: `${y}-${m}-${d}` };
}

function buildDailyModal() {
  const modal = new ModalBuilder().setCustomId("dailyModal").setTitle("日報");

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

  return modal;
}

async function sendDailyReminder(client, channelId, dateKey) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Reminder channel not found or not text-based");
  }

  const button = new ButtonBuilder()
    .setCustomId("openDailyModal")
    .setLabel("日報を書く")
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(button);

  await channel.send({
    content: `【日報リマインド】${dateKey} の日報を提出してください。`,
    components: [row],
  });
}

// ---- Discord Bot ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

process.on("unhandledRejection", (e) => console.error("unhandledRejection:", e));
process.on("uncaughtException", (e) => console.error("uncaughtException:", e));

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channelId = (process.env.DISCORD_REMIND_CHANNEL_ID || "").trim();
  if (!channelId) {
    console.warn("DISCORD_REMIND_CHANNEL_ID is not set. Reminder disabled.");
    return;
  }

  let lastSentKey = null; // 再起動で消える（DB導入で解消）

  const tick = async () => {
    const { hh, mm, dateKey } = getJstDateParts();

    if (hh === 7 && mm === 10 && lastSentKey !== dateKey) {
      lastSentKey = dateKey;
      try {
        await sendDailyReminder(client, channelId, dateKey);
        console.log("Reminder sent:", dateKey);
      } catch (e) {
        console.error("Failed to send reminder:", e);
      }
    }
  };

  // 起動直後に一回＋毎分チェック
  await tick();
  setInterval(tick, 60 * 1000);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "hello") message.reply("Hello!");
  if (message.content === "山") message.reply("川");
});

client.on("interactionCreate", async (interaction) => {
  // /daily
  if (interaction.isChatInputCommand() && interaction.commandName === "daily") {
    await interaction.showModal(buildDailyModal());
    return;
  }

  // /reminddaily（手動送信）
  if (interaction.isChatInputCommand() && interaction.commandName === "reminddaily") {
    const channelId = (process.env.DISCORD_REMIND_CHANNEL_ID || "").trim();
    if (!channelId) {
      await interaction.reply({ content: "DISCORD_REMIND_CHANNEL_ID が未設定です。", ephemeral: true });
      return;
    }

    // 最低限のガード：管理者権限を要求（なければ誰でも叩ける）
    const member = interaction.member;
    const isAdmin = member?.permissions?.has?.("Administrator");
    if (!isAdmin) {
      await interaction.reply({ content: "このコマンドは管理者のみ実行できます。", ephemeral: true });
      return;
    }

    const { dateKey } = getJstDateParts();

    try {
      await sendDailyReminder(client, channelId, dateKey);
      await interaction.reply({ content: `手動リマインドを送信しました（${dateKey}）。`, ephemeral: true });
    } catch (e) {
      console.error("Failed to send manual reminder:", e);
      await interaction.reply({ content: "送信に失敗しました（ログを確認してください）。", ephemeral: true });
    }
    return;
  }

  // ボタン → モーダル
  if (interaction.isButton() && interaction.customId === "openDailyModal") {
    await interaction.showModal(buildDailyModal());
    return;
  }

  // モーダル送信
  if (interaction.isModalSubmit() && interaction.customId === "dailyModal") {
    const today = interaction.fields.getTextInputValue("today");
    const reflection = interaction.fields.getTextInputValue("reflection");
    const tomorrow = interaction.fields.getTextInputValue("tomorrow");

    console.log("DAILY REPORT", {
      user: interaction.user.tag,
      today,
      reflection,
      tomorrow,
      at: new Date().toISOString(),
    });

    await interaction.reply({ content: "日報を受け取りました。", ephemeral: true });
  }
});

const token = (process.env.DISCORD_TOKEN || "").trim();
if (!token) {
  console.error("DISCORD_TOKEN is missing.");
  process.exit(1);
}
client.login(token);