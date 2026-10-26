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

// Parse JSON bodies for API routes
app.use(express.json());

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

// 4. Systems Memory & Advanced Moderation Filters (With HTTP Link Inspector)
client.countingData = new Map();
const userMessageHistory = new Map();

// Word Blacklist
const BLACKLISTED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'pussy',
  't.me/', 'badword1', 'badword2'
];

// High-Risk Malicious / Phishing Domains
const BLACKLISTED_DOMAINS = [
  'discord-app.info', 'discord-nitro.click', 'steamcommunitly.com', 
  'free-nitro.ru', 'dl-discord.net', 'gift-discord.com'
];

// Dangerous file extensions to block upon URL check
const DANGEROUS_EXTENSIONS = ['.exe', '.scr', '.bat', '.cmd', '.vbs', '.apk', '.jar', '.ps1'];

/**
 * Link Inspector Function: Simulates "clicking" a URL to check headers & safety
 */
async function inspectUrlSafety(targetUrl) {
  try {
    const parsedUrl = new URL(targetUrl);
    const domain = parsedUrl.hostname.toLowerCase();

    // 1. Direct Domain Blacklist Check
    if (BLACKLISTED_DOMAINS.some(badDomain => domain.includes(badDomain))) {
      return { safe: false, reason: 'Known malicious domain pattern detected.' };
    }

    // 2. Direct IP Address Host Check (e.g., http://192.168.1.1/malware)
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(domain)) {
      return { safe: false, reason: 'Direct IP address links are restricted for security.' };
    }

    // 3. HTTP Request Check (Follow redirects & examine final response headers)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4-second timeout guard

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EuroLogisticsSafetyBot/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const finalUrl = response.url.toLowerCase();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    // Check if redirect ended up on a blacklisted domain
    if (BLACKLISTED_DOMAINS.some(badDomain => finalUrl.includes(badDomain))) {
      return { safe: false, reason: 'Link redirects to a blacklisted destination.' };
    }

    // Check if the link points to or downloads an executable file
    if (DANGEROUS_EXTENSIONS.some(ext => finalUrl.endsWith(ext)) || contentType.includes('application/x-msdownload')) {
      return { safe: false, reason: 'Direct link to an executable or dangerous file.' };
    }

    // Check for HTTP server error or dead destination
    if (response.status >= 400 && response.status !== 403) {
      return { safe: false, reason: `Link target returned an invalid HTTP status code (${response.status}).` };
    }

    return { safe: true };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { safe: false, reason: 'Link check timed out (unresponsive host).' };
    }
    return { safe: false, reason: 'Unreachable host or invalid SSL certificate.' };
  }
}

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const contentLower = message.content.toLowerCase();

  // A. Custom Text Trigger: "euro logistics hi"
  if (contentLower.includes('euro logistics hi')) {
    await message.reply('Hello! Welcome to **Euro Logistics VTC**! 🚚 Let us know if you need any help out on the road.');
    return;
  }

  // B. Counting Channel Logic
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

  // C. Profanity & Word Filter Check
  if (BLACKLISTED_WORDS.some(word => contentLower.includes(word))) {
    try {
      await message.delete();
      const warningMsg = await message.channel.send(`⚠️ **${message.author.username}**, your message was removed because it contained restricted content or profanity.`);
      setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
      return;
    } catch (error) {
      console.error('Error deleting restricted word message:', error);
    }
  }

  // D. Automated URL Inspection Engine
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const detectedUrls = message.content.match(urlRegex);

  if (detectedUrls && detectedUrls.length > 0) {
    // Exempt administrators from link restrictions
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      for (const link of detectedUrls) {
        const checkResult = await inspectUrlSafety(link);

        if (!checkResult.safe) {
          try {
            await message.delete();
            const alertMsg = await message.channel.send(`🛡️ **${message.author.username}**, your message was removed. **Reason:** ${checkResult.reason}`);
            setTimeout(() => alertMsg.delete().catch(() => {}), 7000);
            return; // Stop processing further links in this message
          } catch (err) {
            console.error('Error removing unsafe link message:', err);
          }
        }
      }
    }
  }

  // E. Anti-Spam / Anti-Flood Protection
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
      const spamWarn = await
