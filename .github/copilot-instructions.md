<!--
Guidance for AI coding agents working on this repository.
Keep this file concise and actionable — reference concrete files and commands.
-->
# Repo-specific Copilot Instructions

Summary
- Small Raspberry Pi / drone demo combining: a lightweight Flask telemetry API, a local ML inference script, and a static demo frontend under `docs/`.

Quick architecture
- `backend/app.py`: single-file Flask service. Exposes `POST /telemetry` (appends NDJSON) and `GET /telemetry?limit=N` (returns last N records). Log file is `telemetry.ndjson` (path is relative to the process CWD).
- `main.py`: local inference tool that loads `soil_model_saved.keras`, captures a webcam feed, runs MobileNetV3 preprocessing and predicts one of the classes in `class_names`. Quits on `q`.
- `docs/`: static UI (HTML/CSS/JS). The UI is a simulated/demo dashboard — `docs/js/live.js` generates randomized soil data and does not call the backend telemetry API by default.
- `soil_model_saved.keras`: trained Keras model (in root) used by `main.py`.

Important developer workflows
- Run telemetry API (from project root):
  - `cd backend` then `python app.py` — Flask server listens on `0.0.0.0:5000`.
  - NOTE: `telemetry.ndjson` will be created in the working directory where `app.py` runs.
- Run local classifier (desktop with webcam):
  - `python main.py` — requires `tensorflow`, `opencv-python`, and `numpy`.
  - The script expects `soil_model_saved.keras` next to `main.py`/project root and `IMG_SIZE = 128`. Preprocessing uses `tf.keras.applications.mobilenet_v3.preprocess_input` (must match training).

API / data conventions
- Telemetry POST: accepts any JSON body. Server appends a `timestamp` field in UTC ISO format ending with `Z` and stores one JSON object per line in `telemetry.ndjson`.
- Telemetry GET: returns an array of JSON objects (the server reads all lines and returns the last `limit` entries). The `limit` query param defaults to 100.

Project-specific patterns & gotchas
- ML class ordering is significant: `main.py` defines `class_names` and comments warn it must match `train_ds.class_names` used during training — do not reorder or change without retraining.
- The frontend in `docs/` is demonstrative. `docs/js/live.js` and `docs/js/dashboard.js` contain simulated telemetry and camera placeholders; integrating real telemetry/streaming will require editing these files to call `http://<host>:5000/telemetry` and handling CORS (server already uses `flask_cors` in `backend/app.py`).
- `backend/app.py` is intentionally minimal: no auth, no DB, file-based NDJSON logging. Preserve format when adding features if backward compatibility with existing NDJSON consumers is required.

Where to look first for common tasks
- Add telemetry fields / change schema: `backend/app.py` and search for `telemetry.ndjson`.
- Integrate real telemetry into UI: `docs/js/live.js`, `docs/js/dashboard.js`, and the relevant HTML under `docs/`.
- Update ML inference or replace model: `main.py` and `soil_model_saved.keras`.

Examples
- Example POST (any valid JSON; server will add timestamp):
  - `curl -X POST http://localhost:5000/telemetry -H "Content-Type: application/json" -d '{"device":"pixhawk","moisture":52}'`
- Fetch recent telemetry:
  - `curl http://localhost:5000/telemetry?limit=10`

What not to change without coordination
- `class_names` order in `main.py` unless you also retrain or update the model.
- The NDJSON format in `telemetry.ndjson` — many utilities expect one JSON object per line.

If you need more
- Ask the maintainer which environment/version of TensorFlow was used to train `soil_model_saved.keras` before attempting model upgrades.
- If you plan to convert the static `docs/` UI into a dynamic SPA, prefer small, incremental changes and keep a fallback demo state (the randomized simulation) for local development.

----
Please review these notes and tell me any missing areas to expand (CI, tests, deployment, or model training details).
