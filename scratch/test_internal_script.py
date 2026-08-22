import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

script = """
import urllib.request, json
payload = {
    "charge_point_id": "JAAN462076",
    "connector_id": 1,
    "name": "AC Teste Bi-Horaria 32A",
    "stack_level": 0,
    "purpose": "TxDefaultProfile",
    "kind": "Recurring",
    "recurrency_kind": "Daily",
    "charging_rate_unit": "A",
    "duration": 86400,
    "periods": [
        {"start_period": 0, "limit": 32.0, "number_phases": 3, "label": "00:00 - 07:00 (32A)"},
        {"start_period": 25200, "limit": 10.0, "number_phases": 3, "label": "07:00 - 24:00 (10A)"}
    ]
}
req = urllib.request.Request('http://localhost:8000/smart-charging/profiles', data=json.dumps(payload).encode(), headers={'Content-Type': 'application/json'})
res = urllib.request.urlopen(req).read().decode()
print("CREATE:", res)
profile_id = json.loads(res)["id"]
req2 = urllib.request.Request('http://localhost:8000/smart-charging/apply', data=json.dumps({"profile_id": profile_id, "charge_point_id": "JAAN462076"}).encode(), headers={'Content-Type': 'application/json'})
res2 = urllib.request.urlopen(req2).read().decode()
print("APPLY:", res2)
"""

cmd = f"echo canditos | sudo -S docker exec -i backend-d8j36rc0d2vizu18z7kqwf2f-224630882163 python -c \"{script}\""
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== INTERNAL TEST RESULT ===")
print(stdout.read().decode('utf-8'))
print("=== STDERR ===")
print(stderr.read().decode('utf-8'))

ssh.close()
