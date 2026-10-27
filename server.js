const express = require('express');
const path = require('path');
const { 
  Client, 
  GatewayIntentBits, 
  REST, 
  Routes,
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  ChannelType
} = require('discord.js');

// =========================================================================
// 1. SETUP EXPRESS WEB SERVER (Website, Static Files & Fleet Telemetry API)
// =========================================================================
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Dynamic Telemetry API Endpoint integrated with TrucklineMP live map API
app.get('/api/fleet-stats', async (req, res) => {
  const targetPlayer = 'transit'; // Your in-game profile name

  try {
    let isOnline = false;
    let serverName = 'Europe Traffic';
    let loggedMiles = 544;

    const mapResponse = await fetch(`https://api.trucklinemp.com/v1/map/players?search=${encodeURIComponent(targetPlayer)}`, {
      headers: { 
        'User-Agent': 'EuroLogisticsVTC-Web/1.0',
        'Accept': 'application/json'
      }
    });

    if (mapResponse.ok) {
      const data = await mapResponse.json();
      
      const playerSession = Array.isArray(data) 
        ? data.find(p => p.username && p.username.toLowerCase() === targetPlayer.toLowerCase())
        : (data.username && data.username.toLowerCase() === targetPlayer.toLowerCase() ? data : null);

      if (playerSession) {
        isOnline = true;
        serverName = playerSession.server || 'Europe Traffic';
        if (playerSession.distance) {
          loggedMiles = playerSession.distance;
        }
      }
    }

    const driversList = isOnline ? [
      {
        name: targetPlayer,
        rank: "VTC Owner",
        miles: loggedMiles,
        status: `Driving ETS2 (${serverName})`
      }
    ] : [];

    res.json({
      status: "ONLINE",
      activeDrivers: driversList.length,
      totalMiles: isOnline ? loggedMiles : 0,
      drivers: driversList
    });

  } catch (error) {
    console.error('Error fetching TrucklineMP API:', error.message);

    res.json({
      status: "ONLINE",
      activeDrivers: 0,
      totalMiles: 0,
      drivers: []
    });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Euro Logistics server running on port ${PORT}`);
});

// =========================================================================
// 2. SETUP DISCORD BOT CLIENT (With GuildMembers, MessageContent & Presences)
// =========================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // Required for reading text content & replying
    GatewayIntentBits.GuildPresences // Required for checking online/offline staff status
  ]
});

// Target Staff Roles for Support & Availability Checks
