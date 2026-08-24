import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

payload = {
    "charge_point_id": "JAAN462076",
    "connector_id": 1,
    "name": "AC Teste Bi-Horaria",
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

cmd = f"curl -s -k -X POST https://ocpp.gatoescondido.com/api/smart-charging/profiles -H 'Content-Type: application/json' -d '{json.dumps(payload)}'"
stdin, stdout, stderr = ssh.exec_command(cmd)
res_create = stdout.read().decode('utf-8')
print("=== CREATE PROFILE RESULT ===")
print(res_create)

cmd2 = "curl -s -k https://ocpp.gatoescondido.com/api/smart-charging/profiles?cp_id=JAAN462076"
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
res_list = stdout2.read().decode('utf-8')
print("=== LIST PROFILES RESULT ===")
print(res_list[:300])

ssh.close()
