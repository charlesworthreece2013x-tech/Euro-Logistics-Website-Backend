const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Serves all static files (HTML, CSS, JS) from the current root directory
app.use(express.static(__dirname));

// Live Telemetry API Endpoint
app.get('/api/fleet-stats', (req, res) => {
  res.json({
    status: "ONLINE",
    activeDrivers: 3,
