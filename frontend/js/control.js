(() => {
  "use strict";

  console.log("Control Panel JS loaded");

  /* ===============================
     CONFIG (edit these if needed)
  ================================= */
  const API_BASE = "http://192.168.137.6:5000";

  // Optional: fetch initial state
  const STATUS_URL = `${API_BASE}/propellers/status`;

  // Send single propeller command
  const SET_URL = `${API_BASE}/propellers/set`;
  // Expected POST body:
  // { prop: "A", state: true }

  const REQUEST_TIMEOUT_MS = 2500;

  /* ===============================
     DOM
  ================================= */
  const propButtons = document.querySelectorAll(".prop-btn");
  const allButton = document.querySelector("#all-propellers");
  const logList = document.querySelector("#log-list");

  const statusText = document.getElementById("control-status");
  const statusDot = document.getElementById("control-status-dot");

  /* ===============================
     STATE
  ================================= */
  const propellerStatus = { A: false, B: false, C: false, D: false };
  const inflight = new Set(); // props currently being sent

  /* ===============================
     HELPERS
  ================================= */
  function nowTime() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function addLog(message) {
    if (!logList) return;
    const li = document.createElement("li");
    li.textContent = `[${nowTime()}] ${message}`;
    logList.prepend(li);
  }

  function setBackendStatus(isOnline, text) {
    if (statusText) statusText.textContent = text || (isOnline ? "Control Ready" : "Backend Offline");
    if (statusDot) {
      statusDot.className = isOnline
        ? "inline-flex h-2 w-2 rounded-full bg-emerald-500"
        : "inline-flex h-2 w-2 rounded-full bg-rose-500";
    }
  }

  function setButtonLoading(btn, loading) {
    btn.disabled = loading;
    btn.setAttribute("aria-busy", loading ? "true" : "false");
    btn.classList.toggle("opacity-70", loading);
    btn.classList.toggle("cursor-not-allowed", loading);
  }

  function updateButtonVisual(button, isOn) {
    const statusSpan = button.querySelector(".status-text");
    if (statusSpan) statusSpan.textContent = isOn ? "ON" : "OFF";

    button.setAttribute("aria-pressed", isOn ? "true" : "false");

    // ON styling (light + dark)
    const onClasses = ["border-emerald-500", "bg-emerald-50", "dark:bg-emerald-900/20"];
    const offClasses = ["bg-emerald-50", "dark:bg-emerald-900/20", "border-emerald-500"];

    if (isOn) {
      onClasses.forEach((c) => button.classList.add(c));
    } else {
      offClasses.forEach((c) => button.classList.remove(c));
    }
  }

  function applyAllUI() {
    propButtons.forEach((btn) => {
      const prop = btn.getAttribute("data-prop");
      if (!prop) return;
      updateButtonVisual(btn, !!propellerStatus[prop]);
    });
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal, cache: "no-store" });
      return res;
    } finally {
      clearTimeout(t);
    }
  }

  /* ===============================
     BACKEND CALLS
  ================================= */
  async function loadInitialStatus() {
    try {
      const res = await fetchWithTimeout(STATUS_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      // Accept flexible shapes:
      // { A:true, B:false, ... } OR { propellers:{A:true...} }
      const src = data?.propellers && typeof data.propellers === "object" ? data.propellers : data;

      ["A", "B", "C", "D"].forEach((k) => {
        if (typeof src?.[k] === "boolean") propellerStatus[k] = src[k];
      });

      applyAllUI();
      setBackendStatus(true, "Control Ready");
      addLog("Synced initial propeller states from backend.");
    } catch (err) {
      // Status endpoint is optional. Don’t break UI if missing.
      console.warn("Status sync failed:", err);
      setBackendStatus(false, "Backend Offline");
      addLog("Warning: unable to sync initial states (check backend).");
      applyAllUI();
    }
  }

  async function sendPropellerCommand(prop, state) {
    const payload = { prop, state: !!state };

    const res = await fetchWithTimeout(SET_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // response body optional
    try { await res.json(); } catch (_) {}
    return true;
  }

  /* ===============================
     EVENTS
  ================================= */
  function bindEvents() {
    propButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const prop = btn.getAttribute("data-prop");
        if (!prop || inflight.has(prop)) return;

        const prev = !!propellerStatus[prop];
        const next = !prev;

        // Optimistic UI
        propellerStatus[prop] = next;
        updateButtonVisual(btn, next);

        inflight.add(prop);
        setButtonLoading(btn, true);

        try {
          await sendPropellerCommand(prop, next);
          setBackendStatus(true, "Control Ready");
          addLog(`Propeller ${prop} turned ${next ? "ON" : "OFF"} (backend).`);
        } catch (err) {
          console.error("Command failed:", err);
          // Revert UI
          propellerStatus[prop] = prev;
          updateButtonVisual(btn, prev);
          setBackendStatus(false, "Backend Offline");
          addLog(`Error: failed to set Propeller ${prop}. Reverted.`);
        } finally {
          inflight.delete(prop);
          setButtonLoading(btn, false);
        }
      });
    });

    if (allButton) {
      allButton.addEventListener("click", async () => {
        // Determine action: if all ON => turn OFF else turn ON
        const allOn = Object.values(propellerStatus).every(Boolean);
        const turnOn = !allOn;

        // Disable bulk button while sending
        allButton.disabled = true;
        allButton.classList.add("opacity-80", "cursor-not-allowed");

        // Optimistic UI
        const prev = { ...propellerStatus };
        ["A", "B", "C", "D"].forEach((k) => (propellerStatus[k] = turnOn));
        applyAllUI();

        try {
          // Send sequentially (safe). If your backend supports bulk, you can replace with 1 request.
          for (const k of ["A", "B", "C", "D"]) {
            await sendPropellerCommand(k, turnOn);
          }
          setBackendStatus(true, "Control Ready");
          addLog(turnOn ? "All propellers turned ON (backend)." : "All propellers turned OFF (backend).");
        } catch (err) {
          console.error("Bulk command failed:", err);
          // Revert all
          Object.assign(propellerStatus, prev);
          applyAllUI();
          setBackendStatus(false, "Backend Offline");
          addLog("Error: failed to set ALL propellers. Reverted.");
        } finally {
          allButton.disabled = false;
          allButton.classList.remove("opacity-80", "cursor-not-allowed");
        }
      });
    }
  }

  /* ===============================
     INIT
  ================================= */
  function init() {
    setBackendStatus(true, "Control Ready");
    applyAllUI();
    bindEvents();
    loadInitialStatus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
