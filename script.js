const NODE_BACKEND_URL = 'https://euro-logistics-website-backend.onrender.com/api/fleet-stats';

const TRUCK_SVG = `<svg class="svg-icon svg-green" viewBox="0 0 24 24"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;

async function fetchNodeStats() {
  try {
    const response = await fetch(NODE_BACKEND_URL);
    if (!response.ok) throw new Error("Backend offline");
    const data = await response.json();
    renderFleetData(data);
  } catch (err) {
    // Fallback data if backend is offline
    renderFleetData({
      status: "ONLINE",
      activeDrivers: 3,
      totalMiles: 31750,
      drivers: [
        { name: "Euro Logistics", rank: "VTC Owner", miles: 18450, status: "On Duty" },
        { name: "Alpha_Hauler", rank: "Senior Driver", miles: 9200, status: "Driving ETS2" },
        { name: "Nordic_Trucker", rank: "Fleet Driver", miles: 4100, status: "In Convoy" }
      ]
    });
  }
}

function renderFleetData(data) {
  const driversElem = document.getElementById('stat-drivers');
  const milesElem = document.getElementById('stat-miles');
  const driverTable = document.getElementById('driver-list');
  const timeStamp = document.getElementById('last-updated');

  if (driversElem) driversElem.textContent = `${data.activeDrivers} Active`;
  if (milesElem) milesElem.textContent = `${data.totalMiles.toLocaleString()} mi`;
  if (timeStamp) timeStamp.textContent = `Sync: ${new Date().toLocaleTimeString()}`;

  if (driverTable && data.drivers) {
    driverTable.innerHTML = data.drivers.map(driver => `
      <tr>
        <td><strong>${driver.name}</strong></td>
        <td>${driver.rank}</td>
        <td>${driver.miles.toLocaleString()} mi</td>
        <td><span class="status-tag">${TRUCK_SVG} ${driver.status}</span></td>
      </tr>
    `).join('');
  }
}

function calculateRank() {
  const milesInput = document.getElementById('miles');
  const result = document.getElementById('calc-result');
  
  if (!milesInput) return;
  const miles = milesInput.value;
  
  if (!miles || miles <= 0) {
    result.textContent = "Enter your mileage above to check rank progression.";
    return;
  }
  
  if (miles < 1000) {
    result.innerHTML = "Status: <strong>Trainee Driver</strong> (Need " + (1000 - miles) + " more miles for Fleet Driver)";
  } else if (miles < 5000) {
    result.innerHTML = "Status: <strong>Fleet Driver</strong> (Need " + (5000 - miles) + " more miles for Senior Hauler)";
  } else if (miles < 10000) {
    result.innerHTML = "Status: <strong>Senior Hauler</strong> (Need " + (10000 - miles) + " more miles for Master Driver)";
  } else {
    result.innerHTML = "Status: <strong>Master Driver</strong> (Top Fleet Tier Achieved)";
  }
}

function toggleAccordion(button) {
  const item = button.parentElement;
  const isExpanded = item.classList.contains('active');
  
  document.querySelectorAll('.accordion-item').forEach(el => {
    el.classList.remove('active');
    const badge = el.querySelector('.acc-icon');
    if (badge) badge.textContent = '+';
  });

  if (!isExpanded) {
    item.classList.add('active');
    const badge = button.querySelector('.acc-icon');
    if (badge) badge.textContent = '-';
  }
}

// Poll backend every 1 second
fetchNodeStats();
setInterval(fetchNodeStats, 1000);
