const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const PLACEHOLDER = '[VACANT]';

if (!TOKEN) {
  console.error('Ошибка: переменная окружения DISCORD_TOKEN не задана.');
  process.exit(1);
}

// Диапазоны мест для каждой команды
const RANGES = {
  [`${PREFIX}top-10`]: { from: 1, to: 10, title: 'Топ 1–10' },
  [`${PREFIX}top-20`]: { from: 11, to: 20, title: 'Топ 11–20' },
  [`${PREFIX}top-30`]: { from: 21, to: 30, title: 'Топ 21–30' },
};

/**
 * Возвращает значение переменной окружения для конкретного места/поля,
 * либо заглушку [VACANT], если переменная не задана или пустая.
 */
function getField(rank, field) {
  const value = process.env[`RANK_${rank}_${field}`];
  if (value === undefined || value === null || value.trim() === '') {
    return PLACEHOLDER;
  }
  return value.trim();
}

/**
 * Формирует одну строку таблицы лидеров для указанного места.
 */
function formatLine(rank) {
  const discordName = getField(rank, 'DISCORD');
  const robloxName = getField(rank, 'ROBLOX');
  const robloxLink = getField(rank, 'LINK');
  return `${rank}. ${discordName} | ${robloxName} | ${robloxLink}`;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();
  const range = RANGES[content];
  if (!range) return;

  const lines = [];
  for (let rank = range.from; rank <= range.to; rank++) {
    lines.push(formatLine(rank));
  }

  const embed = new EmbedBuilder()
    .setTitle(range.title)
    .setDescription(lines.join('\n'))
    .setColor(0x5865f2);

  try {
    await message.channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Не удалось отправить сообщение:', err);
  }
});

client.login(TOKEN);
