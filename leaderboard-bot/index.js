const {
  Client,
  GatewayIntentBits,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = process.env.PREFIX || '!';
const PLACEHOLDER = '[VACANT]';

if (!TOKEN) {
  console.error('Ошибка: переменная окружения DISCORD_TOKEN не задана.');
  process.exit(1);
}

// Диапазоны мест для каждой команды
const RANGES = {
  [`${PREFIX}top-10`]: { from: 1, to: 10 },
  [`${PREFIX}top-20`]: { from: 11, to: 20 },
  [`${PREFIX}top-30`]: { from: 21, to: 30 },
};

// Discord ID (snowflake) — это только цифры, обычно 17-20 символов
const SNOWFLAKE_RE = /^\d{15,20}$/;

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
 * Если в RANK_N_DISCORD лежит ID пользователя (только цифры) — превращаем
 * его в настоящее кликабельное упоминание <@id>. Если там обычный текст —
 * показываем как есть. Если поле не задано — [VACANT].
 */
function formatDiscordMention(rank) {
  const raw = getField(rank, 'DISCORD');
  if (raw === PLACEHOLDER) return PLACEHOLDER;
  if (SNOWFLAKE_RE.test(raw)) return `<@${raw}>`;
  return raw;
}

/**
 * Строит контейнер с карточками мест для указанного диапазона:
 * каждая карточка — жирный заголовок с ником и пингом, ниже — ссылка,
 * между карточками — настоящий разделитель.
 */
function buildContainer(range) {
  const container = new ContainerBuilder();

  for (let rank = range.from; rank <= range.to; rank++) {
    const robloxName = getField(rank, 'ROBLOX');
    const robloxLink = getField(rank, 'LINK');
    const discordMention = formatDiscordMention(rank);

    const text = `# ${rank}.${robloxName}(${discordMention})\n# ${robloxLink}`;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));

    if (rank !== range.to) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small)
      );
    }
  }

  return container;
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

  const container = buildContainer(range);

  try {
    await message.channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      // Упоминания рендерятся как кликабельные, но не шлют уведомление-пинг
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error('Не удалось отправить сообщение:', err);
  }
});

client.login(TOKEN);
