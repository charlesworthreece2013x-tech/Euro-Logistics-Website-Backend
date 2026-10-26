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

// 1. Setup Express Web Server
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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Define the /news slash command with options for media, spoiler, and layout choice
const commands = [
  new SlashCommandBuilder()
    .setName('news')
    .setDescription('Open the Euro Logistics News Dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption(option =>
      option.setName('media')
        .setDescription('Upload image, video, or sound file')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('layout')
        .setDescription('Choose layout: Banner (media bottom) or Side (thumbnail right)')
        .setRequired(false)
        .addChoices(
          { name: 'Banner (Media at Bottom)', value: 'banner' },
          { name: 'Side (Thumbnail on Right)', value: 'side' }
        )
    )
    .addBooleanOption(option =>
      option.setName('spoiler')
        .setDescription('Mark uploaded media attachment as a spoiler?')
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

    console.log('Registering News Dashboard command...');
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, '1564236424155373568'),
      { body: commands }
    );
    
    console.log('Successfully registered /news command!');
  } catch (error) {
    console.error('Error registering slash command:', error);
  }
});

// 3. Handle Interactions
client.on('interactionCreate', async interaction => {
  
  // A. Trigger /news command -> Cache settings and open Dashboard Modal
  if (interaction.isChatInputCommand() && interaction.commandName === 'news') {
    const attachment = interaction.options.getAttachment('media');
    const layout = interaction.options.getString('layout') || 'banner';
    const isSpoiler = interaction.options.getBoolean('spoiler') || false;

    // Cache user settings for this command invocation
    client.pendingNewsData = client.pendingNewsData || new Map();
    client.pendingNewsData.set(interaction.user.id, {
      attachment: attachment ? {
        url: attachment.url,
        name: attachment.name,
        contentType: attachment.contentType
      } : null,
      layout: layout,
      spoiler: isSpoiler
    });

    const modal = new ModalBuilder()
      .setCustomId('news_dashboard_modal')
      .setTitle('Euro Logistics News Dashboard');

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
      .setPlaceholder('Write your update. Markdown & ||spoilers|| work here...')
      .setRequired(true)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(postInput)
    );

    await interaction.showModal(modal);
  }

  // B. Handle Modal Submission
  if (interaction.isModalSubmit() && interaction.customId === 'news_dashboard_modal') {
    const title = interaction.fields.getTextInputValue('news_title');
    const postContent = interaction.fields.getTextInputValue('news_post');
    const config = client.pendingNewsData?.get(interaction.user.id) || { layout: 'banner', spoiler: false };

    // Build base Euro Logistics Blue embed (without truck emoji)
    const newsEmbed = {
      color: 0x53B7ED,
      title: title,
      description: postContent,
      footer: {
        text: `Published by ${interaction.user.tag} • Euro Logistics VTC`,
      },
      timestamp: new Date().toISOString()
    };

    let replyMessage;

    if (config.attachment) {
      const isImage = config.attachment.contentType?.startsWith('image/');

      if (isImage && !config.spoiler) {
        if (config.layout === 'side') {
          // Side layout: thumbnail image on top right
          newsEmbed.thumbnail = { url: config.attachment.url };
        } else {
          // Banner layout: large image at bottom
          newsEmbed.image = { url: config.attachment.url };
        }
        replyMessage = await interaction.reply({ embeds: [newsEmbed], fetchReply: true });
      } else {
        // Videos, audio files (sound), or spoiler-tagged media
        const attachmentFile = new AttachmentBuilder(config.attachment.url, { 
          name: config.attachment.name 
        });

        if (config.spoiler) {
          attachmentFile.setSpoiler(true);
        }

        replyMessage = await interaction.reply({
          embeds: [newsEmbed],
          files: [attachmentFile],
          fetchReply: true
        });
      }
