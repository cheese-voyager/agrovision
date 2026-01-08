from pymavlink import mavutil
import math
import time
from flask import Flask, jsonify
import threading

app = Flask(__name__)

# shared attitude values
roll = 0.0
pitch = 0.0
yaw = 0.0

# lock to ensure Flask reads the same numbers printed
lock = threading.Lock()

def mavloop():
    global roll, pitch, yaw

    # Koneksi ke Pixhawk
    master = mavutil.mavlink_connection(
        '/dev/serial0',   # atau /dev/ttyAMA0
        baud=57600
    )

    print("Menunggu heartbeat...")
    master.wait_heartbeat()
    print("Terhubung ke Pixhawk!")

    while True:
        msg = master.recv_match(type='ATTITUDE', blocking=True)
        if msg:
            r = math.degrees(msg.roll)
            p = math.degrees(msg.pitch)
            y = math.degrees(msg.yaw)

            # update shared values safely
            with lock:
                roll = r
                pitch = p
                yaw = y

            # print EXACTLY what API will return
            print(f"Roll: {r:.2f}° | Pitch: {p:.2f}° | Yaw: {y:.2f}")

        time.sleep(0.01)

@app.route("/attitude", methods=["GET"])
def get_attitude():
    with lock:
        return jsonify({
            "roll": round(roll, 2),
            "pitch": round(pitch, 2),
            "yaw": round(yaw, 2)
        })

def run_flask():
    app.run(host="0.0.0.0", port=5000)

if __name__ == "__main__":
    t = threading.Thread(target=mavloop, daemon=True)
    t.start()
    run_flask()
