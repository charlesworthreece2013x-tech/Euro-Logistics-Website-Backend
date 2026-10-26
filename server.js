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

// Telemetry API endpoint containing driver data and miles
app.get('/api/fleet-stats', (req, res) => {
  res.json({
    status: "ONLINE",
    activeDrivers: 3,
    totalMiles: 31750,
    drivers: [
      { name: "Euro Logistics", rank: "VTC Owner", miles: 18450, status: "On Duty" },
      { name: "Alpha_Hauler", rank: "Senior Driver", miles: 9200, status: "Driving ETS2" },
      { name: "Nordic_Trucker", rank: "Fleet Driver", miles: 4100, status: "In Convoy" }
    ]
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
    .setDescription('Post the Euro Logistics verification embed with button')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName('driver_role')
        .setDescription('Select the Driver role to assign to verified users')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('setup-counting')
    .setDescription('Set the current channel as the official Counting channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View top drivers ranked by miles grabbed from website telemetry')
];

// Register slash commands on startup
client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1564236424155373568'),
      { body: commands }
    );
    console.log('Successfully registered commands!');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
});

// 3. Counting System Memory & Moderation
client.countingData = new Map();
const BLACKLISTED_WORDS = ['discord.gg/', 't.me/', 'badword1', 'badword2'];

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  // A. Counting Channel Logic
  const countingState = client.countingData.get(message.channel.id);
  if (countingState) {
    const parsedNumber = parseInt(message.content.trim());

    if (!isNaN(parsedNumber)) {
      const expectedNumber = countingState.count + 1;

      if (parsedNumber === expectedNumber && message.author.id !== countingState.lastUser) {
        countingState.count = expectedNumber;
        countingState.lastUser = message.author.id;
        await message.react('✅').catch(() => {});
        return;
      } else {
        await message.delete().catch(() => {});
        const failMsg = await message.channel.send(`❌ **${message.author.username}** ruined the count at **${expectedNumber - 1}**! Restart from **1**.`);
        setTimeout(() => failMsg.delete().catch(() => {}), 6000);
        
        countingState.count = 0;
        countingState.lastUser = null;
        return;
      }
    } else {
      await message.delete().catch(() => {});
      const textWarn = await message.channel.send(`⚠️ **${message.author.username}**, only numbers are allowed here! Current count is **${countingState.count}**.`);
      setTimeout(() => textWarn.delete().catch(() => {}), 4000);
      return;
    }
  }

  // B. Auto-Mod Filter
  const contentLower = message.content.toLowerCase();
  if (BLACKLISTED_WORDS.some(word => contentLower.includes(word))) {
    try {
      await message.delete();
      const warningMsg = await message.channel.send(`⚠️ **${message.author.username}**, your message was removed because it violated community guidelines.`);
      setTimeout(() => warningMsg.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error('Error handling auto-mod deletion:', error);
    }
  }
});

// 4. Handle Interactions & Commands
client.on('interactionCreate', async interaction => {
  
  // A. Execute /setup-verification
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-verification') {
    const driverRole = interaction.options.getRole('driver_role');

    const embed = {
      color: 0x53B7ED,
      title: 'Verification',
      description: 'Welcome to **Euro Logistics VTC**!\n\nTo gain full access to our community channels, driver resources, and event updates, please verify your account below.\n\n### How to Verify:\n1. Click the **Verify** button below.\n2. Receive your **Driver** role automatically.',
      footer: { text: 'Euro Logistics VTC • Driver Access System' },
      timestamp: new Date().toISOString()
    };

    const verifyBtn = new ButtonBuilder()
      .setCustomId(`verify_driver_${driverRole.id}`)
      .setLabel('Verify')
      .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder().addComponents(verifyBtn);

    await interaction.channel.send({ embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Verification panel posted! Users will be granted the **${driverRole.name}** role upon clicking verify.`, ephemeral: true });
  }

  // B. Execute /setup-counting
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-counting') {
    client.countingData.set(interaction.channel.id, { count: 0, lastUser: null });
    await interaction.reply({ content: `✅ This channel has been successfully set up as the **Counting Game** channel! Start with **1**.` });
  }

  // C. Execute /leaderboard (Grabs telemetry data from the website API)
  if (interaction.isChatInputCommand() && interaction.commandName === 'leaderboard') {
    await interaction.deferReply();

    try {
      // Fetch telemetry data from your backend API route
      // (Using localhost to query the built-in express server endpoint safely)
      const port = process.env.PORT || 10000;
      const response = await fetch(`http://localhost:${port}/api/fleet-stats`);
      const data = await response.json();

      // Sort drivers by miles in descending order (highest miles first)
      const sortedDrivers = data.drivers.sort((a, b) => b.miles - a.miles);

      // Build leaderboard text medals
      const medals = ['🥇', '🥈', '🥉'];
      const leaderboardText = sortedDrivers.map((driver, index) => {
        const medal = medals[index] || `\`#${index + 1}\``;
        return `${medal} **${driver.name}** — *${driver.miles.toLocaleString()} miles* (${driver.rank})`;
      }).join('\n');

      const leaderboardEmbed = {
        color: 0x53B7ED,
        title: '🚚 Euro Logistics • Driver Leaderboard',
        description: `Here are our top drivers ranked by total logged miles fetched from website telemetry:\n\n${leaderboardText}\n\n**Total Fleet Miles:** \`${data.totalMiles.toLocaleString()} miles\``,
        footer: { text: 'Euro Logistics VTC • Live Telemetry' },
        timestamp: new Date().toISOString()
      };

      await interaction.editReply({ embeds: [leaderboardEmbed] });
    } catch (error) {
      console.error('Error fetching leaderboard telemetry:', error);
      await interaction.editReply({ content: '❌ Failed to fetch driver telemetry data from the website API.' });
    }
  }

  // D. Handle "Verify" Button Click
  if (interaction.isButton() && interaction.customId.startsWith('verify_driver_')) {
    const roleId = interaction.customId.replace('verify_driver_', '');
    const member = interaction.member;

    try {
      if (member.roles.cache.has(roleId)) {
        return await interaction.reply({
          content: 'ℹ️ You are already verified and have the Driver role in **Euro Logistics**!',
          ephemeral: true
        });
      }

      await member.roles.add(roleId);
      await interaction.reply({
        content: '✅ Verification successful! The **Driver** role has been assigned. Welcome to the fleet!',
        ephemeral: true
      });
    } catch (error) {
      console.error('Error assigning driver role:', error);
      await interaction.reply({
        content: '❌ Failed to assign the Driver role. Please ensure my bot role is placed higher than the Driver role in Discord Server Settings > Roles!',
        ephemeral: true
      });
    }
  }
});

// 5. Log into Discord
client.login(process.env.DISCORD_TOKEN);
