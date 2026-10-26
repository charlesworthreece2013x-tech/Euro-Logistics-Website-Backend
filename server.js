const express = require('express');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes 
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

// 2. Setup Discord Bot Client (Cleaned of all news commands & interactions)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions
  ]
});

// Clear out any old slash commands on startup so your menu stays completely clean
client.once('ready', async () => {
  console.log(`Euro Logistics Bot is online as ${client.user.tag}!`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Clearing old slash commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    await rest.put(Routes.applicationGuildCommands(client.user.id, '1564236424155373568'), { body: [] });
    console.log('Successfully cleared all slash commands.');
  } catch (error) {
    console.error('Error clearing commands:', error);
  }
});

// 3. Log into Discord
client.login(process.env.DISCORD_TOKEN);
