from pymavlink import mavutil

# USB connection
master = mavutil.mavlink_connection('/dev/ttyACM0', baud=115200)

# Wait for heartbeat
master.wait_heartbeat()
print("Connected to Pixhawk")
master.arducopter_arm()
master.motors_armed_wait()
print("Motors armed")
master.arducopter_disarm()
master.set_mode_manual()
master.mav.command_long_send(
    master.target_system,
    master.target_component,
    mavutil.mavlink.MAV_CMD_DO_MOTOR_TEST,
    0,
    1,      # motor number (1–4)
    0.25,    # throttle (0.0–1.0)
    15,      # duration (seconds)
    0, 0, 0
)

