const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const express = require('express');
const path = require('path');

// Global set to keep track of manually checked-in drivers (/duty on)
global.activeDriverIds = global.activeDriverIds || new Set();

// ==========================================
// 1. EXPRESS SERVER & WEBSITE (FOR RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

// Dynamic Telemetry API
app.get('/api/fleet-stats', async (req, res) => {
    try {
        const guild = client.guilds.cache.get(GUILD_ID);

        if (!guild) {
            return res.json({ status: "ONLINE", activeDrivers: 0, totalMiles: 0, drivers: [] });
        }

        // Fetch members with presence details cached
        await guild.members.fetch({ withPresences: true }).catch(() => {});

        const driversMap = new Map();

        // 1. Check for active Discord Rich Presence (Truckline / ETS2 / ATS)
        guild.members.cache.forEach(member => {
            if (member.user.bot) return;

            const activities = member.presence?.activities || [];

            const gamePresence = activities.find(a => 
                a.name && (
                    a.name.toLowerCase().includes('truckline') ||
                    a.name.toLowerCase().includes('euro truck') ||
                    a.name.toLowerCase().includes('american truck')
                )
            );

            if (gamePresence) {
                const details = gamePresence.details || '';
                const state = gamePresence.state || '';
                let fullStatus = [details, state].filter(Boolean).join(' - ');
                if (!fullStatus) fullStatus = `Playing ${gamePresence.name}`;

                let rankText = 'Fleet Driver';
                if (member.roles.cache.some(r => r.name.toLowerCase().includes('owner') || r.name.toLowerCase().includes('founder'))) {
                    rankText = 'VTC Owner';
                } else if (member.roles.cache.some(r => r.name.toLowerCase().includes('senior'))) {
                    rankText = 'Senior Driver';
                }

                driversMap.set(member.id, {
                    name: member.displayName,
                    rank: rankText,
                    miles: 1500,
                    status: fullStatus
                });
            }
        });

        // 2. Check for drivers who manually checked in via /duty on
        for (const userId of global.activeDriverIds) {
            if (!driversMap.has(userId)) {
                const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    let rankText = 'Fleet Driver';
                    if (member.roles.cache.some(r => r.name.toLowerCase().includes('owner') || r.name.toLowerCase().includes('founder'))) {
                        rankText = 'VTC Owner';
                    }

                    driversMap.set(member.id, {
                        name: member.displayName,
                        rank: rankText,
                        miles: 1500,
                        status: 'On Duty (Truckline MP)'
                    });
                }
            }
        }

        const driversList = Array.from(driversMap.values());

        res.json({
            status: "ONLINE",
            activeDrivers: driversList.length,
            totalMiles: driversList.length * 1500,
            drivers: driversList
        });

    } catch (err) {
        console.error('[API Error] Failed to fetch telemetry stats:', err);
        res.json({ status: "ONLINE", activeDrivers: 0, totalMiles: 0, drivers: [] });
    }
});

// Serve static website files from root folder
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[HTTP] Express website listening on port ${PORT}`);
});

// ==========================================
// 2. DISCORD CLIENT INITIALIZATION
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember]
});

// Environment Variables
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '1564236424155373568';
const WELCOME_CHANNEL_ID = 'YOUR_WELCOME_CHANNEL_ID_HERE'; 

let currentCount = 0;
let lastCounterId = null;

// ==========================================
// 3. REGISTER SLASH COMMANDS
// ==========================================
const commands = [
  new SlashCommandBuilder()
    .setName('duty')
    .setDescription('Toggle your on-duty driver status for the VTC website')
    .addStringOption(option =>
      option.setName('status')
        .setDescription('Go on-duty or off-duty')
        .setRequired(true)
        .addChoices(
          { name: 'On Duty (Driving)', value: 'on' },
          { name: 'Off Duty', value: 'off' }
        )
    ),
  new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('Deploy the verification prompt panel (Admin)'),
  new SlashCommandBuilder()
    .setName('setup-support')
    .setDescription('Deploy the support ticket creation panel (Admin)'),
  new SlashCommandBuilder()
    .setName('setup-counting')
    .setDescription('Deploy or initialize the counting game channel (Admin)'),
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete a specified number of messages from the channel (Admin)')
    .addIntegerOption(option => 
      option.setName('amount')
        .setDescription('Number of messages to clear (1-100)')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('other')
    .setDescription('View Euro Logistics VTC information and useful links')
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log('[BOT] Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('[BOT] Slash commands registered successfully!');
  } catch (error) {
    console.error('[BOT] Error registering slash commands:', error);
  }
}

// ==========================================
// 4. EVENT HANDLERS
// ==========================================

client.once('ready', () => {
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  registerCommands();
});

// Welcomer Event
client.on('guildMemberAdd', async (member) => {
    try {
        const channel = await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
        if (!channel) return;

        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🚚 Welcome to Euro Logistics VTC!')
            .setDescription(`Welcome ${member} to our official community server!`)
            .setColor('#FF6600')
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        await channel.send({ content: `Welcome ${member}!`, embeds: [welcomeEmbed] });
    } catch (err) {
        console.error('[ERROR] Welcomer error:', err);
    }
});

// Slash Command & Interaction Handler
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // /duty Command Handler
      if (commandName === 'duty') {
        await interaction.deferReply({ ephemeral: true });
        const choice = interaction.options.getString('status');

        if (choice === 'on') {
          global.activeDriverIds.add(interaction.user.id);
          await interaction.editReply({ content: '✅ You are now marked as **On Duty** on the website telemetry dashboard!' });
        } else {
          global.activeDriverIds.delete(interaction.user.id);
          await interaction.editReply({ content: '❌ You are now marked as **Off Duty**.' });
        }
      }

      // /setup-verification
      else if (commandName === 'setup-verification') {
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder()
          .setTitle('🚛 Euro Logistics VTC - Verification')
          .setDescription('Welcome! Click below to verify your account.')
          .setColor('#FF6600');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_verify')
            .setLabel('Verify Account')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Verification panel deployed successfully!' });
      }

      // /setup-support
      else if (commandName === 'setup-support') {
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder()
          .setTitle('🛠️ Euro Logistics VTC - Support & Tickets')
          .setDescription('Click below to open a private ticket.')
          .setColor('#FF6600');

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('btn_support_ticket')
            .setLabel('Open Ticket')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📩')
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.editReply({ content: '✅ Support panel deployed successfully!' });
      }

      // /setup-counting
      else if (commandName === 'setup-counting') {
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder()
          .setTitle('🔢 Euro Logistics VTC - Counting Game')
          .setDescription('Start counting from **1**!')
          .setColor('#FF6600');

        await interaction.channel.send({ embeds: [embed] });
        await interaction.editReply({ content: '✅ Counting panel deployed!' });
      }

      // /clear
      else if (commandName === 'clear') {
        await interaction.deferReply({ ephemeral: true });
        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 100) {
          return await interaction.editReply({ content: '⚠️ Please specify a number between 1 and 100.' });
        }
        await interaction.channel.bulkDelete(amount, true);
        await interaction.editReply({ content: `✅ Cleared **${amount}** messages!` });
      }

      // /other
      else if (commandName === 'other') {
        await interaction.deferReply({ ephemeral: true });
        const embed = new EmbedBuilder()
          .setTitle('🚛 Euro Logistics VTC')
          .setDescription('Official Euro Logistics VTC Community Services.')
          .setColor('#FF6600');

        await interaction.editReply({ embeds: [embed] });
      }
    }

    // Button interactions
    else if (interaction.isButton()) {
      if (interaction.customId === 'btn_verify') {
        await interaction.deferReply({ ephemeral: true });
        const verifiedRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'verified');
        if (verifiedRole) await interaction.member.roles.add(verifiedRole);
        await interaction.editReply({ content: '✅ Verification complete!' });
      }

      else if (interaction.customId === 'btn_support_ticket') {
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        const member = interaction.member;

        const ticketChannel = await guild.channels.create({
          name: `ticket-${member.user.username}`,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
          ]
        });

        const ticketEmbed = new EmbedBuilder()
          .setTitle(`Support Ticket - ${member.user.tag}`)
          .setDescription('Staff will be with you shortly.')
          .setColor('#FF6600');

        const closeRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
        );

        await ticketChannel.send({ content: `${member}`, embeds: [ticketEmbed], components: [closeRow] });
        await interaction.editReply({ content: `✅ Ticket created: ${ticketChannel}` });
      }

      else if (interaction.customId === 'btn_close_ticket') {
        await interaction.reply({ content: '🔒 Closing ticket...', ephemeral: true });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 2000);
      }
    }
  } catch (error) {
    console.error('[ERROR] Interaction error:', error);
  }
});

// Counting Game & Messages
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.name && message.channel.name.toLowerCase().includes('counting')) {
    const userNumber = parseInt(message.content.trim(), 10);
    if (isNaN(userNumber)) return;

    if (userNumber === currentCount + 1) {
      if (message.author.id === lastCounterId) {
        await message.react('❌').catch(() => {});
        await message.reply('❌ You cannot count twice in a row! Count reset to **0**.');
        currentCount = 0;
        lastCounterId = null;
        return;
      }
      currentCount++;
      lastCounterId = message.author.id;
      await message.react('✅').catch(() => {});
    } else {
      await message.react('❌').catch(() => {});
      await message.reply(`❌ Wrong number! Count reset to **0**.`);
      currentCount = 0;
      lastCounterId = null;
    }
  }
});

// ==========================================
// 5. START BOT
// ==========================================
client.login(TOKEN);
