const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

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
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);
});

// 3. News Command Handler
client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith('!news')) return;

  if (!message.member.permissions.has('Administrator')) {
    return message.reply('You do not have permission to use the news command.');
  }

  const newsContent = message.content.slice(5).trim();
  const attachment = message.attachments.first();

  if (!newsContent && !attachment) {
    return message.reply('Please provide news text or attach a file. Example: `!news Convoy details attached!`');
  }

  try {
    await message.delete();
  } catch (err) {
    console.error('Failed to delete command message:', err);
  }

  const newsEmbed = {
    color: 0x53B7ED,
    title: '🚚 Euro Logistics Official News',
    description: newsContent || '*(See attached media)*',
    footer: {
      text: `Published by ${message.author.tag}`,
    },
    timestamp: new Date().toISOString()
  };

  if (attachment && attachment.contentType?.startsWith('image/')) {
    newsEmbed.image = { url: attachment.url };
    await message.channel.send({ embeds: [newsEmbed] });
  } else if (attachment) {
    await message.channel.send({
      embeds: [newsEmbed],
      files: [attachment.url]
    });
  } else {
    await message.channel.send({ embeds: [newsEmbed] });
  }
});

// 4. Log into Discord
client.login(process.env.DISCORD_TOKEN);
