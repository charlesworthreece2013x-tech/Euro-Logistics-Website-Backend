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
  EmbedBuilder 
} = require('discord.js');
const express = require('express');

// ==========================================
// 1. EXPRESS KEEP-ALIVE SERVER (FOR RENDER)
// ==========================================
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Euro Logistics VTC Bot is Online!');
});

app.listen(PORT, () => {
  console.log(`[HTTP] Express server listening on port ${PORT}`);
});

// ==========================================
// 2. DISCORD CLIENT INITIALIZATION
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Environment Variables from Render Dashboard
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID || '1564236424155373568';

// Counting State
let currentCount = 0;
let lastCounterId = null;

// ==========================================
// 3. REGISTER SLASH COMMANDS
// ==========================================
const commands = [
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
    console.log('[BOT] Registering slash commands to guild...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('[BOT] Guild slash commands registered successfully!');
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

// Handling Slash Commands & Button Interactions
client.on('interactionCreate', async (interaction) => {
  try {
    // --------------------------------------
    // A. SLASH COMMANDS
    // --------------------------------------
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      // /setup-verification
      if (commandName === 'setup-verification') {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle('🎃 Euro Logistics VTC - Verification')
          .setDescription('Welcome to Euro Logistics! Click the button below to verify your account and access the server.')
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
          .setTitle('🛠️ Euro Logistics VTC - Support')
          .setDescription('Need help, have questions, or applying to join? Click below to open a ticket.')
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
          .setDescription('The counting game is ready! Start counting from **1**. Remember: no counting twice in a row!')
          .setColor('#FF6600');

        await interaction.channel.send({ embeds: [embed] });
        await interaction.editReply({ content: '✅ Counting panel deployed successfully!' });
      }

      // /clear
      else if (commandName === 'clear') {
        await interaction.deferReply({ ephemeral: true });
        const amount = interaction.options.getInteger('amount');

        if (amount < 1 || amount > 100) {
          return await interaction.editReply({ content: '⚠️ Please specify a number between 1 and 100.' });
        }

        try {
          await interaction.channel.bulkDelete(amount, true);
          await interaction.editReply({ content: `✅ Successfully cleared **${amount}** messages!` });
        } catch (err) {
          console.error('[ERROR] Clear command error:', err);
          await interaction.editReply({ content: '⚠️ Failed to clear messages. (Note: Discord cannot bulk-delete messages older than 14 days).' });
        }
      }

      // /other
      else if (commandName === 'other') {
        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
          .setTitle('🚛 Euro Logistics VTC')
          .setDescription('Official Euro Logistics VTC Community Services.')
          .addFields(
            { name: 'Platform', value: 'Truckline MP', inline: true },
            { name: 'Status', value: 'Actively Recruiting Drivers', inline: true }
          )
          .setColor('#FF6600');

        await interaction.editReply({ embeds: [embed] });
      }
    }

    // --------------------------------------
    // B. BUTTON CLICK HANDLERS
    // --------------------------------------
    else if (interaction.isButton()) {
      await interaction.deferReply({ ephemeral: true });

      if (interaction.customId === 'btn_verify') {
        try {
          const role = interaction.guild.roles.cache.find(
            r => r.name.toLowerCase() === 'driver' || 
                 r.name.toLowerCase() === 'member' || 
                 r.name.toLowerCase() === 'verified'
          );

          if (role) {
            await interaction.member.roles.add(role);
            await interaction.editReply({ content: `✅ Verification complete! Assigned role: **${role.name}**.` });
          } else {
            await interaction.editReply({ content: '✅ You are verified! (Tip: Create a role named "Driver" in Server Settings to auto-assign it here).' });
          }
        } catch (roleError) {
          console.error('[ERROR] Role assignment failed:', roleError);
          await interaction.editReply({ content: '⚠️ Verified, but could not assign the role. Make sure the bot role is placed **above** the target role in Server Settings ➔ Roles.' });
        }
      }

      else if (interaction.customId === 'btn_support_ticket') {
        await interaction.editReply({ content: '📩 Support request received! A team member will assist you shortly.' });
      }
    }
  } catch (error) {
    console.error('[ERROR] Interaction handling error:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: '⚠️ An error occurred while processing this command.' }).catch(() => {});
    } else {
      await interaction.reply({ content: '⚠️ An error occurred.', ephemeral: true }).catch(() => {});
    }
  }
});

// --------------------------------------
// C. MESSAGE LISTENER (COUNTING GAME)
// --------------------------------------
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.name && message.channel.name.toLowerCase().includes('counting')) {
    const userNumber = parseInt(message.content.trim(), 10);

    if (isNaN(userNumber)) return;

    try {
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
        await message.reply(`❌ Wrong number! The next number was **${currentCount + 1}**. Count reset to **0**.`);
        currentCount = 0;
        lastCounterId = null;
      }
    } catch (err) {
      console.error('[ERROR] Counting error:', err);
    }
  }
});

// ==========================================
// 5. START BOT
// ==========================================
client.login(TOKEN);
