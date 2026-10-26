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

// Define the /news slash command with direct file upload & spoiler toggle
const commands = [
  new SlashCommandBuilder()
    .setName('news')
    .setDescription('Open the Euro Logistics News Dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption(option =>
      option.setName('media')
        .setDescription('Upload an image, video, or sound file directly')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('spoiler')
        .setDescription('Mark uploaded media as a spoiler? (True/False)')
        .setRequired(false)
    )
];

// Register slash command cleanly
client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Cleaning up old global commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });

    console.log('Registering News Dashboard command with file upload...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1564236424155373568'),
      { body: commands }
    );
    
    console.log('Successfully registered /news dashboard command!');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
});

// 3. Handle Interactions
client.on('interactionCreate', async interaction => {
  
  // A. Handle /news command -> Cache uploaded file & open Modal Form
  if (interaction.isChatInputCommand() && interaction.commandName === 'news') {
    const attachment = interaction.options.getAttachment('media');
    const isSpoiler = interaction.options.getBoolean('spoiler') || false;

    if (attachment) {
      client.pendingNewsMedia = client.pendingNewsMedia || new Map();
      client.pendingNewsMedia.set(interaction.user.id, {
        url: attachment.url,
        name: attachment.name,
        contentType: attachment.contentType,
        spoiler: isSpoiler
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('truckline_news_modal')
      .setTitle('🚚 Euro Logistics News Dashboard');

    const titleInput = new TextInputBuilder()
      .setCustomId('news_title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('What is this update about?')
      .setRequired(true)
      .setMaxLength(200);

    const postInput = new TextInputBuilder()
      .setCustomId('news_post')
      .setLabel('Post Content / Markdown')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Write your update. Markdown works here...')
      .setRequired(true)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(postInput)
    );

    await interaction.showModal(modal);
  }

  // B. Handle Modal Form Submission & Publish Embed with Uploaded File
  if (interaction.isModalSubmit() && interaction.customId === 'truckline_news_modal') {
    const title = interaction.fields.getTextInputValue('news_title');
    const postContent = interaction.fields.getTextInputValue('news_post');
    const media = client.pendingNewsMedia?.get(interaction.user.id);

    const newsEmbed = {
      color: 0x53B7ED, // Euro Logistics Blue Theme
      title: `🚚 ${title}`,
      description: postContent,
      footer: {
        text: `Published by ${interaction.user.tag} • Euro Logistics VTC`,
      },
      timestamp: new Date().toISOString()
    };

    if (media) {
      const isImage = media.contentType?.startsWith('image/');
      
      if (isImage && !media.spoiler) {
        newsEmbed.image = { url: media.url };
        await interaction.reply({ embeds: [newsEmbed] });
      } else {
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

      client.pendingNewsMedia.delete(interaction.user.id);
    } else {
      await interaction.reply({ embeds: [newsEmbed] });
    }
  }
});

// 4. Log into Discord
client.login(process.env.DISCORD_TOKEN);
