const express = require('express');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  AttachmentBuilder
} = require('discord.js');

// 1. Setup Express Web Server (for website telemetry & Render health checks)
const app = express();
const PORT = process.env.PORT || 10000;

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
    GatewayIntentBits.GuildMessages
  ]
});

// Define the /news slash command
const commands = [
  new SlashCommandBuilder()
    .setName('news')
    .setDescription('Open the Euro Logistics News Dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// Register slash command cleanly (clearing globals, setting server-specific)
client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Cleaning up old global commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });

    console.log('Registering Truckline-style News Dashboard command...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1564236424155373568'),
      { body: commands }
    );
    
    console.log('Successfully registered /news dashboard command!');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
});

// 3. Handle Interactions (/news trigger & Modal Dashboard submission)
client.on('interactionCreate', async interaction => {
  
  // A. Handle /news command -> Opens the Truckline-style Modal Form
  if (interaction.isChatInputCommand() && interaction.commandName === 'news') {
    const modal = new ModalBuilder()
      .setCustomId('truckline_news_modal')
      .setTitle('🚚 Euro Logistics News Dashboard');

    // Title Input (mirrors TrucklineMP Title box)
    const titleInput = new TextInputBuilder()
      .setCustomId('news_title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('What is this update about?')
      .setRequired(true)
      .setMaxLength(200);

    // Cover Image URL Input (mirrors TrucklineMP Cover image field)
    const coverImageInput = new TextInputBuilder()
      .setCustomId('news_cover_image')
      .setLabel('Cover Image (Optional HTTPS Link)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('https://')
      .setRequired(false);

    // Post / Description Body (mirrors TrucklineMP Post markdown box)
    const postInput = new TextInputBuilder()
      .setCustomId('news_post')
      .setLabel('Post Content / Markdown')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Write your update. Markdown works here...')
      .setRequired(true)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(coverImageInput),
      new ActionRowBuilder().addComponents(postInput)
    );

    await interaction.showModal(modal);
  }

  // B. Handle Modal Form Submission & Publish Embed
  if (interaction.isModalSubmit() && interaction.customId === 'truckline_news_modal') {
    const title = interaction.fields.getTextInputValue('news_title');
    const coverImage = interaction.fields.getTextInputValue('news_cover_image');
    const postContent = interaction.fields.getTextInputValue('news_post');

    const newsEmbed = {
      color: 0x53B7ED, // Euro Logistics Blue Theme
      title: `🚚 ${title}`,
      description: postContent,
      footer: {
        text: `Published by ${interaction.user.tag} • Euro Logistics VTC`,
      },
      timestamp: new Date().toISOString()
    };

    // Attach cover image if a valid URL was provided
    if (coverImage && coverImage.startsWith('http')) {
      newsEmbed.image = { url: coverImage };
    }

    await interaction.reply({ embeds: [newsEmbed] });
  }
});

// 4. Log into Discord
client.login(process.env.DISCORD_TOKEN);
