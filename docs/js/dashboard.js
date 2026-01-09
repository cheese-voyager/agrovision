(() => {
  "use strict";

  console.log("Dashboard JS loaded");

  /* ===============================
     CONFIG
  ================================= */
  const API_BASE = "http://192.168.137.6:5000";
  const ENDPOINT_SERIES = `${API_BASE}/telemetry`; // GET /telemetry?limit=N -> array
  const ENDPOINT_LATEST = `${API_BASE}/telemetry?limit=1`;
  const REFRESH_INTERVAL = 500; // ms

  // Limit fetch biar nggak berat (backend kamu baca file lalu slice).
  // Silakan naikkan kalau telemetry rate kamu rendah dan ingin history lebih panjang.
  const RANGE_FETCH_LIMIT = {
    "1h": 800,
    "6h": 1500,
    "24h": 2500,
    "7d": 4000,
  };

  /* ===============================
     DOM ELEMENTS
  ================================= */
  const altitudeCanvas = document.getElementById("altitude-chart");
  const timeFilter = document.getElementById("time-filter");
  const timeFilterLabel = document.getElementById("time-filter-label");

  const droneStatusEl = document.getElementById("drone-status");
  const droneStatusDot = document.getElementById("drone-status-dot");

  const soilStatusLabel = document.getElementById("soil-status-label");

  const pitchEl = document.getElementById("drone-pitch");
  const yawEl = document.getElementById("drone-yaw");
  const rollEl = document.getElementById("drone-roll");

  const peakAltEl = document.getElementById("peak-alt");
  const avgAltEl = document.getElementById("avg-alt");
  const stabilityEl = document.getElementById("stability-label");

  /* ===============================
     STATE
  ================================= */
  let altitudeChart = null;
  let points = []; // { t: string|number, alt: number }
  let timer = null;
  let lastSeenTs = null; // string/number - used to avoid duplicate append

  /* ===============================
     HELPERS
  ================================= */
  function setOnline(isOnline) {
    if (droneStatusEl) droneStatusEl.textContent = isOnline ? "Online" : "Offline";
    if (droneStatusDot) {
      droneStatusDot.className = isOnline
        ? "inline-flex h-2 w-2 rounded-full bg-emerald-500"
        : "inline-flex h-2 w-2 rounded-full bg-rose-500";
    }
  }

  function formatTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return new Date().toLocaleTimeString();
    }
  }

  function updateTimeLabel(range) {
    const map = {
      "1h": "Last 1 hour",
      "6h": "Last 6 hours",
      "24h": "Last 24 hours",
      "7d": "Last 7 days",
    };
    if (timeFilterLabel) timeFilterLabel.textContent = map[range] || "Last 1 hour";
  }

  function rangeToDurationMs(range) {
    const H = 60 * 60 * 1000;
    const D = 24 * H;
    const map = {
      "1h": 1 * H,
      "6h": 6 * H,
      "24h": 24 * H,
      "7d": 7 * D,
    };
    return map[range] || 1 * H;
  }

  function getActiveRange() {
    return (timeFilter && timeFilter.value) ? timeFilter.value : "1h";
  }

  function getFetchLimitForRange(range) {
    return RANGE_FETCH_LIMIT[range] || 800;
  }

  function setSoilStatus(value) {
    if (!soilStatusLabel) return;

    const v = String(value ?? "").trim();
    const isSuitable = v.toLowerCase() === "suitable" || v.toLowerCase() === "good";

    soilStatusLabel.textContent = v || "—";
    soilStatusLabel.className = isSuitable
      ? "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300";
  }

  function setOrientation({ pitch, yaw, roll }) {
    if (pitchEl) pitchEl.textContent = Number.isFinite(pitch) ? `${pitch.toFixed(1)}°` : "—";
    if (yawEl) yawEl.textContent = Number.isFinite(yaw) ? `${yaw.toFixed(0)}°` : "—";
    if (rollEl) rollEl.textContent = Number.isFinite(roll) ? `${roll.toFixed(1)}°` : "—";
  }

  function computeStats(values) {
    if (!values.length) return { peak: null, avg: null, stability: null };

    let peak = -Infinity;
    let sum = 0;
    for (const v of values) {
      if (v > peak) peak = v;
      sum += v;
    }
    const avg = sum / values.length;

    let diffSum = 0;
    for (let i = 1; i < values.length; i++) {
      diffSum += Math.abs(values[i] - values[i - 1]);
    }
    const avgDiff = values.length > 1 ? diffSum / (values.length - 1) : 0;

    let stability = "Good";
    if (avgDiff > 2.5) stability = "Unstable";
    else if (avgDiff > 1.2) stability = "Fair";

    return { peak, avg, stability };
  }

  function coerceNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function toTimeMs(ts) {
    // ts bisa ISO string ("...Z") atau number
    const t = new Date(ts).getTime();
    return Number.isFinite(t) ? t : NaN;
  }

  /**
   * backend record typical:
   * { attitude:{roll,pitch,yaw}, position:{alt}, timestamp:"...Z", soil_status:"Suitable" }
   */
  function mapTelemetry(rec) {
    const att = rec && typeof rec.attitude === "object" ? rec.attitude : {};
    const pos = rec && typeof rec.position === "object" ? rec.position : {};

    const pitch = coerceNumber(att.pitch);
    const yaw = coerceNumber(att.yaw);
    const roll = coerceNumber(att.roll);

    const altitude = coerceNumber(pos.alt ?? rec.altitude);

    const soil_status =
      rec.soil_status ??
      rec.soilStatus ??
      (rec.soil && typeof rec.soil === "object" ? rec.soil.status : undefined);

    const timestamp = rec.timestamp ?? Date.now();

    return { pitch, yaw, roll, altitude, soil_status, timestamp };
  }

  function prunePointsByRange(range) {
    const duration = rangeToDurationMs(range);
    const cutoff = Date.now() - duration;

    points = points.filter((p) => {
      const ms = typeof p.t === "number" ? p.t : toTimeMs(p.t);
      // kalau timestamp invalid, keep aja supaya chart tetap ada
      if (!Number.isFinite(ms)) return true;
      return ms >= cutoff;
    });
  }

  /* ===============================
     CHART
  ================================= */
  function initChart() {
    if (!altitudeCanvas || typeof Chart === "undefined") return;

    const ctx = altitudeCanvas.getContext("2d");
    altitudeChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Altitude (m)",
            data: [],
            fill: false,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: false },
        },
      },
    });
  }

  function renderChart() {
    if (!altitudeChart) return;

    const labels = points.map((p) => formatTime(p.t));
    const values = points.map((p) => p.alt);

    altitudeChart.data.labels = labels;
    altitudeChart.data.datasets[0].data = values;
    altitudeChart.update("none");

    const { peak, avg, stability } = computeStats(values);

    if (peakAltEl) peakAltEl.textContent = peak == null ? "—" : `≈ ${peak.toFixed(1)} m`;
    if (avgAltEl) avgAltEl.textContent = avg == null ? "—" : `≈ ${avg.toFixed(1)} m`;
    if (stabilityEl) stabilityEl.textContent = stability || "—";
  }

  /* ===============================
     FETCH
  ================================= */
  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  async function fetchSeries(limit) {
    const url = `${ENDPOINT_SERIES}?limit=${encodeURIComponent(limit)}`;
    const data = await fetchJson(url);
    return Array.isArray(data) ? data : [];
  }

  async function fetchLatestRecord() {
    const data = await fetchJson(ENDPOINT_LATEST);
    if (Array.isArray(data)) return data.length ? data[data.length - 1] : null;
    return data && typeof data === "object" ? data : null;
  }

  /* ===============================
     HISTORY LOAD (REAL RANGE)
  ================================= */
  async function loadHistoryForRange(range) {
    const limit = getFetchLimitForRange(range);
    const duration = rangeToDurationMs(range);
    const cutoff = Date.now() - duration;

    const records = await fetchSeries(limit);

    // Map + filter by time
    const mapped = records
      .map(mapTelemetry)
      .filter((m) => {
        const ms = typeof m.timestamp === "number" ? m.timestamp : toTimeMs(m.timestamp);
        if (!Number.isFinite(ms)) return true; // keep if invalid
        return ms >= cutoff;
      })
      .filter((m) => Number.isFinite(m.altitude));

    // Build points
    points = mapped.map((m) => ({ t: m.timestamp, alt: m.altitude }));

    // Update latest UI from the last record in mapped list (or from raw last record)
    const lastMapped = mapped.length ? mapped[mapped.length - 1] : null;
    if (lastMapped) {
      setOnline(true);
      setOrientation({ pitch: lastMapped.pitch, yaw: lastMapped.yaw, roll: lastMapped.roll });
      setSoilStatus(lastMapped.soil_status);
      lastSeenTs = lastMapped.timestamp;
    } else {
      // no points within range; still set online if server reachable
      setOnline(true);
      lastSeenTs = null;
    }

    // prune (just in case) and render
    prunePointsByRange(range);
    renderChart();
  }

  /* ===============================
     LOOP
  ================================= */
  async function tick() {
    const range = getActiveRange();

    try {
      const rec = await fetchLatestRecord();
      if (!rec) {
        setOnline(false);
        return;
      }

      setOnline(true);

      const m = mapTelemetry(rec);

      // Update HUD (orientation + soil) always
      setOrientation({ pitch: m.pitch, yaw: m.yaw, roll: m.roll });
      setSoilStatus(m.soil_status);

      // Append only if this is a NEW record (avoid duplicates)
      const currentTs = m.timestamp ?? null;
      const isNew = currentTs != null && String(currentTs) !== String(lastSeenTs);

      if (isNew && Number.isFinite(m.altitude)) {
        points.push({ t: m.timestamp, alt: m.altitude });
        lastSeenTs = currentTs;
      }

      // Real range pruning (time-based)
      prunePointsByRange(range);

      renderChart();
    } catch (err) {
      console.error("Telemetry fetch failed:", err);
      setOnline(false);
    }
  }

  async function start() {
    initChart();

    const range = getActiveRange();
    updateTimeLabel(range);

    // initial: load real history for chosen range
    try {
      await loadHistoryForRange(range);
    } catch (e) {
      console.error("Initial history load failed:", e);
      setOnline(false);
    }

    if (timeFilter) {
      timeFilter.addEventListener("change", async () => {
        const r = timeFilter.value;
        updateTimeLabel(r);

        // Reload real history when range changes
        try {
          await loadHistoryForRange(r);
        } catch (e) {
          console.error("History reload failed:", e);
          // keep old chart, just mark offline if needed
        }
      });
    }

    // loop
    if (timer) clearInterval(timer);
    timer = setInterval(tick, REFRESH_INTERVAL);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => start());
  } else {
    start();
  }
})();
