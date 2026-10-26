const express = require('express');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

// 1. Setup Express Web Server (Website & Fleet Telemetry API)
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('Euro Logistics VTC Web Backend & Discord Bot is Online!');
});

// Telemetry API endpoint for live fleet stats
app.get('/api/fleet-stats', (req, res) => {
  res.json({
    status: "ONLINE",
    activeDrivers: 0,
    totalMiles: 0,
    drivers: [] // Populates automatically as drivers log miles on your website
  });
});

app.listen(PORT, () => {
  console.log(`Euro Logistics server running on port ${PORT}`);
});

// 2. Setup Discord Bot Client
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
    .setName('leaderboard')
    .setDescription('View top drivers ranked by miles grabbed from website telemetry'),
  new SlashCommandBuilder()
    .setName('fleet-status')
    .setDescription('Check the overall live status and statistics of Euro Logistics')
];

// Register slash commands on startup
client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

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

// 3. Systems Memory & Advanced Moderation Filters
client.countingData = new Map();
const userMessageHistory = new Map();

// Comprehensive blacklisted words and anti-invite links filter
const BLACKLISTED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'pussy',
  'discord.gg/', 'discord.com/invite/', 't.me/', 'badword1', 'badword2'
];

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  // A. Counting Channel Logic
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

  // B. Advanced Moderation System (Profanity, Link Filter, & Anti-Spam Flood Protection)
  const contentLower = message.content.toLowerCase();
  
  // 1. Blacklisted Words / Unauthorized Links Filter
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

  // 2. Anti-Spam / Anti-Flood Protection (Max 5 messages within 4 seconds)
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

// 4. Handle Interactions & Slash Commands
client.on('interactionCreate', async interaction => {
  
  // A. Execute /setup-verification (Dual Roles Panel)
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

  // B. Execute /setup-counting
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-counting') {
    client.countingData.set(interaction.channel.id, { count: 0, lastUser: null });
    await interaction.reply({ content: `✅ This channel has been successfully set up as the **Counting Game** channel! Start with **1**.` });
  }

  // C. Execute /leaderboard (Grabs telemetry data from website API)
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
      await interaction.editReply({ content: '❌ Failed to fetch driver telemetry data from the website API.' });
    }
  }

  // D. Execute /fleet-status
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
      await interaction.editReply({ content: '❌ Failed to connect to the fleet status web API.' });
    }
  }

  // E. Handle Dual-Role "Verify" Button Click
  if (interaction.isButton() && interaction.customId.startsWith('verify_dual_')) {
    const parts = interaction.customId.split('_');
    const verifiedRoleId = parts[2];
    const driverRoleId = parts[3];
    const member = interaction.member;

    try {
      if (member.roles.cache.has(verifiedRoleId) && member.roles.cache.has(driverRoleId)) {
        return await interaction.reply({
          content: 'ℹ️ You are already fully verified in **Euro Logistics**!',
          ephemeral: true
        });
      }

      await member.roles.add(verifiedRoleId);
      await member.roles.add(driverRoleId);

      await interaction.reply({
        content: '✅ Verification successful! Both your **Verified** and **Driver** roles have been assigned. Welcome to the fleet!',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error assigning verification roles:', error);
      await interaction.reply({
        content: '❌ Failed to assign roles. Please ensure my bot role is placed higher than both target roles in Server Settings > Roles!',
        ephemeral: true
      });
    }
  }
});

// 5. Log into Discord
client.login(process.env.DISCORD_TOKEN);
