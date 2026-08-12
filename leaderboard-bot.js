const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  TextInputBuilder,
  ModalBuilder,
  ButtonStyle,
  TextInputStyle,
  ChannelType,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// ============= JSON Storage =============
const LEADERBOARD_FILE = 'leaderboard.json';
const DUELS_FILE = 'duels.json';

function loadLeaderboard() {
  if (fs.existsSync(LEADERBOARD_FILE)) {
    return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
  }
  // Initialize with 30 empty slots
  const lb = {};
  for (let i = 1; i <= 30; i++) {
    lb[i] = { discord: '[VACANT]', roblox: '[VACANT]', link: '[VACANT]', userId: null };
  }
  return lb;
}

function saveLeaderboard(lb) {
  fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(lb, null, 2));
}

function loadDuels() {
  if (fs.existsSync(DUELS_FILE)) {
    return JSON.parse(fs.readFileSync(DUELS_FILE, 'utf8'));
  }
  return {};
}

function saveDuels(duels) {
  fs.writeFileSync(DUELS_FILE, JSON.stringify(duels, null, 2));
}

let leaderboard = loadLeaderboard();
let duels = loadDuels();
let leaderboardMessageId = process.env.LEADERBOARD_MESSAGE_ID || null;
let leaderboardChannelId = process.env.LEADERBOARD_CHANNEL_ID || null;

// ============= Utility Functions =============
function formatLeaderboard(start, end) {
  let text = '';
  for (let i = start; i <= end; i++) {
    const entry = leaderboard[i];
    text += `**${i}.** ${entry.discord} | ${entry.roblox} | ${entry.link}\n`;
  }
  return text || 'Ошибка загрузки лидерборда';
}

async function updateLeaderboardMessage(channel) {
  if (!leaderboardMessageId || !leaderboardChannelId) return;

  try {
    const msg = await channel.messages.fetch(leaderboardMessageId);
    const embed = new EmbedBuilder()
      .setTitle('⚡ VORTEX LEADERBOARD ⚡')
      .setColor(0x87A9EC)
      .setDescription('Нажми на кнопку ниже, чтобы атаковать место в лидерборде');

    await msg.edit({ embeds: [embed] });
  } catch (err) {
    console.error('Ошибка обновления сообщения:', err);
  }
}

async function announceDuel(channel, attacker, attackerTag, defender, place) {
  const embed = new EmbedBuilder()
    .setTitle('⚔️ ДУЭЛЬ ⚔️')
    .setColor(0xff0000)
    .setDescription(
      `**${attacker}** атакует место **${place}**!\n\n**${defender}** защищается.`
    )
    .setFooter({ text: 'Таймер: 3 дня. После времени место не изменится, если защитник не проиграет.' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`duel_win_${attackerTag}`)
      .setLabel('Атакующий выиграл')
      .setStyle(ButtonStyle.Danger)
  );

  const msg = await channel.send({ embeds: [embed], components: [row] });

  // Сохраняем дуэль в памяти
  const duelId = `${place}_${Date.now()}`;
  duels[duelId] = {
    messageId: msg.id,
    place,
    attacker,
    attackerTag,
    defender,
    defenderTag: leaderboard[place].userId,
    expiresAt: Date.now() + 3 * 24 * 60 * 60 * 1000, // 3 дня
  };
  saveDuels(duels);

  // Таймер на 3 дня
  setTimeout(() => {
    if (duels[duelId]) {
      delete duels[duelId];
      saveDuels(duels);
      msg.edit({ components: [] }).catch(() => {});
    }
  }, 3 * 24 * 60 * 60 * 1000);
}

// ============= Bot Events =============
client.once('ready', () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  // Modal submission (форма от /claim)
  if (interaction.isModalSubmit()) {
    const place = parseInt(interaction.fields.getTextInputValue('place_input'));
    const discord = interaction.fields.getTextInputValue('discord_input') || '[VACANT]';
    const roblox = interaction.fields.getTextInputValue('roblox_input') || '[VACANT]';
    const link = interaction.fields.getTextInputValue('link_input') || '[VACANT]';

    if (!place || place < 1 || place > 30) {
      return interaction.reply({ content: '❌ Место должно быть от 1 до 30', ephemeral: true });
    }

    const currentEntry = leaderboard[place];

    // Проверка: занято ли место?
    if (currentEntry.discord === '[VACANT]') {
      // Свободно — занимаем
      leaderboard[place] = {
        discord,
        roblox,
        link,
        userId: interaction.user.id,
      };
      saveLeaderboard(leaderboard);

      await interaction.reply({
        content: `✅ Вы заняли место **${place}**!\n${discord} | ${roblox} | ${link}`,
        ephemeral: true,
      });

      // Обновляем лидерборд в основном сообщении
      const channel = client.channels.cache.get(leaderboardChannelId);
      if (channel) {
        await updateLeaderboardMessage(channel);
      }
    } else {
      // Занято — объявляем дуэль
      const channel = client.channels.cache.get(process.env.DUELS_CHANNEL_ID);
      if (channel) {
        const defender = currentEntry.discord;
        await announceDuel(channel, interaction.user.username, interaction.user.id, defender, place);
      }

      await interaction.reply({
        content: `⚔️ Место **${place}** занято! Объявлена дуэль с **${currentEntry.discord}**`,
        ephemeral: true,
      });
    }
  }

  // Button click: "Атаковать место"
  if (interaction.isButton()) {
    if (interaction.customId === 'attack_place') {
      const modal = new ModalBuilder()
        .setCustomId('claim_modal')
        .setTitle('Претензия на место в лидерборде');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('place_input')
            .setLabel('На какое место претендуете? (1-30)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('discord_input')
            .setLabel('Ник Discord')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('roblox_input')
            .setLabel('Ник Roblox')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('link_input')
            .setLabel('Ссылка на профиль Roblox')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
    }

    // Обработка "Атакующий выиграл"
    if (interaction.customId.startsWith('duel_win_')) {
      const attackerTag = interaction.customId.replace('duel_win_', '');

      // Найти дуэль
      let duelId = null;
      let duelData = null;

      for (const [id, duel] of Object.entries(duels)) {
        if (duel.attackerTag === attackerTag && duel.messageId === interaction.message.id) {
          duelId = id;
          duelData = duel;
          break;
        }
      }

      if (!duelData) {
        return interaction.reply({ content: '❌ Дуэль не найдена', ephemeral: true });
      }

      const place = duelData.place;
      const attackerData = leaderboard[duelData.attackerTag];
      const defenderPlace = Object.entries(leaderboard).find(
        ([_, entry]) => entry.userId === duelData.defenderTag
      )?.[0];

      // Своп
      leaderboard[place] = {
        discord: duelData.attacker,
        roblox: attackerData?.roblox || '[VACANT]',
        link: attackerData?.link || '[VACANT]',
        userId: duelData.attackerTag,
      };

      if (defenderPlace) {
        // Защитник был в лидерборде — переместить на его старое место
        leaderboard[defenderPlace] = {
          discord: duelData.defender,
          roblox: duelData.defender, // Используем имя как плейсхолдер
          link: '[VACANT]',
          userId: duelData.defenderTag,
        };
      } else {
        // Защитник НЕ был в лидерборде — удалить его место
        leaderboard[place] = {
          discord: duelData.attacker,
          roblox: attackerData?.roblox || '[VACANT]',
          link: attackerData?.link || '[VACANT]',
          userId: duelData.attackerTag,
        };
      }

      saveLeaderboard(leaderboard);
      delete duels[duelId];
      saveDuels(duels);

      await interaction.reply({
        content: `✅ **${duelData.attacker}** выиграл дуэль!\n🏆 Новое место: **${place}**`,
        ephemeral: true,
      });

      // Обновить основной лидерборд
      const mainChannel = client.channels.cache.get(leaderboardChannelId);
      if (mainChannel) {
        await updateLeaderboardMessage(mainChannel);
      }

      // Удалить кнопку с сообщения дуэли
      await interaction.message.edit({ components: [] });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // !top-10 (места 1-10)
  if (message.content === '!top-10') {
    const text = formatLeaderboard(1, 10);
    await message.reply({
      content: `**TOP 1-10**\n\n${text}`,
      allowedMentions: { repliedUser: false },
    });
  }

  // !top-20 (места 11-20)
  if (message.content === '!top-20') {
    const text = formatLeaderboard(11, 20);
    await message.reply({
      content: `**TOP 11-20**\n\n${text}`,
      allowedMentions: { repliedUser: false },
    });
  }

  // !top-30 (места 21-30)
  if (message.content === '!top-30') {
    const text = formatLeaderboard(21, 30);
    await message.reply({
      content: `**TOP 21-30**\n\n${text}`,
      allowedMentions: { repliedUser: false },
    });
  }

  // !leaderboard - создать основное сообщение с кнопкой
  if (message.content === '!leaderboard') {
    const embed = new EmbedBuilder()
      .setTitle('⚡ VORTEX LEADERBOARD ⚡')
      .setColor(0x87A9EC)
      .setDescription('Нажми на кнопку ниже, чтобы атаковать место в лидерборде');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('attack_place')
        .setLabel('Атаковать место')
        .setStyle(ButtonStyle.Primary)
    );

    const msg = await message.reply({ embeds: [embed], components: [row] });
    leaderboardMessageId = msg.id;
    leaderboardChannelId = message.channelId;

    // Сохранить переменные для Railway
    console.log(`Сохрани в Railway переменные:`);
    console.log(`LEADERBOARD_MESSAGE_ID=${msg.id}`);
    console.log(`LEADERBOARD_CHANNEL_ID=${message.channelId}`);
    console.log(`DUELS_CHANNEL_ID={id канала для дуэлей}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
