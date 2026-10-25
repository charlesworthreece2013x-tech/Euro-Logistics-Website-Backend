const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

app.use(cors());
app.use(express.json());

// Serves your HTML, CSS, and JS directly from the current root directory
app.use(express.static(__dirname));

// Live Telemetry API Endpoint with 0 active drivers
app.get('/api/fleet-stats', (req, res) => {
  res.json({
    status: "ONLINE",
    activeDrivers: 0,
    totalMiles: 0,
    drivers: [] // Empty array
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Euro Logistics server running on port ${PORT}`);
});
