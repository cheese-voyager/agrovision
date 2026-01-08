from pymavlink import mavutil
import math
import time

#Koneksi ke Pixhawk
master = mavutil.mavlink_connection(
	'/dev/serial0', # atau /dev/ttyAMAO
	baud=57600
)

print("Menunggu heartbeat...")
master.wait_heartbeat()
print("Terhubung ke Pixhawk!")
while True:
	msg = master.recv_match(type='ATTITUDE', blocking=True)
	if msg:
		roll = math.degrees(msg.roll)
		pitch = math.degrees(msg.pitch)
		yaw = math.degrees(msg.yaw)
		print(f"Roll: {roll:.2f}° | Pitch: {pitch:.2f}° | Yaw: {yaw:.2f}")

time.sleep(1)
