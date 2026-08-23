import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=backend --format '{{.ID}}'")
cid = stdout.read().decode('utf-8').strip().split('\n')[0]

pycode = """
import asyncio
from datetime import datetime
from ocpp_server.central_system import get_charge_point
from ocpp.v16 import call

async def run():
    cp = get_charge_point("chargerPT21")
    if not cp:
        print("chargerPT21 not found")
        return
    
    today_midnight = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    payload = {
        "chargingProfileId": 2001,
        "stackLevel": 0,
        "chargingProfilePurpose": "ChargePointMaxProfile",
        "chargingProfileKind": "Recurring",
        "recurrencyKind": "Daily",
        "chargingSchedule": {
            "chargingRateUnit": "W",
            "duration": 86400,
            "startSchedule": today_midnight,
            "chargingSchedulePeriod": [
                {"startPeriod": 0, "limit": 20000.0, "numberPhases": 3},
                {"startPeriod": 25200, "limit": 25000.0, "numberPhases": 3}
            ]
        }
    }
    
    print("SENDING SetChargingProfile with startSchedule:", today_midnight)
    try:
        resp = await cp.set_charging_profile(connector_id=0, cs_charging_profiles=payload)
        print("SET CHARGING PROFILE RESPONSE:", resp)
    except Exception as e:
        print("SET CHARGING PROFILE ERROR:", e)
        
    print("QUERYING GetCompositeSchedule...")
    try:
        resp2 = await cp.get_composite_schedule(connector_id=1, duration=86400, charging_rate_unit="W")
        print("GET COMPOSITE SCHEDULE RESPONSE:", resp2)
    except Exception as e:
        print("GET COMPOSITE SCHEDULE ERROR:", e)

asyncio.run(run())
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/test_set_profile.py', 'w') as f:
    f.write(pycode)
sftp.close()

stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S docker cp /tmp/test_set_profile.py {cid}:/app/test_set_profile.py && echo canditos | sudo -S docker exec {cid} python /app/test_set_profile.py")
print("OUT:\n", stdout.read().decode('utf-8'))
print("ERR:\n", stderr.read().decode('utf-8'))
ssh.close()
