const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

// 1. Setup Express Web Server (for your website telemetry & Render health checks)
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

client.on('messageCreate', message => {
  if (message.content === '!ping') {
    message.reply('Pong! Euro Logistics telemetry is active.');
  }
});

// 3. Log into Discord using your environment token
client.login(process.env.DISCORD_TOKEN);
