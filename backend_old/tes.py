import time
import math
from pymavlink import mavutil

# 1. CONFIGURATION
serial_port = '/dev/ttyACM0' 
baud_rate = 57600 
stream_rate_hz = 10 

# 2. CONNECT TO PIXHAWK
try:
    master = mavutil.mavlink_connection(serial_port, baud=baud_rate)
    master.wait_heartbeat() 
    print("Heartbeat received! Connection established.")
except Exception as e:
    print(f"Error connecting: {e}")
    exit(1)

# 3. REQUEST ATTITUDE STREAM
master.mav.request_data_stream_send(
    master.target_system, master.target_component, 
    mavutil.mavlink.MAV_DATA_STREAM_EXTRA1, # Stream for ATTITUDE
    stream_rate_hz, 1 
)

def get_attitude_data():
    msg = master.recv_match(type='ATTITUDE', blocking=True, timeout=0.1) # Added timeout
    
    if msg:
        roll_deg = math.degrees(msg.roll)
        pitch_deg = math.degrees(msg.pitch)
        yaw_deg = math.degrees(msg.yaw)
        return roll_deg, pitch_deg, yaw_deg
    return None, None, None

# 4. MAIN DATA LOOP
print("\n--- Starting Data Retrieval Loop ---")
while True:
    try:
        roll, pitch, yaw = get_attitude_data()
        
        if roll is not None:
            print(f"R: {roll:6.2f}° | P: {pitch:6.2f}° | Y: {yaw:6.2f}°")
            
        time.sleep(0.01) # Crucial for Pi Zero W stability
        
    except KeyboardInterrupt:
        print("\nExiting script.")
        break