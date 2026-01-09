from flask import Flask, request, jsonify
from datetime import datetime
from flask_cors import CORS
import json
import os

app = Flask(__name__)
CORS(app)

LOG_FILE = "telemetry.ndjson"

# =====================================
# POST → append telemetry
# =====================================
@app.route("/telemetry", methods=["POST"])
def post_telemetry():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Invalid JSON"}), 400

    data["timestamp"] = datetime.utcnow().isoformat() + "Z"

    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(data) + "\n")

    return jsonify({"status": "ok"}), 200


# =====================================
# GET → read telemetry
# =====================================
@app.route("/telemetry", methods=["GET"])
def get_telemetry():
    if not os.path.exists(LOG_FILE):
        return jsonify([]), 200

    limit = request.args.get("limit", default=100, type=int)

    records = []
    with open(LOG_FILE, "r") as f:
        for line in f:
            records.append(json.loads(line))

    return jsonify(records[-limit:]), 200


# =====================================
# Health check
# =====================================
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "running"}), 200


# =====================================
# Start server
# =====================================
if __name__ == "__main__":
    print("🚀 Telemetry API running on port 5000")
    app.run(host="0.0.0.0", port=5000, debug=False)
