console.log("Dashboard JS loaded");

/* ===============================
   CONFIG
================================= */
const TELEMETRY_URL = "http://192.168.137.62:5000/telemetry";
const REFRESH_INTERVAL = 1000; // 1 second

/* ===============================
   DOM ELEMENTS
================================= */
const altitudeCanvas = document.getElementById("altitude-chart");
const timeFilter = document.getElementById("time-filter");
const timeFilterLabel = document.getElementById("time-filter-label");

const batteryLabel = document.getElementById("drone-battery");
const heightLabel = document.getElementById("drone-altitude");
const areaLabel = document.getElementById("drone-area");

/* ===============================
   STATE
================================= */
let altitudeChart = null;

/* ===============================
   HELPERS
================================= */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString();
}

/* ===============================
   FETCH TELEMETRY
================================= */
async function fetchTelemetry() {
  try {
    const res = await fetch(TELEMETRY_URL, { cache: "no-store" });
    return await res.json();
  } catch (err) {
    console.error("Telemetry fetch failed:", err);
    return [];
  }
}

/* ===============================
   UPDATE TEXT DATA
================================= */
function updateDerivedData(last) {
  if (!last?.attitude) return;

  const pitch = last.attitude.pitch;
  const roll = last.attitude.roll;
  const yaw = last.attitude.yaw;

  if (batteryLabel) batteryLabel.textContent = `${yaw.toFixed(1)}%`;
  if (heightLabel) heightLabel.textContent = `${roll.toFixed(2)} m`;
  if (areaLabel) areaLabel.textContent = `${yaw.toFixed(2)} m²`;
}

/* ===============================
   CHART INITIALIZATION
================================= */
function initChart() {
  if (!altitudeCanvas || typeof Chart === "undefined") return;

  altitudeChart = new Chart(altitudeCanvas, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Altitude (m)",
          data: [],
          tension: 0.4,
          borderWidth: 2,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      animation: false, // IMPORTANT for real-time
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: { beginAtZero: false },
      },
    },
  });
}

/* ===============================
   UPDATE DASHBOARD
================================= */
async function loadDashboard() {
  const telemetry = await fetchTelemetry();
  if (!telemetry.length || !altitudeChart) return;

  // Update chart
  altitudeChart.data.labels = telemetry.map(t =>
    formatTime(t.timestamp)
  );

  altitudeChart.data.datasets[0].data = telemetry.map(
    t => t.position.alt
  );

  altitudeChart.update("none");

  // Update UI labels (last data only)
  updateDerivedData(telemetry[telemetry.length - 1]);
}

/* ===============================
   TIME FILTER (OPTIONAL)
================================= */
function updateTimeLabel(range) {
  const map = {
    "1h": "Last 1 hour",
    "6h": "Last 6 hours",
    "24h": "Last 24 hours",
    "7d": "Last 7 days",
  };
  if (timeFilterLabel) {
    timeFilterLabel.textContent = map[range] || "Last 1 hour";
  }
}

if (timeFilter) {
  timeFilter.addEventListener("change", () => {
    updateTimeLabel(timeFilter.value);
    loadDashboard();
  });
}

/* ===============================
   START REAL-TIME LOOP
================================= */
initChart();
updateTimeLabel("1h");
loadDashboard();
setInterval(loadDashboard, REFRESH_INTERVAL);