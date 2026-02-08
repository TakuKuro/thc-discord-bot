if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

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
  StringSelectMenuBuilder,
  InteractionType,
  EmbedBuilder
} = require("discord.js");

const { appendRow } = require("./sheets");

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

  const minutesInput = new TextInputBuilder()
    .setCustomId("minutes")
    .setLabel("稼働時間（分・数字のみ）")
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const workInput = new TextInputBuilder()
    .setCustomId("work")
    .setLabel("主な作業内容")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const conditionInput = new TextInputBuilder()
    .setCustomId("condition")
    .setLabel("コンディション（任意）")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  const commentInput = new TextInputBuilder()
    .setCustomId("comment")
    .setLabel("コメント（任意）")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(minutesInput),
    new ActionRowBuilder().addComponents(workInput),
    new ActionRowBuilder().addComponents(conditionInput),
    new ActionRowBuilder().addComponents(commentInput)
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
  content: `@everyone\n【日報リマインド】\n${dateKey} の日報を提出してください。\n必ず、必ず提出してください。`,
  components: [row],
  allowedMentions: { parse: ["everyone"] },
});
}

function getLastNDatesOptions(nDays = 3) {
  const opts = [];
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000); // JST基準の“今日”
  for (let i = 0; i < nDays; i++) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    opts.push({
      label: y+"年"+m+"月"+day+"日",        // 表示
      value: key,        // 内部値
      description: i === 0 ? "今日" : i === 1 ? "昨日" : `${i}日前`,
    });
  }
  return opts;
}

async function postDailyToChannel(client, channelId, data) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error("Post channel not found or not text-based");
  }

  const embed = new EmbedBuilder()
    .setTitle(`--日報（${data.dateKey}）--`)
    .addFields(
      { name: "【提出者】", value: data.displayName, inline: true },
      { name: "【セクション】", value: data.sectionLabel, inline: true },
      { name: "【稼働時間】", value: `${data.minutes} 分`, inline: true },
      { name: "【主な作業内容】", value: data.work || "（未記入）" },
      ...(data.condition ? [{ name: "【コンディション】", value: data.condition }] : []),
      ...(data.comment ? [{ name: "【コメント】", value: data.comment }] : [])
    )
    .setTimestamp(new Date(data.submittedAt));

  await channel.send({ embeds: [embed] });
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

    if (hh === 22 && mm === 0 && lastSentKey !== dateKey) {
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
  if (message.content === "山") message.reply("川");
  if (message.content === "ああ言えば") message.reply("こう言う");
  if (message.content === "そうだね") message.reply("それな");
  if (message.content === "ありがとう") message.reply("僕からもありがとう！");
  if (message.content === "ありがとう！") message.reply("僕からもありがとう！");
  if (message.content === "ありがとう！！") message.reply("僕からもありがとう！");
  if (message.content === "ありがとう！！！") message.reply("僕からもありがとう！");
});

client.on("interactionCreate", async (interaction) => {
  // /daily
  if (interaction.isChatInputCommand() && interaction.commandName === "daily") {
    const menu = new StringSelectMenuBuilder()
        .setCustomId("pickDate")
        .setPlaceholder("日付を選んでください")
        .addOptions(getLastNDatesOptions(3));

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
        content: "まず日付を選んでください。",
        components: [row],
        ephemeral: true,
    });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "pickDate") {
    const dateKey = interaction.values[0];

    const sectionMenu = new StringSelectMenuBuilder()
        .setCustomId(`pickSection:${dateKey}`)
        .setPlaceholder("セクションを選んでください")
        .addOptions(
        { label: "稽古", value: "rehearsal" },
        { label: "俳優(稽古外)", value: "actor" },
        { label: "広報", value: "pr" },
        { label: "舞台", value: "stage" },
        { label: "衣装", value: "cloth" },
        { label: "音響", value: "sound" },
        { label: "照明", value: "light" },
        { label: "宣伝美術", value: "Ad" },
        { label: "小道具", value: "prop" },
        { label: "制作", value: "production" },
        { label: "舞台監督", value: "stagemanager" },
        { label: "脚本", value: "script" },
        { label: "演出(稽古外)", value: "direction" },
        { label: "企画制作", value: "productionmanage" },
        { label: "主宰", value: "predident" },
        { label: "その他", value: "other" }
        );

    const row = new ActionRowBuilder().addComponents(sectionMenu);

    await interaction.update({
        content: `日付: ${dateKey}\n次にセクションを選んでください。`,
        components: [row],
    });
    return;
  }

  
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("pickSection:")) {
    const dateKey = interaction.customId.split(":")[1];
    const section = interaction.values[0];

    const modal = buildDailyModal(); // 既存のやつ

    // customIdを差し替え（date/sectionを埋め込む）
    modal.setCustomId(`dailyModal:${dateKey}:${section}`);

    await interaction.showModal(modal);
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
    const menu = new StringSelectMenuBuilder()
        .setCustomId("pickDate")
        .setPlaceholder("日付を選んでください")
        .addOptions(getLastNDatesOptions(3));

    const row = new ActionRowBuilder().addComponents(menu);

    await interaction.reply({
        content: "まず日付を選んでください。",
        components: [row],
        ephemeral: true,
    });
    return;
  }

  // モーダル送信
if (interaction.isModalSubmit() && interaction.customId.startsWith("dailyModal:")) {
  const [, dateKey, section] = interaction.customId.split(":");

  // 入力取得（あなたの customId に合わせる）
  const minutesRaw = interaction.fields.getTextInputValue("minutes");
  const work = interaction.fields.getTextInputValue("work");
  const condition = interaction.fields.getTextInputValue("condition") || "";
  const comment = interaction.fields.getTextInputValue("comment") || "";

  // minutes バリデーション
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440) {
    await interaction.reply({
      content: "稼働時間は 0〜1440 の整数（分）で入力してください。",
      ephemeral: true,
    });
    return;
  }

  // SHEETに記載する行
  const displayName =
    interaction.member?.nickname ||
    interaction.user.username;

  const SECTION_LABELS = {
    rehearsal: "稽古",
    actor: "俳優(稽古外)",
    pr: "広報",
    stage: "舞台",
    cloth: "衣装",
    sound: "音響",
    light: "照明",
    Ad: "宣伝美術",
    prop: "小道具",
    production: "制作",
    stagemanager: "舞台監督",
    script: "脚本",
    direction: "演出(稽古外)",
    productionmanage: "企画制作",
    president: "主宰",
    other: "その他"
  };

  const sectionLabel = SECTION_LABELS[section] ?? section;

  const submittedAt = new Date().toISOString();

  const row = [
    submittedAt,
    interaction.user.id,
    displayName,
    dateKey,
    sectionLabel,
    minutes,
    work,
    condition,
    comment,
  ];

  let postError = null;

  // ✅ 返信はここで一回だけ
  try {
    await appendRow(row);

    const postChannelId = (process.env.DAILY_POST_CHANNEL_ID || "").trim();
    if (postChannelId) {
        try {
        await postDailyToChannel(client, postChannelId, {
            dateKey,
            sectionLabel,
            minutes,
            work,
            condition,
            comment,
            displayName,
            submittedAt,
        });
        } catch (e) {
        postError = e;
        console.error("[Daily] post failed:", e);
        }
    }

    await interaction.reply({
    content: postError
      ? "日報は保存しましたが、チャンネル投稿に失敗しました（ログ確認）。"
      : "日報を保存し、チャンネルに投稿しました。",
    ephemeral: true,
  });
} catch (e) {
  console.error("[Daily] save failed:", e);
  await interaction.reply({
    content: "保存に失敗しました（ログを確認してください）。",
    ephemeral: true,
  });
}
return;
}
});

const token = (process.env.DISCORD_TOKEN || "").trim();
if (!token) {
  console.error("DISCORD_TOKEN is missing.");
  process.exit(1);
}
client.login(token)
  .then(() => console.log("Discord login OK"))
  .catch(e => console.error("Discord login failed:", e));