require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const token = (process.env.DISCORD_TOKEN || "").trim();
const clientId = (process.env.DISCORD_CLIENT_ID || "").trim();
const guildId = (process.env.DISCORD_GUILD_ID || "").trim();

if (!token || !clientId || !guildId) {
  console.error("Missing env vars: DISCORD_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("日報を提出する"),
  new SlashCommandBuilder()
    .setName("reminddaily")
    .setDescription("【手動】日報リマインドを送信する"),
].map((c) => c.toJSON());

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log("Registering guild commands...");
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log("Done.");
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
