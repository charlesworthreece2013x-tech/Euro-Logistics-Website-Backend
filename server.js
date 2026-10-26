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

// Define the /news slash command
const commands = [
  new SlashCommandBuilder()
    .setName('news')
    .setDescription('Open the Interactive Euro Logistics News Dashboard')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addAttachmentOption(option =>
      option.setName('media')
        .setDescription('Upload image, video, or sound file')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('spoiler')
        .setDescription('Mark uploaded media as spoiler?')
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

// Store active dashboard sessions
client.dashboardSessions = new Map();

// 3. Handle Interactions
client.on('interactionCreate', async interaction => {
  
  // A. Trigger /news command -> Sends an interactive dashboard panel
  if (interaction.isChatInputCommand() && interaction.commandName === 'news') {
    const attachment = interaction.options.getAttachment('media');
    const isSpoiler = interaction.options.getBoolean('spoiler') || false;

    client.dashboardSessions.set(interaction.user.id, {
      attachment: attachment ? { url: attachment.url, name: attachment.name, contentType: attachment.contentType } : null,
      spoiler: isSpoiler,
      layout: 'banner', // Default: Image first / banner bottom
      reactions: ['👍', '🎉', '❤️', '🔥', '🚚']
    });

    const layoutSelect = new StringSelectMenuBuilder()
      .setCustomId('dashboard_layout_select')
      .setPlaceholder('Select News Layout Style...')
      .addOptions([
        { label: 'Banner Style (Image / Media First at Bottom)', value: 'banner', description: 'Large media view underneath text' },
        { label: 'Side-by-Side Style (Thumbnail on Right)', value: 'side', description: 'Compact thumbnail next to text' }
      ]);

    const openModalBtn = new ButtonBuilder()
      .setCustomId('dashboard_open_modal')
      .setLabel('✍️ Write Title & Post Content')
      .setStyle(ButtonStyle.Primary);

    const row1 = new ActionRowBuilder().addComponents(layoutSelect);
    const row2 = new ActionRowBuilder().addComponents(openModalBtn);

    await interaction.reply({
      content: `### 🚚 Euro Logistics News Dashboard\nConfigure your layout and content below:\n* **Attached Media:** ${attachment ? attachment.name : 'None'}\n* **Spoiler Enabled:** \`${isSpoiler}\``,
      components: [row1, row2],
      ephemeral: true
    });
  }

  // B. Handle Layout Select Menu
  if (interaction.isStringSelectMenu() && interaction.customId === 'dashboard_layout_select') {
    const session = client.dashboardSessions.get(interaction.user.id);
    if (session) {
      session.layout = interaction.values[0];
    }
    await interaction.update({ content: `✅ Layout updated to: **${interaction.values[0].toUpperCase()}**` });
  }

  // C. Handle Button to Open Text Modal Form
  if (interaction.isButton() && interaction.customId === 'dashboard_open_modal') {
    const modal = new ModalBuilder()
      .setCustomId('dashboard_final_modal')
      .setTitle('Euro Logistics News Content');

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

  // D. Handle Final Modal Submit & Publish
  if (interaction.isModalSubmit() && interaction.customId === 'dashboard_final_modal') {
    const title = interaction.fields.getTextInputValue('news_title');
    const postContent = interaction.fields.getTextInputValue('news_post');
    const session = client.dashboardSessions.get(interaction.user.id) || { layout: 'banner', spoiler: false, reactions: ['👍', '🎉', '❤️', '🔥', '🚚'] };

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

    if (session.attachment) {
      const isImage = session.attachment.contentType?.startsWith('image/');

      if (isImage && !session.spoiler) {
        if (session.layout === 'side') {
          newsEmbed.thumbnail = { url: session.attachment.url };
        } else {
          newsEmbed.image = { url: session.attachment.url };
        }
        replyMessage = await interaction.reply({ embeds: [newsEmbed], fetchReply: true });
      } else {
        const attachmentFile = new AttachmentBuilder(session.attachment.url, { 
          name: session.attachment.name 
        });

        if (session.spoiler) {
          attachmentFile.setSpoiler(true);
        }

        replyMessage = await interaction.reply({
          embeds: [newsEmbed],
          files: [attachmentFile],
          fetchReply: true
        });
      }
    } else {
      replyMessage = await interaction.reply({ embeds: [newsEmbed], fetchReply: true });
    }

    // Add plenty of reactions automatically
    try {
      for (const emoji of session.reactions) {
        await replyMessage.react(emoji);
      }
    } catch (err) {
      console.error('Failed to add reactions:', err);
    }

    client.dashboardSessions.delete(interaction.user.id);
  }
});

// 4. Log into Discord
client.login(process.env.DISCORD_TOKEN);
