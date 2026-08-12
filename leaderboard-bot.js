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

async function updateLeaderboardMessage() {
  if (!leaderboardMessageId || !leaderboardChannelId) return;

  try {
    const channel = client.channels.cache.get(leaderboardChannelId) || 
                    await client.channels.fetch(leaderboardChannelId);
    
    if (!channel) return;
    
    const msg = await channel.messages.fetch(leaderboardMessageId);
    const lbText = formatLeaderboard(1, 30);
    
    const embed = new EmbedBuilder()
      .setTitle('⚡ VORTEX LEADERBOARD ⚡')
      .setColor(0x87A9EC)
      .setDescription(lbText)
      .setFooter({ text: 'Нажми на кнопку ниже, чтобы атаковать место в лидерборде' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('attack_place')
        .setLabel('Атаковать место')
        .setStyle(ButtonStyle.Primary)
    );

    await msg.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('Ошибка обновления сообщения:', err);
  }
}

// ============= Bot Events =============
client.once('ready', () => {
  console.log(`Бот запущен как ${client.user.tag}`);
});

function getPlayerPlace(userId) {
  for (const [place, data] of Object.entries(leaderboard)) {
    if (data.userId === userId) {
      return parseInt(place);
    }
  }
  return null;
}
async function announceDuel(
  channel,
  attackerUser,
  place,
  discord,
  roblox,
  link
) {
  const defenderData = leaderboard[place];

  const embed = new EmbedBuilder()
    .setTitle('⚔️ ДУЭЛЬ ⚔️')
    .setColor(0xff0000)
    .setDescription(
      `**${attackerUser.username}** атакует место **${place}**!\n\n**${defenderData.discord}** защищается.`
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`duel_win_${attackerUser.id}`)
      .setLabel('Атакующий выиграл')
      .setStyle(ButtonStyle.Danger)
  );

  const duelMessage = await channel.send({
    embeds: [embed],
    components: [row],
  });

  const duelId = `${place}_${Date.now()}`;

  duels[duelId] = {
    duelId,
    messageId: duelMessage.id,

    targetPlace: place,

    attackerId: attackerUser.id,

    attackerDiscord: discord,
    attackerRoblox: roblox,
    attackerLink: link,

    defenderId: defenderData.userId,

    expiresAt:
      Date.now() +
      3 * 24 * 60 * 60 * 1000,
  };

  saveDuels(duels);

  return true;
}
client.on('interactionCreate', async (interaction) => {
  // Modal submission (форма от /claim)
  if (interaction.isModalSubmit()) {

  const place = parseInt(
    interaction.fields.getTextInputValue(
      "place_input"
    )
  );

  const discord =
    interaction.fields.getTextInputValue(
      "discord_input"
    );

  const roblox =
    interaction.fields.getTextInputValue(
      "roblox_input"
    );

  const link =
    interaction.fields.getTextInputValue(
      "link_input"
    );

  if (
    !place ||
    place < 1 ||
    place > 30
  ) {
    return interaction.reply({
      content:
        "❌ Место должно быть от 1 до 30",
      ephemeral: true,
    });
  }

  const currentPlace =
    getPlayerPlace(
      interaction.user.id
    );

  // нельзя атаковать себя

  if (
    currentPlace &&
    currentPlace === place
  ) {
    return interaction.reply({
      content:
        "❌ Нельзя атаковать своё место.",
      ephemeral: true,
    });
  }

  // нельзя атаковать вниз

  if (
    currentPlace &&
    place > currentPlace
  ) {
    return interaction.reply({
      content:
        `❌ Нельзя атаковать места ниже ${currentPlace}.`,
      ephemeral: true,
    });
  }

  const target =
    leaderboard[place];

  // место свободно

  if (
    target.discord ===
    "[VACANT]"
  ) {

    // игрок уже был в лб

    if (currentPlace) {

      leaderboard[
        currentPlace
      ] = {
        discord: "[VACANT]",
        roblox: "[VACANT]",
        link: "[VACANT]",
        userId: null,
      };
    }

    leaderboard[place] = {
      discord,
      roblox,
      link,
      userId:
        interaction.user.id,
    };

    saveLeaderboard(
      leaderboard
    );

    await updateLeaderboardMessage();

    return interaction.reply({
      content:
        `✅ Вы заняли место ${place}`,
      ephemeral: true,
    });
  }

  // место занято

  if (
    target.userId ===
    interaction.user.id
  ) {
    return interaction.reply({
      content:
        "❌ Нельзя атаковать самого себя.",
      ephemeral: true,
    });
  }

  const duelChannel =
    client.channels.cache.get(
      process.env
        .DUELS_CHANNEL_ID
    );

  if (!duelChannel) {
    return interaction.reply({
      content:
        "❌ Канал дуэлей не найден.",
      ephemeral: true,
    });
  }

  await announceDuel(
    duelChannel,
    interaction.user,
    place,
    discord,
    roblox,
    link
  );

  return interaction.reply({
    content:
      `⚔️ Дуэль за место ${place} создана.`,
    ephemeral: true,
  });
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
    if (
  interaction.customId.startsWith(
    "duel_win_"
  )
) {

  const attackerId =
    interaction.customId.replace(
      "duel_win_",
      ""
    );

  let duelId = null;
  let duelData = null;

  for (const [id, duel] of Object.entries(duels)) {

    if (
      duel.messageId ===
        interaction.message.id &&
      duel.attackerId ===
        attackerId
    ) {
      duelId = id;
      duelData = duel;
      break;
    }
  }

  if (!duelData) {
    return interaction.reply({
      content:
        "❌ Дуэль не найдена.",
      ephemeral: true,
    });
  }

  const targetPlace =
    duelData.targetPlace;

  const attackerOldPlace =
    getPlayerPlace(
      duelData.attackerId
    );

  const defenderData = {
    ...leaderboard[targetPlace]
  };

  // ==================================
  // АТАКУЮЩИЙ УЖЕ БЫЛ В ЛБ
  // ==================================

  if (
    attackerOldPlace &&
    attackerOldPlace !==
      targetPlace
  ) {

    const attackerData = {
      ...leaderboard[
        attackerOldPlace
      ]
    };

    leaderboard[targetPlace] =
      attackerData;

    leaderboard[
      attackerOldPlace
    ] = defenderData;
  }

  // ==================================
  // АТАКУЮЩЕГО НЕ БЫЛО В ЛБ
  // ==================================

  else {

    leaderboard[targetPlace] = {
      discord:
        duelData.attackerDiscord,

      roblox:
        duelData.attackerRoblox,

      link:
        duelData.attackerLink,

      userId:
        duelData.attackerId,
    };
  }

  saveLeaderboard(
    leaderboard
  );

  delete duels[duelId];

  saveDuels(duels);

  await updateLeaderboardMessage();

  await interaction.reply({
    content:
      `🏆 Победа!\nМесто ${targetPlace} теперь принадлежит ${duelData.attackerDiscord}`,
    ephemeral: true,
  });

  try {
    await interaction.message.edit({
      components: [],
    });
  } catch {}
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
  if (message.content === '!leader-board') {
    const lbText = formatLeaderboard(1, 30);
    
    const embed = new EmbedBuilder()
      .setTitle('⚡ VORTEX LEADERBOARD ⚡')
      .setColor(0x87A9EC)
      .setDescription(lbText)
      .setFooter({ text: 'Нажми на кнопку ниже, чтобы атаковать место в лидерборде' });

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
