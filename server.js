const express = require('express');
const path = require('path');
const cron = require('node-cron');
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

// Replace with your actual Instatus page URL
const STATUS_PAGE_URL = process.env.STATUS_PAGE_URL || 'https://euro-logistics.instatus.com';

// =========================================================================
// 1. SETUP EXPRESS WEB SERVER & TELEMETRY API
// =========================================================================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Telemetry API Endpoint integrated with TrucklineMP live map API
app.get('/api/fleet-stats', async (req, res) => {
  const targetPlayer = 'transit';

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

// Redirect /status straight to your Instatus page
app.get('/status', (req, res) => {
  res.redirect(STATUS_PAGE_URL);
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
// 2. SETUP DISCORD BOT CLIENT & WEEKLY ANNOUNCEMENT SCHEDULER
// =========================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, 
    GatewayIntentBits.GuildPresences 
  ]
});

const STAFF_ROLE_NAMES = [
  'VTC Owner',
  'Operations Manager',
  'Community Manager',
  'Senior Moderator',
  'Moderator'
];

async function getAvailableStaff(guild) {
  try {
    const members = await guild.members.fetch({ withPresences: true });
    return members.filter(member => {
      if (member.user.bot) return false;
      const hasStaffRole = member.roles.cache.some(role => STAFF_ROLE_NAMES.includes(role.name));
      const status = member.presence?.status;
      return hasStaffRole && status && status !== 'offline';
    });
  } catch (err) {
    console.error("Error fetching staff presence:", err);
    return new Map();
  }
}

async function closeTicketAndDM(channel, user, reason = "Issue resolved") {
  const dmEmbed = {
    color: 0x57F287,
    title: '✅ Support Ticket Closed — Euro Logistics VTC',
    description: `Hello ${user}, your support ticket (\`${channel.name}\`) has been closed.\n\n**Reason:** ${reason}\n\nThank you for contacting Euro Logistics VTC!`,
    footer: { text: 'Euro Logistics VTC • Support Ticket System' },
    timestamp: new Date().toISOString()
  };

  try {
    await user.send({ embeds: [dmEmbed] });
  } catch (err) {
    console.log(`Could not DM user ${user.tag}.`);
  }

  await channel.send('🔒 **Ticket finished.** Sending DM confirmation and deleting channel in 5 seconds...');
  setTimeout(async () => {
    try { await channel.delete(); } catch (e) {}
  }, 5000);
}

// Scheduled Weekly Report
async function sendWeeklyStatusReport() {
  const STATUS_CHANNEL_ID = '1564280861787033681';
  const channel = await client.channels.fetch(STATUS_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const uptimeSeconds = process.uptime();
  const days = Math.floor(uptimeSeconds / (3600 * 24));
  const hours = Math.floor((uptimeSeconds % (3600 * 24)) / 3600);

  const weeklyEmbed = {
    color: 0x53B7ED,
    title: '📊 Euro Logistics • Weekly Health Overview',
    description: 'Weekly automated check-in on core systems and operations.',
    fields: [
      { name: '🤖 Bot Latency', value: `\`${client.ws.ping} ms\``, inline: true },
      { name: '⏱️ Process Uptime', value: `\`${days}d ${hours}h\``, inline: true },
      { name: '🌐 Official Status Page', value: `[View Live Instatus Dashboard](${STATUS_PAGE_URL})`, inline: false }
    ],
    footer: { text: 'Euro Logistics Weekly Automated Scheduler' },
    timestamp: new Date().toISOString()
  };

  await channel.send({ embeds: [weeklyEmbed] });
}

// Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('Post verification embed with dual roles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(opt => opt.setName('verified_role').setDescription('Verified Role').setRequired(true))
    .addRoleOption(opt => opt.setName('driver_role').setDescription('Driver Role').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setup-counting')
    .setDescription('Set counting channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setup-support')
    .setDescription('Post ticket support panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('staff-status')
    .setDescription('Check online staff members'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View driver mileage rankings'),
  new SlashCommandBuilder()
    .setName('fleet-status')
    .setDescription('Check live backend telemetry status'),
  new SlashCommandBuilder()
    .setName('bot-status')
    .setDescription('Check system uptime and latency'),
  new SlashCommandBuilder()
    .setName('post-status')
    .setDescription('Post status update embed linking to Instatus')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt => opt.setName('title').setDescription('Update Title').setRequired(true))
    .addStringOption(opt => opt.setName('details').setDescription('Update details').setRequired(true)),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Bulk delete messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages (1-100)').setRequired(true))
];

client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

  client.user.setPresence({
    activities: [{ name: 'Euro Logistics VTC 🚚', type: ActivityType.Watching }],
    status: 'online',
  });

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1564236424155373568'),
      { body: commands }
    );
    console.log('Successfully registered all slash commands!');
  } catch (error) {
    console.error('Error registering slash commands:', error);
  }

  // AUTOMATED WEEKLY CRON JOB: Every Monday at 9:00 AM
  cron.schedule('0 9 * * 1', () => {
    sendWeeklyStatusReport();
  });
});

// Event Listeners
client.on('guildMemberAdd', async member => {
  const channel = await member.guild.channels.fetch('1564304871203541072').catch(() => null);
  if (!channel) return;

  const welcomeEmbed = {
    color: 0x53B7ED,
    title: '🚚 New Driver Joined the Fleet!',
    description: `Welcome to **Euro Logistics VTC**, ${member}! You are member **#${member.guild.memberCount}**.`,
    thumbnail: { url: member.user.displayAvatarURL({ dynamic: true, size: 512 }) },
    footer: { text: 'Euro Logistics VTC • Onboarding System' },
    timestamp: new Date().toISOString()
  };

  await channel.send({ content: `${member}`, embeds: [welcomeEmbed] }).catch(() => {});
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const contentLower = message.content.toLowerCase().trim();

  if (message.channel.name.startsWith('ticket-')) {
    if (contentLower === 'finished' || contentLower === 'finish' || contentLower === 'done' || contentLower === 'close') {
      await closeTicketAndDM(message.channel, message.author, "Driver marked ticket as finished.");
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'post-status') {
    const title = interaction.options.getString('title');
    const details = interaction.options.getString('details');
    const channel = await client.channels.fetch('1564280861787033681').catch(() => null);

    const embed = {
      color: 0x53B7ED,
      title: title,
      description: `${details}\n\n🔗 **[View Live Instatus Page](${STATUS_PAGE_URL})**`,
      footer: { text: `Updated by ${interaction.user.username}` },
      timestamp: new Date().toISOString()
    };

    if (channel) await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Status update posted!`, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'create_support_ticket') {
    await interaction.deferReply({ ephemeral: true });
    const guild = interaction.guild;
    const user = interaction.user;

    const existingChannel = guild.channels.cache.find(c => c.name === `ticket-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
    if (existingChannel) {
      return await interaction.editReply({ content: `❌ You already have an open ticket: <#${existingChannel.id}>` });
    }

    const ticketChannel = await guild.channels.create({
      name: `ticket-${user.username}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });

    const activeStaff = await getAvailableStaff(guild);
    const staffText = activeStaff.size > 0 
      ? `🟢 **Active Staff Online:** ${activeStaff.map(m => m.displayName).join(', ')}` 
      : `ℹ️ Staff members are currently offline, but your ticket has been logged.`;

    const ticketEmbed = {
      color: 0x53B7ED,
      title: `🎫 Support Ticket — ${user.username}`,
      description: `Welcome ${user}!\n\n${staffText}\n\nPlease state your question below. Reply with **finished** when completed to close and receive your DM transcript.`,
      footer: { text: 'Euro Logistics VTC • Support Desk' },
      timestamp: new Date().toISOString()
    };

    const closeBtn = new ButtonBuilder().setCustomId('create_support_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒');
    const row = new ActionRowBuilder().addComponents(closeBtn);

    await ticketChannel.send({ content: `${user}`, embeds: [ticketEmbed], components: [row] });
    await interaction.editReply({ content: `✅ Ticket created: <#${ticketChannel.id}>` });
  }

  if (interaction.isButton() && interaction.customId === 'close_support_ticket') {
    await closeTicketAndDM(interaction.channel, interaction.user, "Closed via button.");
  }
});

client.login(process.env.DISCORD_TOKEN);
