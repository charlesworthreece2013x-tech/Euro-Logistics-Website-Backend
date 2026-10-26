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

// Define the /news slash command with optional media attachment & spoiler toggle
const commands = [
  new SlashCommandBuilder()
    .setName('news')
    .setDescription('Open the News Dashboard to create an announcement')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption(option =>
      option.setName('media')
        .setDescription('Optional image, video, or sound file to include')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('spoiler')
        .setDescription('Mark attached media/video as a spoiler? (True/False)')
        .setRequired(false)
    )
];

// Register slash command directly to your server ID for instant access
client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Registering News Dashboard slash command...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1564236424155373568'),
      { body: commands }
    );
    console.log('Successfully registered /news command for your server!');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
});

// 3. Handle Interactions (/news trigger & Modal Dashboard submission)
client.on('interactionCreate', async interaction => {
  
  // A. Handle /news command execution -> Opens Modal Dashboard
  if (interaction.isChatInputCommand() && interaction.commandName === 'news') {
    const attachment = interaction.options.getAttachment('media');
    const isSpoiler = interaction.options.getBoolean('spoiler') || false;

    // Store attachment info temporarily if media was attached
    if (attachment) {
      client.pendingNewsMedia = client.pendingNewsMedia || new Map();
      client.pendingNewsMedia.set(interaction.user.id, {
        url: attachment.url,
        name: attachment.name,
        contentType: attachment.contentType,
        spoiler: isSpoiler
      });
    }

    // Build the Dashboard Form (Modal)
    const modal = new ModalBuilder()
      .setCustomId('news_dashboard_modal')
      .setTitle('🚚 Euro Logistics News Dashboard');

    const titleInput = new TextInputBuilder()
      .setCustomId('news_title')
      .setLabel('Announcement Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Weekly Convoy Update / Fleet Expansion!')
      .setRequired(true)
      .setMaxLength(256);

    const descInput = new TextInputBuilder()
      .setCustomId('news_description')
      .setLabel('News Description / Details')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter full news details here...')
      .setRequired(true)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(descInput)
    );

    await interaction.showModal(modal);
  }

  // B. Handle Modal Form Submission
  if (interaction.isModalSubmit() && interaction.customId === 'news_dashboard_modal') {
    const title = interaction.fields.getTextInputValue('news_title');
    const description = interaction.fields.getTextInputValue('news_description');

    // Retrieve pending media attached during /news execution
    const media = client.pendingNewsMedia?.get(interaction.user.id);

    const newsEmbed = {
      color: 0x53B7ED, // Euro Logistics Blue Theme
      title: `🚚 ${title}`,
      description: description,
      footer: {
        text: `Published by ${interaction.user.tag}`,
      },
      timestamp: new Date().toISOString()
    };

    // Process attached media & spoilers
    if (media) {
      const isImage = media.contentType?.startsWith('image/');
      
      if (isImage && !media.spoiler) {
        // Embed image directly into the embed card
        newsEmbed.image = { url: media.url };
        await interaction.reply({ embeds: [newsEmbed] });
      } else {
        // Handle videos, audio, or media marked as spoiler
        const attachmentFile = new AttachmentBuilder(media.url, { 
          name: media.name 
        });

        if (media.spoiler) {
          attachmentFile.setSpoiler(true);
        }

        await interaction.reply({
          embeds: [newsEmbed],
          files: [attachmentFile]
        });
      }

      // Clear cached attachment memory
      client.pendingNewsMedia.delete(interaction.user.id);
    } else {
      // Text-only news submission
      await interaction.reply({ embeds: [newsEmbed] });
    }
  }
});

// 4. Log into Discord
client.login(process.env.DISCORD_TOKEN);
