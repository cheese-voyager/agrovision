(() => {
  "use strict";

  console.log("Live Camera JS loaded");

  /* ===============================
     CONFIG (edit if your backend differs)
  ================================= */
  const API_BASE = "http://192.168.137.6:5000";

  // Stream endpoint (common for Flask MJPEG): /video_feed
  const STREAM_URL = `${API_BASE}/video_feed`;

  // Soil endpoint (example). Change to your real endpoint.
  const SOIL_URL = `${API_BASE}/soil/latest`;

  // Optional: if you have weather/recommendation endpoints, you can wire them here.
  // const WEATHER_URL = `${API_BASE}/weather/latest`;
  // const RECO_URL = `${API_BASE}/recommendation/latest`;

  const REQUEST_TIMEOUT_MS = 2500;

  /* ===============================
     DOM
  ================================= */
  const moistureSpan = document.querySelector("#live-soil-moisture");
  const moistureBar = document.querySelector("#live-soil-moisture-bar");
  const tempSpan = document.querySelector("#live-soil-temp");
  const statusSpan = document.querySelector("#live-soil-status");
  const refreshBtn = document.querySelector("#refresh-soil");
  const lastUpdated = document.querySelector("#soil-last-updated");

  const streamImg = document.querySelector("#live-stream");
  const streamPlaceholder = document.querySelector("#stream-placeholder");

  const streamSubtitle = document.querySelector("#stream-subtitle");
  const streamDot = document.querySelector("#stream-dot");
  const streamText = document.querySelector("#stream-text");

  const streamBadgeDot = document.querySelector("#stream-badge-dot");
  const streamBadgeText = document.querySelector("#stream-badge-text");

  const streamPillDot = document.querySelector("#stream-pill-dot");
  const streamPillText = document.querySelector("#stream-pill-text");

  const topLiveDot = document.querySelector("#live-status-dot");
  const topLiveText = document.querySelector("#live-status-text");

  const weatherEl = document.querySelector("#live-weather");
  const recoEl = document.querySelector("#live-reco");

  /* ===============================
     HELPERS
  ================================= */
  function setDot(dotEl, ok) {
    if (!dotEl) return;
    dotEl.className = ok
      ? "inline-flex h-2 w-2 rounded-full bg-emerald-500"
      : "inline-flex h-2 w-2 rounded-full bg-rose-500";
  }

  function setStreamUI(isOnline) {
    // Top bar
    setDot(topLiveDot, isOnline);
    if (topLiveText) topLiveText.textContent = isOnline ? "LIVE View" : "Stream Offline";

    // Header pill
    setDot(streamPillDot, isOnline);
    if (streamPillText) streamPillText.textContent = isOnline ? "LIVE" : "OFFLINE";

    // Right header badge
    setDot(streamDot, isOnline);
    if (streamText) streamText.textContent = isOnline ? "LIVE" : "OFFLINE";

    // Corner badge
    if (streamBadgeDot) {
      streamBadgeDot.className = isOnline
        ? "inline-flex h-2 w-2 rounded-full bg-emerald-400"
        : "inline-flex h-2 w-2 rounded-full bg-rose-400";
    }
    if (streamBadgeText) streamBadgeText.textContent = isOnline ? "LIVE" : "OFFLINE";

    if (streamSubtitle) {
      streamSubtitle.textContent = isOnline
        ? "Streaming from backend camera."
        : "Unable to connect to camera stream.";
    }
  }

  function setSoilStatusLabel(text) {
    if (!statusSpan) return;

    const t = String(text || "--");
    statusSpan.textContent = t;

    const normalized = t.toLowerCase();
    const isGood =
      normalized.includes("suitable") ||
      normalized.includes("good") ||
      normalized.includes("optimal");

    if (isGood) {
      statusSpan.className =
        "inline-flex items-center px-2 py-1 rounded-full bg-green-50 text-green-700 font-semibold";
    } else if (t === "--") {
      statusSpan.className =
        "inline-flex items-center px-2 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold dark:bg-slate-800 dark:text-slate-200";
    } else {
      statusSpan.className =
        "inline-flex items-center px-2 py-1 rounded-full bg-red-50 text-red-700 font-semibold";
    }
  }

  function clamp(n, min, max) {
    const x = Number(n);
    if (Number.isNaN(x)) return min;
    return Math.min(Math.max(x, min), max);
  }

  function fmtTime(d = new Date()) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
    } finally {
      clearTimeout(t);
    }
  }

  /* ===============================
     STREAM
  ================================= */
  function connectStream() {
    if (!streamImg) return;

    // Start optimistic
    setStreamUI(true);

    // MJPEG stream via <img src="...">
    const src = `${STREAM_URL}?t=${Date.now()}`;
    streamImg.src = src;

    const onOk = () => {
      if (streamPlaceholder) streamPlaceholder.classList.add("hidden");
      streamImg.classList.remove("hidden");
      setStreamUI(true);
    };

    const onErr = () => {
      streamImg.classList.add("hidden");
      if (streamPlaceholder) streamPlaceholder.classList.remove("hidden");
      setStreamUI(false);
    };

    streamImg.addEventListener("load", onOk, { once: true });
    streamImg.addEventListener("error", onErr, { once: true });

    // If stream drops later, onerror will not always fire reliably on MJPEG.
    // This is a lightweight “health check” by reloading a ping image occasionally.
    setInterval(() => {
      // Only ping if we already have a stream element
      const ping = new Image();
      ping.onload = () => setStreamUI(true);
      ping.onerror = () => setStreamUI(false);
      ping.src = `${STREAM_URL}?ping=${Date.now()}`;
    }, 4000);
  }

  /* ===============================
     SOIL DATA
  ================================= */
  function renderSoil({ moisture, temperature, status, weather, recommendation }) {
    const m = clamp(moisture, 0, 100);
    const t = Number(temperature);

    if (moistureSpan) moistureSpan.textContent = Number.isFinite(m) ? `${Math.round(m)}%` : "--%";
    if (moistureBar) moistureBar.style.width = Number.isFinite(m) ? `${m}%` : "0%";

    if (tempSpan) tempSpan.textContent = Number.isFinite(t) ? `${t.toFixed(0)}°C` : "--°C";

    setSoilStatusLabel(status);

    if (weatherEl) weatherEl.textContent = weather ? String(weather) : "—";
    if (recoEl) recoEl.textContent = recommendation ? String(recommendation) : "—";

    if (lastUpdated) lastUpdated.textContent = fmtTime(new Date());
  }

  async function fetchSoilData() {
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.classList.add("opacity-80", "cursor-not-allowed");
    }

    try {
      const res = await fetchWithTimeout(SOIL_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // Accept flexible payloads:
      // { moisture: 55, temperature: 27, status: "Suitable" }
      // or { soil: { moisture, temperature, suitability } }
      const soil = (data && typeof data.soil === "object") ? data.soil : data;

      const moisture =
        soil?.moisture ?? soil?.soil_moisture ?? soil?.humidity ?? null;

      const temperature =
        soil?.temperature ?? soil?.soil_temp ?? soil?.temp ?? null;

      const status =
        soil?.status ?? soil?.suitability ?? soil?.soil_status ?? "--";

      renderSoil({
        moisture,
        temperature,
        status,
        weather: data?.weather ?? soil?.weather ?? null,
        recommendation: data?.recommendation ?? soil?.recommendation ?? null,
      });
    } catch (err) {
      console.error("Failed to fetch soil data:", err);
      // Keep UI stable: just mark unknown + update lastUpdated
      renderSoil({ moisture: null, temperature: null, status: "--" });
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove("opacity-80", "cursor-not-allowed");
      }
    }
  }

  /* ===============================
     INIT
  ================================= */
  function init() {
    // Defaults
    setSoilStatusLabel("--");
    if (weatherEl) weatherEl.textContent = "—";
    if (recoEl) recoEl.textContent = "—";
    if (lastUpdated) lastUpdated.textContent = "—";

    if (refreshBtn) {
      refreshBtn.addEventListener("click", fetchSoilData);
    }

    connectStream();
    fetchSoilData();

    // Optional polling
    setInterval(fetchSoilData, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
