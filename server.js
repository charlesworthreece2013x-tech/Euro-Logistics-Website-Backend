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

// =========================================================================
// 1. SETUP EXPRESS WEB SERVER (Website, Static Files & Fleet Telemetry API)
// =========================================================================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Dynamic Telemetry API Endpoint integrated with TrucklineMP live map API
app.get('/api/fleet-stats', async (req, res) => {
  const targetPlayer = 'transit'; // Your in-game profile name

  try {
    let isOnline = false;
    let serverName = 'Europe Traffic';
    let loggedMiles = 544;

    const mapResponse = await fetch(`https://api.trucklinemp.com/v1/map/players?search=${encodeURIComponent(targetPlayer)}`, {
      headers: { 
        'User-Agent': 'EuroLogisticsVTC-Web/1.0',
        'Accept': 'application/json'
      }
    });

    if (mapResponse.ok) {
      const data = await mapResponse.json();
      
      const playerSession = Array.isArray(data) 
        ? data.find(p => p.username && p.username.toLowerCase() === targetPlayer.toLowerCase())
        : (data.username && data.username.toLowerCase() === targetPlayer.toLowerCase() ? data : null);

      if (playerSession) {
        isOnline = true;
        serverName = playerSession.server || 'Europe Traffic';
        if (playerSession.distance) {
          loggedMiles = playerSession.distance;
        }
      }
    }

    const driversList = isOnline ? [
      {
        name: targetPlayer,
        rank: "VTC Owner",
        miles: loggedMiles,
        status: `Driving ETS2 (${serverName})`
      }
    ] : [];

    res.json({
      status: "ONLINE",
      activeDrivers: driversList.length,
      totalMiles: isOnline ? loggedMiles : 0,
      drivers: driversList
    });

  } catch (error) {
    console.error('Error fetching TrucklineMP API:', error.message);

    res.json({
      status: "ONLINE",
      activeDrivers: 0,
      totalMiles: 0,
      drivers: []
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Euro Logistics server running on port ${PORT}`);
});

// =========================================================================
// 2. SETUP DISCORD BOT CLIENT (With GuildMembers, MessageContent & Presences)
// =========================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Required for reading text content & replying
    GatewayIntentBits.GuildPresences // Required for checking online/offline staff status
  ]
});

// Target Staff Roles for Support & Availability Checks
const STAFF_ROLE_NAMES = [
  'VTC Owner',
  'Operations Manager',
  'Community Manager',
  'Senior Moderator',
  'Moderator'
];

/**
 * Helper function to find active/online staff members in the guild
 */
async function getAvailableStaff(guild) {
  try {
    const members = await guild.members.fetch({ withPresences: true });

    return members.filter(member => {
      if (member.user.bot) return false;

      const hasStaffRole = member.roles.cache.some(role => STAFF_ROLE_NAMES.includes(role.name));
      const status = member.presence?.status;
      const isOnline = status && status !== 'offline';

      return hasStaffRole && isOnline;
    });
  } catch (err) {
    console.error("Error fetching staff presence:", err);
    return new Map();
  }
}

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
    .setName('staff-status')
    .setDescription('Check which management and moderation staff members are currently online'),
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

// =========================================================================
// 3. CUSTOM WELCOME SYSTEM
// =========================================================================
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

// =========================================================================
// 4. AUTOMATED MODERATION, LINK INSPECTOR & TICKET CHAT BOT ENGINE
// =========================================================================
client.countingData = new Map();
const userMessageHistory = new Map();

const BLACKLISTED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'asshole', 'dick', 'pussy',
  't.me/', 'badword1', 'badword2'
];

const BLACKLISTED_DOMAINS = [
  'discord-app.info', 'discord-nitro.click', 'steamcommunitly.com', 
  'free-nitro.ru', 'dl-discord.net', 'gift-discord.com'
];

const DANGEROUS_EXTENSIONS = ['.exe', '.scr', '.bat', '.cmd', '.vbs', '.apk', '.jar', '.ps1'];

async function inspectUrlSafety(targetUrl) {
  try {
    const parsedUrl = new URL(targetUrl);
    const domain = parsedUrl.hostname.toLowerCase();

    if (BLACKLISTED_DOMAINS.some(badDomain => domain.includes(badDomain))) {
      return { safe: false, reason: 'Known malicious domain pattern detected.' };
    }

    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(domain)) {
      return { safe: false, reason: 'Direct IP address links are restricted for security.' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) EuroLogisticsSafetyBot/1.0' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const finalUrl = response.url.toLowerCase();
    const contentType = (response.headers.get('content-type') || '').toLowerCase();

    if (BLACKLISTED_DOMAINS.some(badDomain => finalUrl.includes(badDomain))) {
      return { safe: false, reason: 'Link redirects to a blacklisted destination.' };
    }

    if (DANGEROUS_EXTENSIONS.some(ext => finalUrl.endsWith(ext)) || contentType.includes('application/x-msdownload')) {
      return { safe: false, reason: 'Direct link to an executable or dangerous file.' };
    }

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

  // A. Support Ticket Intelligent Response Logic
  if (message.channel.name.startsWith('ticket-')) {
    const activeStaff = await getAvailableStaff(message.guild);

    // If staff members are offline, the bot steps in to converse & assist
    if (activeStaff.size === 0) {
      message.channel.sendTyping();
      setTimeout(async () => {
        if (contentLower.includes('telemetry') || contentLower.includes('miles') || contentLower.includes('stats')) {
          await message.reply('🤖 **Euro Logistics Assistant:** Drivers can track their live miles and fleet status directly on our web dashboard or by running `/leaderboard` in the main channels! I have logged your telemetry request for staff.');
        } else if (contentLower.includes('convoy') || contentLower.includes('event') || contentLower.includes('halloween')) {
          await message.reply('🤖 **Euro Logistics Assistant:** Our Grand Opening Halloween Convoy details are posted in our announcements! Make sure your truck is painted orange & black. Staff will confirm your slot shortly.');
        } else if (contentLower.includes('apply') || contentLower.includes('join') || contentLower.includes('verify')) {
          await message.reply('🤖 **Euro Logistics Assistant:** To complete verification, simply click the **Verify** button in our verification channel to gain full driver roles automatically!');
        } else {
          await message.reply(`🤖 **Euro Logistics Assistant:** Thank you for providing these details, ${message.author}! I have saved your message in this ticket. Our staff team is currently offline, but a Moderator or Manager will review this as soon as they log on.`);
        }
      }, 1500);
      return;
    }
  }

  // B. General Channel Triggers (Using "euro logistics" or direct mention)
  if (contentLower.includes('euro logistics') || message.mentions.has(client.user)) {
    await message.reply('Hello! Welcome to **Euro Logistics VTC**! 🚚 Need assistance? Use `/setup-support` or open a support ticket!');
    return;
  }

  // C. Counting Channel Logic
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

  // D. Profanity & Word Filter Check
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

  // E. Automated URL Inspection Engine
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const detectedUrls = message.content.match(urlRegex);

  if (detectedUrls && detectedUrls.length > 0) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      for (const link of detectedUrls) {
        const checkResult = await inspectUrlSafety(link);

        if (!checkResult.safe) {
          try {
            await message.delete();
            const alertMsg = await message.channel.send(`🛡️ **${message.author.username}**, your message was removed. **Reason:** ${checkResult.reason}`);
            setTimeout(() => alertMsg.delete().catch(() => {}), 7000);
            return;
          } catch (err) {
            console.error('Error removing unsafe link message:', err);
          }
        }
      }
    }
  }

  // F. Anti-Spam Protection
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

// =========================================================================
// 5. SLASH COMMANDS & TICKET BUTTON INTERACTIONS
// =========================================================================
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
      description: 'Need assistance with your driver application, telemetry, convoys, or community questions? \n\nClick the **Create Ticket** button below to open a private support channel.',
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

  if (interaction.isChatInputCommand() && interaction.commandName === 'staff-status') {
    await interaction.deferReply();
    try {
      const availableStaff = await getAvailableStaff(interaction.guild);

      if (availableStaff.size === 0) {
        const embed = {
          color: 0xED4245,
          title: '🔴 Staff Availability Status',
          description: 'No moderators or managers are currently active.\n\n*Our 24/7 Automated Bot System is active! You can still open a ticket using the ticket panel and leave your details.*',
          footer: { text: 'Euro Logistics VTC • Staff Availability Check' },
          timestamp: new Date().toISOString()
        };
        return await interaction.editReply({ embeds: [embed] });
      }

      const staffList = availableStaff.map(m => {
        const statusEmoji = m.presence?.status === 'online' ? '🟢' : (m.presence?.status === 'idle' ? '🟡' : '🔴');
        const roleName = m.roles.highest.name;
        return `${statusEmoji} **${m.displayName}** (\`${roleName}\`)`;
      }).join('\n');

      const embed = {
        color: 0x57F287,
        title: '🟢 Active Staff & Management',
        description: `The following team members are currently online and available to help:\n\n${staffList}`,
        footer: { text: 'Euro Logistics VTC • Staff Availability Check' },
        timestamp: new Date().toISOString()
      };

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching staff presence:', error);
      await interaction.editReply({ content: '❌ Failed to fetch staff presence data.' });
    }
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

  // Dual Role Verification Button Interaction
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

  // Support Ticket Creation (Zero Latency via Immediate Deferral)
  if (interaction.isButton() && interaction.customId === 'create_support_ticket') {
    // 1. Immediately acknowledge Discord (resolves latency & 3s timeouts)
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

      // Quick check for live staff presence
      const activeStaff = await getAvailableStaff(guild);
      let ticketDescription = "";

      if (activeStaff.size > 0) {
        const staffNames = activeStaff.map(m => m.displayName).join(', ');
        ticketDescription = `Hello ${user}, welcome to your support ticket!\n\n🟢 **Active Staff Online:** ${staffNames}\nOur team has been notified and will assist you shortly. Please describe your issue below.`;
      } else {
        ticketDescription = `Hello ${user}! 👋 **No staff members are currently online, but I am your 24/7 Euro Logistics Assistant.**\n\nI am here to take down your issue right now! Type your questions or details below and I will respond to assist you until staff log in:\n\n• **Telemetry & Driver Stats**\n• **Convoys & Event Planning**\n• **VTC Account Verification**`;
      }

      const ticketEmbed = {
        color: 0x53B7ED,
        title: `🎫 Support Ticket — ${user.username}`,
        description: ticketDescription,
        footer: { text: 'Euro Logistics VTC • 24/7 Virtual Support System' },
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
