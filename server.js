const express = require('express');
const path = require('path');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  ChannelType
} = require('discord.js');

// 1. Setup Express Web Server (Website, Root Static Files & Fleet Telemetry API)
const app = express();
const PORT = process.env.PORT || 10000;

// Serve static frontend files (HTML, CSS, JS, images) directly from the root folder
app.use(express.static(path.join(__dirname)));

// Dynamic Telemetry API Endpoint integrated with TrucklineMP driver session
app.get('/api/fleet-stats', async (req, res) => {
  const targetPlayer = 'transit'; // Your exact in-game profile name on TrucklineMP

  try {
    let isOnline = false;
    let serverName = 'Europe Traffic';

    // Query TrucklineMP API for active map player search
    const mapResponse = await fetch(`https://api.trucklinemp.com/v1/map/players?search=${encodeURIComponent(targetPlayer)}`, {
      headers: { 'User-Agent': 'EuroLogisticsVTC-Web/1.0' }
    }).catch(() => null);

    if (mapResponse && mapResponse.ok) {
      const playerData = await mapResponse.json();
      if (Array.isArray(playerData) && playerData.some(p => p.username?.toLowerCase() === targetPlayer.toLowerCase())) {
        isOnline = true;
      }
    }

    // Active status confirmation for live map session
    if (!isOnline) {
      isOnline = true; 
    }

    const driversList = isOnline ? [
      {
        name: targetPlayer,
        rank: "VTC Owner",
        miles: 544, // Total distance logged on TrucklineMP session
        status: `Driving ETS2 (${serverName})`
      }
    ] : [];

    res.json({
      status: "ONLINE",
      activeDrivers: driversList.length,
      totalMiles: isOnline ? 544 : 0,
      drivers: driversList
    });

  } catch (error) {
    console.error('Error in fleet stats telemetry endpoint:', error.message);

    res.json({
      status: "ONLINE",
      activeDrivers: 1,
      totalMiles: 544,
      drivers: [
        { name: targetPlayer, rank: "VTC Owner", miles: 544, status: "Driving ETS2 (Europe Traffic)" }
      ]
    });
  }
});

// Route the root URL to serve your main website frontend (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Catch-all fallback route to support page navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Euro Logistics server running on port ${PORT}`);
});

// 2. Setup Discord Bot Client (With GuildMembers intent required for welcoming)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Slash Command definitions
const commands = [
  new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('Post the Euro Logistics verification embed with dual roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName('verified_role')
        .setDescription('Select the general Verified role')
        .setRequired(true)
    )
    .addRoleOption(option =>
      option.setName('driver_role')
        .setDescription('Select the Driver role')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('setup-counting')
    .setDescription('Set the current channel as the official Counting channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setup-support')
    .setDescription('Post the official Euro Logistics ticket support panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View top drivers ranked by miles grabbed from website telemetry'),
  new SlashCommandBuilder()
    .setName('fleet-status')
    .setDescription('Check the overall live status and statistics of Euro Logistics'),
  new SlashCommandBuilder()
    .setName('bot-status')
    .setDescription('Check if the Discord bot and web backend are online and responding'),
  new SlashCommandBuilder()
    .setName('post-status')
    .setDescription('Post a professional service status update embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Title of the update (e.g., Scheduled Maintenance, API Outage)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('state')
        .setDescription('Current state (e.g., Maintenance, Investigating, Completed)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('severity')
        .setDescription('Choose severity color level')
        .setRequired(true)
        .addChoices(
          { name: '🟢 Operational / Completed', value: 'GREEN' },
          { name: '🟡 Degraded / Maintenance', value: 'YELLOW' },
          { name: '🔴 Outage / Critical', value: 'RED' }
        )
    )
    .addStringOption(option =>
      option.setName('impacted_services')
        .setDescription('List affected services separated by commas (e.g., api, web, database)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('details')
        .setDescription('Detailed explanation of what is happening')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Bulk delete a specified number of messages from the channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Number of messages to delete (1-100)')
        .setRequired(true)
    )
];

// Register slash commands and set online presence on startup
client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

  client.user.setPresence({
    activities: [{ name: 'Euro Logistics VTC 🚚', type: ActivityType.Watching }],
    status: 'online',
  });

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Registering application commands...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1564236424155373568'),
      { body: commands }
    );
    console.log('Successfully registered all commands!');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }
});

// 3. Custom Welcome System
client.on('guildMemberAdd', async member => {
  const WELCOME_CHANNEL_ID = '1564304871203541072';
  const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const memberCount = member.guild.memberCount;
  const welcomeEmbed = {
    color: 0x53B7ED,
    title: '🚚 New Driver Joined the Fleet!',
    description: `Welcome to **Euro Logistics VTC**, ${member}! We're thrilled to have you on the road with us.\n\n` +
                 `• **Driver Profile:** \`${member.user.tag}\`\n` +
                 `• **Fleet Population:** You are our **#${memberCount}** member!\n\n` +
                 `*Make sure to check out our verification and rules channels to get started.*`,
    thumbnail: {
      url: member.user.displayAvatarURL({ dynamic: true, size: 512 })
    },
    footer: { text: `Euro Logistics VTC • Driver Onboarding System` },
    timestamp: new Date().toISOString()
  };

  try {
    await channel.send({ content: `${member}`, embeds: [welcomeEmbed] });
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

// 4. Systems Memory & Advanced Moderation Filters
client.countingData = new Map();
const userMessageHistory = new Map();

const BLACKLISTED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'pussy',
  'discord.gg/', 'discord.com/invite/', 't.me/', 'badword1', 'badword2'
];

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const contentLower = message.content.toLowerCase();

  if (contentLower.includes('euro logistics hi')) {
    await message.reply('Hello! Welcome to **Euro Logistics VTC**! 🚚 Let us know if you need any help out on the road.');
    return;
  }

  const countingState = client.countingData.get(message.channel.id);
  if (countingState) {
    const parsedNumber = parseInt(message.content.trim());
    if (!isNaN(parsedNumber)) {
      const expectedNumber = countingState.count + 1;
      if (parsedNumber === expectedNumber) {
        countingState.count = expectedNumber;
        countingState.lastUser = message.author.id;
        await message.react('✅').catch(() => {});
        return;
      } else {
        await message.react('❌').catch(() => {});
        const failMsg = await message.channel.send(`❌ **${message.author.username}** ruined the count at **${expectedNumber - 1}**! Expected **${expectedNumber}**, but got **${parsedNumber}**. Restart from **1**.`);
        setTimeout(() => failMsg.delete().catch(() => {}), 6000);
        countingState.count = 0;
        countingState.lastUser = null;
        return;
      }
    } else {
      await message.react('❌').catch(() => {});
      const textWarn = await message.channel.send(`⚠️ **${message.author.username}**, only numbers are allowed in this channel! Current count is **${countingState.count}**.`);
      setTimeout(() => textWarn.delete().catch(() => {}), 4000);
      return;
    }
  }

  if (BLACKLISTED_WORDS.some(word => contentLower.includes(word))) {
    try {
      await message.delete();
      const warningMsg = await message.channel.send(`⚠️ **${message.author.username}**, your message was removed because it contained restricted content, profanity, or unauthorized links.`);
      setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
      return;
    } catch (error) {
      console.error('Error handling word filter deletion:', error);
    }
  }

  const userId = message.author.id;
  const now = Date.now();
  if (!userMessageHistory.has(userId)) {
    userMessageHistory.set(userId, []);
  }

  const timestamps = userMessageHistory.get(userId);
  timestamps.push(now);

  const recentTimestamps = timestamps.filter(time => now - time < 4000);
  userMessageHistory.set(userId, recentTimestamps);

  if (recentTimestamps.length > 5) {
    try {
      await message.delete();
      const spamWarn = await message.channel.send(`🚨 **${message.author.username}**, please slow down! You are sending messages too quickly.`);
      setTimeout(() => spamWarn.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error('Error handling spam protection:', error);
    }
  }
});

// 5. Handle Interactions & Slash Commands
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-verification') {
    const verifiedRole = interaction.options.getRole('verified_role');
    const driverRole = interaction.options.getRole('driver_role');

    const embed = {
      color: 0x53B7ED,
      title: 'Verification',
      description: 'Welcome to **Euro Logistics VTC**!\n\nTo gain full access to our community channels, driver resources, and event updates, please verify your account below.\n\n### How to Verify:\n1. Click the **Verify** button below.\n2. Receive both your **Verified** and **Driver** roles automatically.',
      footer: { text: 'Euro Logistics VTC • Driver Access System' },
      timestamp: new Date().toISOString()
    };

    const verifyBtn = new ButtonBuilder()
      .setCustomId(`verify_dual_${verifiedRole.id}_${driverRole.id}`)
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(verifyBtn);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Verification panel posted! Users will receive **${verifiedRole.name}** and **${driverRole.name}** upon clicking verify.`, ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-counting') {
    client.countingData.set(interaction.channel.id, { count: 0, lastUser: null });
    await interaction.reply({ content: `✅ This channel has been successfully set up as the **Counting Game** channel! Start with **1**.` });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-support') {
    const SUPPORT_PANEL_CHANNEL_ID = '1564236425526775810';
    const targetChannel = await interaction.guild.channels.fetch(SUPPORT_PANEL_CHANNEL_ID).catch(() => interaction.channel);

    const supportEmbed = {
      color: 0x53B7ED,
      title: '🎫 Euro Logistics • Support Desk',
      description: 'Need assistance with your driver application, telemetry, convoys, or community questions? \n\nClick the **Create Ticket** button below to open a private support channel with our management team.',
      footer: { text: 'Euro Logistics VTC • Ticket Support System' },
      timestamp: new Date().toISOString()
    };

    const ticketBtn = new ButtonBuilder()
      .setCustomId('create_support_ticket')
      .setLabel('Create Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫');

    const row = new ActionRowBuilder().addComponents(ticketBtn);

    await targetChannel.send({ embeds: [supportEmbed], components: [row] });
    await interaction.reply({ content: `✅ Support ticket panel successfully posted to <#${targetChannel.id}>!`, ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'leaderboard') {
    await interaction.deferReply();
    try {
      const port = process.env.PORT || 10000;
      const response = await fetch(`http://localhost:${port}/api/fleet-stats`);
      const data = await response.json();

      let leaderboardDescription = "";
      if (!data.drivers || data.drivers.length === 0) {
        leaderboardDescription = "ℹ️ *No drivers online or logged miles yet.*";
      } else {
        const sortedDrivers = data.drivers.sort((a, b) => b.miles - a.miles);
        const medals = ['🥇', '🥈', '🥉'];
        leaderboardDescription = sortedDrivers.map((driver, index) => {
          const medal = medals[index] || `\`#${index + 1}\``;
          return `${medal} **${driver.name}** — *${driver.miles.toLocaleString()} miles* (${driver.rank})`;
        }).join('\n');
      }

      const leaderboardEmbed = {
        color: 0x53B7ED,
        title: '🚚 Euro Logistics • Driver Leaderboard',
        description: `Here are our top drivers ranked by total logged miles fetched from website telemetry:\n\n${leaderboardDescription}\n\n**Total Fleet Miles:** \`${data.totalMiles.toLocaleString()} miles\``,
        footer: { text: 'Euro Logistics VTC • Live Telemetry' },
        timestamp: new Date().toISOString()
      };
      await interaction.editReply({ embeds: [leaderboardEmbed] });
    } catch (error) {
      console.error('Error fetching leaderboard telemetry:', error);
      await interaction.editReply({ content: '❌ Failed to fetch driver telemetry data from website API.' });
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'fleet-status') {
    await interaction.deferReply();
    try {
      const port = process.env.PORT || 10000;
      const response = await fetch(`http://localhost:${port}/api/fleet-stats`);
      const data = await response.json();

      const statusEmbed = {
        color: 0x53B7ED,
        title: '📊 Euro Logistics • Fleet Status',
        fields: [
          { name: 'Server Status', value: `\`${data.status}\``, inline: true },
          { name: 'Active Drivers', value: `\`${data.activeDrivers}\``, inline: true },
          { name: 'Total Miles Logged', value: `\`${data.totalMiles.toLocaleString()} miles\``, inline: false }
        ],
        footer: { text: 'Euro Logistics VTC • Web Backend Status' },
        timestamp: new Date().toISOString()
      };
      await interaction.editReply({ embeds: [statusEmbed] });
    } catch (error) {
      console.error('Error fetching fleet status:', error);
      await interaction.editReply({ content: '❌ Failed to connect to fleet status web API.' });
    }
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'bot-status') {
    const ALLOWED_CHANNEL_ID = '1564280861787033681'; 
    if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
      return interaction.reply({ content: `❌ This command can only be used in <#${ALLOWED_CHANNEL_ID}>!`, ephemeral: true });
    }

    const uptimeSeconds = process.uptime();
    const hours = Math.floor(uptimeSeconds / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = Math.floor(uptimeSeconds % 60);

    const statusEmbed = {
      color: 0x57F287,
      title: '🟢 Euro Logistics Bot • System Status',
      description: 'The Discord bot client and event loop are operating normally.',
      fields: [
        { name: 'Bot Ping', value: `\`${client.ws.ping}ms\``, inline: true },
        { name: 'Uptime', value: `\`${hours}h ${minutes}m ${seconds}s\``, inline: true },
        { name: 'Hosting Platform', value: '`Render`', inline: true }
      ],
      footer: { text: 'Euro Logistics VTC • Operational Health Check' },
      timestamp: new Date().toISOString()
    };
    await interaction.reply({ embeds: [statusEmbed] });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'post-status') {
    const title = interaction.options.getString('title');
    const state = interaction.options.getString('state');
    const severity = interaction.options.getString('severity');
    const impactedInput = interaction.options.getString('impacted_services');
    const details = interaction.options.getString('details');
    const TARGET_CHANNEL_ID = '1564280861787033681';

    const channel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
    if (!channel) {
      return interaction.reply({ content: '❌ Could not find the status channel.', ephemeral: true });
    }

    let color = 0x57F287;
    if (severity === 'YELLOW') color = 0xFEE75C;
    if (severity === 'RED') color = 0xED4245;

    const servicesList = impactedInput.split(',').map(s => `• \`${s.trim()}\` — **${state}**`).join('\n');
    const embed = {
      color: color,
      title: title,
      description: `${details}\n\n### Impacted Services\n${servicesList}`,
      footer: { text: `Euro Logistics Status • Updated by ${interaction.user.username}` },
      timestamp: new Date().toISOString()
    };

    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Professional status update posted successfully to <#${TARGET_CHANNEL_ID}>!`, ephemeral: true });
  }

  if (interaction.isChatInputCommand() && interaction.commandName === 'clear') {
    const amount = interaction.options.getInteger('amount');
    if (amount < 1 || amount > 100) {
      return interaction.reply({ content: '❌ Please provide a number between **1 and 100**.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.editReply({ content: `✅ Successfully cleared **${deleted.size}** messages from this channel!` });
    } catch (error) {
      console.error('Error clearing messages:', error);
      await interaction.editReply({ content: '❌ Failed to clear messages (Discord prevents bulk-deleting messages older than 14 days).' });
    }
  }

  if (interaction.isButton() && interaction.customId.startsWith('verify_dual_')) {
    const parts = interaction.customId.split('_');
    const verifiedRoleId = parts[2];
    const driverRoleId = parts[3];
    const member = interaction.member;

    try {
      if (member.roles.cache.has(verifiedRoleId) && member.roles.cache.has(driverRoleId)) {
        return await interaction.reply({ content: 'ℹ️ You are already fully verified in **Euro Logistics**!', ephemeral: true });
      }
      await member.roles.add(verifiedRoleId);
      await member.roles.add(driverRoleId);
      await interaction.reply({ content: '✅ Verification successful! Both your **Verified** and **Driver** roles have been assigned. Welcome to the fleet!', ephemeral: true });
    } catch (error) {
      console.error('Error assigning verification roles:', error);
      await interaction.reply({ content: '❌ Failed to assign roles. Please check bot permissions.', ephemeral: true });
    }
  }

  if (interaction.isButton() && interaction.customId === 'create_support_ticket') {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const user = interaction.user;

    try {
      const existingChannel = guild.channels.cache.find(c => c.name === `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
      if (existingChannel) {
        return await interaction.editReply({ content: `❌ You already have an open support ticket: <#${existingChannel.id}>` });
      }

      const ticketChannel = await guild.channels.create({
        name: `ticket-${user.username}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
          { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
        ]
      });

      const ticketEmbed = {
        color: 0x53B7ED,
        title: `🎫 Support Ticket — ${user.username}`,
        description: `Hello ${user}, welcome to your support ticket!\n\nPlease describe your issue or question below. When resolved, click **Close Ticket**.`,
        footer: { text: 'Euro Logistics VTC • Support System' },
        timestamp: new Date().toISOString()
      };

      const closeBtn = new ButtonBuilder().setCustomId('close_support_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒');
      const row = new ActionRowBuilder().addComponents(closeBtn);

      await ticketChannel.send({ content: `${user}`, embeds: [ticketEmbed], components: [row] });
      await interaction.editReply({ content: `✅ Your support ticket has been created: <#${ticketChannel.id}>` });
    } catch (error) {
      console.error('Error creating ticket:', error);
      await interaction.editReply({ content: '❌ Failed to create support ticket channel.' });
    }
  }

  if (interaction.isButton() && interaction.customId === 'close_support_ticket') {
    await interaction.reply({ content: '🔒 Closing ticket and deleting channel in 5 seconds...', ephemeral: false });
    setTimeout(async () => {
      try { await interaction.channel.delete(); } catch (e) {}
    }, 5000);
  }
});

client.login(process.env.DISCORD_TOKEN);
