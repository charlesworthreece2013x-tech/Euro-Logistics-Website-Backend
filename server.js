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

// 2. Setup Discord Bot Client (Requires GuildMembers intent for role management)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages
  ]
});

// Slash Command definition for setting up the verification message
const commands = [
  new SlashCommandBuilder()
    .setName('setup-verification')
    .setDescription('Post the Euro Logistics verification embed with button')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption(option =>
      option.setName('driver_role')
        .setDescription('Select the Driver role to assign to verified users')
        .setRequired(true)
    )
];

// Register slash command on startup
client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Registering verification command...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1564236424155373568'),
      { body: commands }
    );
    console.log('Successfully registered /setup-verification command!');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
});

// 3. Handle Interactions (/setup-verification command & button clicks)
client.on('interactionCreate', async interaction => {
  
  // A. Execute /setup-verification
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup-verification') {
    const driverRole = interaction.options.getRole('driver_role');

    const embed = {
      color: 0x53B7ED, // Euro Logistics Blue
      title: 'Verification',
      description: 'Welcome to **Euro Logistics VTC**!\n\nTo gain full access to our community channels, driver resources, and event updates, please verify your account below.\n\n### How to Verify:\n1. Click the **Verify** button below.\n2. Receive your **Driver** role automatically.',
      footer: {
        text: 'Euro Logistics VTC • Driver Access System'
      },
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

  // B. Handle "Verify" Button Click
  if (interaction.isButton() && interaction.customId.startsWith('verify_driver_')) {
    const roleId = interaction.customId.replace('verify_driver_', '');
    const member = interaction.member;

    try {
      // Check if member already has the driver role
      if (member.roles.cache.has(roleId)) {
        return await interaction.reply({
          content: 'ℹ️ You are already verified and have the Driver role in **Euro Logistics**!',
          ephemeral: true
        });
      }

      // Assign the Driver role to the user
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

// 4. Log into Discord
client.login(process.env.DISCORD_TOKEN);
