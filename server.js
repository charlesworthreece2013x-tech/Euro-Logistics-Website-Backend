const express = require('express');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder
} = require('discord.js');

// 1. Setup Express Web Server
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

// 2. Setup Discord Bot Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Define the /news slash command with file upload & spoiler toggle
const commands = [
  new SlashCommandBuilder()
    .setName('news')
    .setDescription('Open the Euro Logistics News Dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption(option =>
      option.setName('cover_file')
        .setDescription('Upload cover image, video, or sound file (Optional)')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('spoiler')
        .setDescription('Mark uploaded file as spoiler? (True/False)')
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

// Store active dashboard sessions per user
client.dashboardSessions = new Map();

// 3. Handle Interactions
client.on('interactionCreate', async interaction => {
  
  // A. Trigger /news command -> Opens Dashboard Control Panel
  if (interaction.isChatInputCommand() && interaction.commandName === 'news') {
    const file = interaction.options.getAttachment('cover_file');
    const isSpoiler = interaction.options.getBoolean('spoiler') || false;

    client.dashboardSessions.set(interaction.user.id, {
      file: file ? { url: file.url, name: file.name, contentType: file.contentType } : null,
      spoiler: isSpoiler,
      layout: 'banner' // Default layout choice
    });

    const layoutSelect = new StringSelectMenuBuilder()
      .setCustomId('news_layout_menu')
      .setPlaceholder('Select Layout Style...')
      .addOptions([
        { label: 'Image First / Banner Style (Media View)', value: 'banner', description: 'Large media display attached to the announcement' },
        { label: 'Thumbnail Side Style (Top Right)', value: 'side', description: 'Compact thumbnail next to your text' }
      ]);

    const continueBtn = new ButtonBuilder()
      .setCustomId('news_open_form_btn')
      .setLabel('✍️ Enter Title & Markdown Post')
      .setStyle(ButtonStyle.Success);

    const row1 = new ActionRowBuilder().addComponents(layoutSelect);
    const row2 = new ActionRowBuilder().addComponents(continueBtn);

    await interaction.reply({
      content: `### Euro Logistics News Dashboard\n* **Cover File Uploaded:** ${file ? file.name : 'None (Text Only)'}\n* **Spoiler Enabled:** \`${isSpoiler}\`\n\nChoose your layout style below, then click to write your post content:`,
      components: [row1, row2],
      ephemeral: true
    });
  }

  // B. Handle Layout Selection Dropdown
  if (interaction.isStringSelectMenu() && interaction.customId === 'news_layout_menu') {
    const session = client.dashboardSessions.get(interaction.user.id);
    if (session) {
      session.layout = interaction.values[0];
    }
    await interaction.update({ content: `✅ Layout style updated to: **${interaction.values[0].toUpperCase()}**\nClick the button below to proceed to the post editor.` });
  }

  // C. Handle Button to Open the Title & Markdown Modal Form
  if (interaction.isButton() && interaction.customId === 'news_open_form_btn') {
    const modal = new ModalBuilder()
      .setCustomId('news_publish_modal')
      .setTitle('Euro Logistics News Editor');

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

  // D. Handle Final Modal Submission & Publish Post
  if (interaction.isModalSubmit() && interaction.customId === 'news_publish_modal') {
    const title = interaction.fields.getTextInputValue('news_title');
    const postContent = interaction.fields.getTextInputValue('news_post');
    const session = client.dashboardSessions.get(interaction.user.id) || { layout: 'banner', spoiler: false, file: null };

    const newsEmbed = {
      color: 0x53B7ED, // Euro Logistics Blue Theme
      title: title,
      description: postContent,
      footer: {
        text: `Published by ${interaction.user.tag} • Euro Logistics VTC`,
      },
      timestamp: new Date().toISOString()
    };

    let publishedMessage;

    if (session.file) {
      const isImage = session.file.contentType?.startsWith('image/');

      if (isImage && !session.spoiler) {
        if (session.layout === 'side') {
          newsEmbed.thumbnail = { url: session.file.url };
        } else {
          newsEmbed.image = { url: session.file.url };
        }
        publishedMessage = await interaction.reply({ embeds: [newsEmbed], fetchReply: true });
      } else {
        // Videos, audio sound files, or spoiler-tagged images
        const attachmentFile = new AttachmentBuilder(session.file.url, { 
          name: session.file.name 
        });

        if (session.spoiler) {
          attachmentFile.setSpoiler(true);
        }

        publishedMessage = await interaction.reply({
          embeds: [newsEmbed],
          files: [attachmentFile],
          fetchReply: true
        });
      }
    } else {
      publishedMessage = await interaction.reply({ embeds: [newsEmbed], fetchReply: true });
    }

    // Add plenty of automated reaction emojis
    try {
      const reactionsList = ['👍', '🎉', '❤️', '🔥', '🚚', '⭐'];
      for (const emoji of reactionsList) {
        await publishedMessage.react(emoji);
      }
    } catch (err) {
      console.error('Failed to add reactions:', err);
    }

    client.dashboardSessions.delete(interaction.user.id);
  }
});

// 4. Log into Discord
client.login(process.env.DISCORD_TOKEN);
