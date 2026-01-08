import time
import math
import threading
from pymavlink import mavutil
from flask import Flask, jsonify, request, render_template
from datetime import datetime

# --- Konfigurasi MAVLink (Sama seperti skrip Anda) ---
serial_port = '/dev/serial0'
baud_rate = 115200
stream_rate_hz = 10

master = None
connection_status = "Disconnected"

# 1. Variabel untuk menyimpan data attitude
# Menggunakan list untuk menumpuk data (tidak overwrite)
attitude_data = {
    "records": []
}

latest_attitude = {
    "timestamp": "N/A",
    "roll": 0.0,
    "pitch": 0.0,
    "yaw": 0.0
}

# --- Fungsi Koneksi dan Pengambilan Data MAVLink ---

def connect_mavlink():
    """Mencoba membuat koneksi MAVLink."""
    global master, connection_status
    try:
        master = mavutil.mavlink_connection(serial_port, baud=baud_rate)
        master.wait_heartbeat()
        connection_status = "Connected"
        print("Heartbeat received! Connection established.")
        
        # Meminta stream data ATTITUDE (Extra 1)
        master.mav.request_data_stream_send(
            master.target_system, master.target_component,
            mavutil.mavlink.MAV_DATA_STREAM_EXTRA1,
            stream_rate_hz, 1
        )
        return True
    except Exception as e:
        connection_status = f"Error: {e}"
        print(f"Error connection: {e}")
        master = None
        return False

def get_attitude_loop():
    """Looping untuk mendapatkan dan menyimpan data attitude."""
    global master
    if not connect_mavlink():
        print("MAVLink connection failed. Data fetching thread is exiting.")
        return

    while True:
        try:
            # Menggunakan recv_match dengan timeout
            msg = master.recv_match(type='ATTITUDE', blocking=True, timeout=0.1)

            if msg:
                timestamp = datetime.now().isoformat()
                roll = math.degrees(msg.roll)
                pitch = math.degrees(msg.pitch)
                yaw = math.degrees(msg.yaw)

                new_record = {
                    "timestamp": timestamp,
                    "roll": round(roll, 4),
                    "pitch": round(pitch, 4),
                    "yaw": round(yaw, 4)
                }

                # Menambahkan data baru ke list (menumpuk)
                attitude_data["records"].append(new_record)
                global latest_attitude
                latest_attitude.update(new_record)
                
                # Opsional: Tampilkan di konsol
                print(f"[{timestamp}] R: {roll:6.2f}, P: {pitch:6.2f}, Y: {yaw:6.2f} - Stored {len(attitude_data['records'])} records.")
                time.sleep(1)
            
            # Jika tidak ada pesan, tidur sejenak agar tidak terlalu membebani CPU
            else:
                time.sleep(1)

        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"Error in MAVLink loop: {e}")
            time.sleep(1)
            # Opsional: Coba sambungkan kembali jika terjadi error
            # connect_mavlink()


# --- 2. dan 3. Server REST API Lokal dengan Flask (GET dan POST) ---

app = Flask(__name__)

# Endpoint untuk mendapatkan data attitude
@app.route('/get_attitude', methods=['GET'])
def get_attitude_data():
    """
    4. GET: Mengembalikan SEMUA data attitude yang tersimpan. 
    Ini menumpuk data, jadi yang lama tidak ter-overwrite.
    """
    
    response = {
        "status": "success",
        "connection": connection_status,
        "total_records": len(attitude_data['records']),
        "data": attitude_data['records'] # Mengirimkan seluruh list
    }
    return jsonify(response)

# Endpoint (contoh POST - tidak digunakan untuk mengambil data dari drone,
# hanya untuk memenuhi permintaan kerangka GET/POST)
@app.route('/post_attitude', methods=['POST'])
def post_attitude_data():
    """
    POST: Contoh endpoint. Data drone didapat secara otomatis oleh thread.
    """
    data = request.get_json(silent=True)
    if data:
        # Contoh: Log atau proses data yang dikirim ke server
        print(f"Received POST data: {data}")
        return jsonify({"status": "received", "data_posted": data}), 201
    else:
        return jsonify({"status": "error", "message": "Invalid JSON data received"}), 400

@app.route('/')
def home():
    return render_template('index.html', attitude_data=latest_attitude)
    """Halaman utama sederhana."""
    return f"""
    <h1>MAVLink to REST API Bridge</h1>
    <p>Connection Status: <b>{connection_status}</b></p>
    <p>Total Records Stored: <b>{len(attitude_data['records'])}</b></p>
    <p>Access the data at: <a href="/post_attitude">/post_attitude</a></p>
    """

# --- Main Execution ---

if __name__ == '__main__':
    # Memulai thread untuk pengambilan data MAVLink
    attitude_thread = threading.Thread(target=get_attitude_loop)
    attitude_thread.daemon = True # Memastikan thread akan berhenti saat main program berhenti
    attitude_thread.start()

    # Memulai server Flask (secara default di http://127.0.0.1:5000)
    # Gunakan '0.0.0.0' jika Anda ingin server dapat diakses dari jaringan lokal lainnya
    print("\nStarting Flask server...")
    app.run(host='0.0.0.0', port=5000)


# import threading
# import time
# import math
# import requests

# from flask import Flask, jsonify, request
# from pymavlink import mavutil, mavwp # Import mavwp untuk konstanta MAVLink

# # --- 1. Konfigurasi Sistem ---
# # Variabel global untuk menyimpan data terbaru dari Pixhawk
# current_telemetry = {
#     "roll": 0.0,
#     "pitch": 0.0,
#     "yaw": 0.0,
#     "last_update": time.time()
# }
# # Kunci untuk mengunci akses ke variabel global saat diperbarui (Penting untuk Threading!)
# #TELEMETRY_LOCK = threading.Lock()

# # --- 2. Fungsi Pembacaan Data Pixhawk (Dijalankan di Thread Terpisah) ---

# def pixhawk_listener_thread():
#     global current_telemetry

#     print("--- Memulai Koneksi Pixhawk ---")

#     # Inisialisasi Koneksi
#     try:
#         master = mavutil.mavlink_connection(
#             '/dev/serial0',  # Pastikan ini sesuai dengan port serial RPI Anda
#             baud=115200
#         )
#         print("Menunggu heartbeat...")
#         master.wait_heartbeat()
#         print(f"Terhubung ke Pixhawk! (ID: {master.target_system})")

#         # --- SOLUSI ANDAL: Meminta Data Stream ATTITUDE ---
#         # Meminta agar Pixhawk mengirim pesan ATTITUDE (ID MAV_DATA_STREAM_EXTRA1)
#         # dengan kecepatan 10Hz (10 kali per detik).
#         print("Mengatur pengiriman ATTITUDE ke 10Hz...")
#         master.mav.request_data_stream_send(
#             master.target_system, 
#             master.target_component, 
#             mavutil.mavlink.MAV_DATA_STREAM_EXTRA1, # Mengandung ATTITUDE
#             10,  # Rate per detik (10 Hz)
#             1    # Mulai streaming
#         )

#     except Exception as e:
#         print(f"ERROR: Gagal terhubung ke Pixhawk atau serial port: {e}")
#         return # Hentikan thread jika koneksi gagal

#     while True:
#         # Terima pesan ATTITUDE (blocking=False, agar tidak memblokir thread)
#         msg = master.recv_match(type='ATTITUDE', blocking=False, timeout=0.1)

#         if msg:
#             roll  = round(math.degrees(msg.roll), 2)
#             pitch = round(math.degrees(msg.pitch), 2)
#             yaw   = round(math.degrees(msg.yaw), 2)

#             # [DEBUG MAVLink] Anda akan melihat ini jika pesan berhasil dibaca
#             # print(f"[MAVLink DEBUG] Baca Berhasil! Roll: {roll} | Pitch: {pitch} | Yaw: {yaw}")

#             # Amankan akses ke variabel global menggunakan Lock
#             for key in current_telemetry:
#                 current_telemetry['roll'] = roll
#                 current_telemetry['pitch'] = pitch
#                 current_telemetry['yaw'] = yaw
#                 current_telemetry['last_update'] = time.time()
    
#         time.sleep(0.01) # Jeda singkat
#         return roll

# # --- 3. Server Flask (Dijalankan di Thread Utama) ---

# app = Flask(__name__)

# # Endpoint 1: GET (Mengambil data telemetry terbaru)
# @app.route('/telemetry', methods=['GET'])
# def get_telemetry():
#     roll = pixhawk_listener_thread()
#     # """Memberikan data telemetry terbaru yang dibaca oleh thread Pixhawk."""

#     # # Amankan akses ke variabel global
#     # with TELEMETRY_LOCK:
#     #     data = current_telemetry.copy()

#     # # # Hitung usia data
#     # data_age = time.time() - data['last_update']

#     # [DEBUG Flask] Verifikasi data yang akan dikirim API
#     # print(f"[Flask DEBUG] Mengirim: Roll={data['roll']}, Age={data_age:.2f}s")

#     return jsonify({
#         "status": "OK",
#         "data_source": "Pixhawk MAVLink",
#         "roll": roll
#         # "attitude": {
#         #     "roll": ['roll'],
#         #     # "pitch": data['pitch'],
#         # #     # "yaw": data['yaw']
#         # }
#     }), 200

# # Endpoint 2: POST (Contoh: Menerima Perintah dari Klien lain)
# @app.route('/command', methods=['POST'])
# def receive_command():
#     """Contoh endpoint untuk menerima perintah dari klien eksternal."""

#     if not request.is_json:
#         return jsonify({"message": "Permintaan harus dalam format JSON"}), 400

#     command_data = request.get_json()
#     command = command_data.get('action')
#     value = command_data.get('value')

#     # Log perintah yang diterima
#     print(f"\n--- Perintah Diterima dari API ---")
#     print(f"Action: {command}, Value: {value}")

#     # Placeholder untuk mengirim perintah kembali ke Pixhawk di masa mendatang

#     return jsonify({
#         "status": "success",
#         "message": f"Perintah '{command}' diterima dan sedang diproses."
#     }), 200

# # --- 4. Main Execution ---

# if __name__ == '__main__':

#     # Memulai thread pembacaan data Pixhawk
#     pixhawk_thread = threading.Thread(target=pixhawk_listener_thread)
#     pixhawk_thread.daemon = True 
#     pixhawk_thread.start()

#     print("\n==============================================")
#     print("🚀 Server Telemetri Gabungan Sedang Berjalan 🚀")
#     print("  - Akses data via GET: http://127.0.0.1:5000/telemetry")
#     print("  - Kirim perintah via POST: http://127.0.0.1:5000/command")
#     print("==============================================")

#     # Menjalankan server Flask di thread utama (akses dari mana saja di jaringan lokal RPI)
#     app.run(host='0.0.0.0', port=5000, debug=False)
