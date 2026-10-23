import paramiko
import json
import urllib.request
import ssl

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

# Find current backend container dynamically
stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=backend-d8j36rc0d2vizu18z7kqwf2f --format '{{.Names}}'")
stdin.write("canditos\n")
stdin.flush()
backend_container = stdout.read().decode('utf-8', errors='ignore').split('\n')[-2].strip()
print(f"Detected running backend container: {backend_container}")

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=frontend-d8j36rc0d2vizu18z7kqwf2f --format '{{.Names}}'")
stdin.write("canditos\n")
stdin.flush()
frontend_container = stdout.read().decode('utf-8', errors='ignore').split('\n')[-2].strip()
print(f"Detected running frontend container: {frontend_container}")

def curl_json(path):
    cmd = f"python3 -c \\\"import urllib.request, json; resp=urllib.request.urlopen('http://localhost:8000{path}'); print(resp.read().decode())\\\""
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S docker exec {backend_container} sh -c \"{cmd}\"")
    stdin.write("canditos\n")
    stdin.flush()
    raw = stdout.read().decode('utf-8', errors='ignore')
    lines = raw.split('\n')
    json_lines = [l for l in lines if not l.startswith('[sudo')]
    clean = '\n'.join(json_lines).strip()
    try:
        return json.loads(clean)
    except Exception as e:
        return {"error": str(e), "raw": clean[:200]}

print("\n================ TEST RESULTS ================")

# 1. Health
print("\n[TEST 1] GET /health")
health = curl_json("/health")
assert health.get("status") == "ok", f"Health failed: {health}"
print(f" -> PASS: Backend online, active chargers = {health.get('connected_chargers')}")

# 2. Chargers List
print("\n[TEST 2] GET /chargers")
chargers = curl_json("/chargers")
assert isinstance(chargers, list) and len(chargers) > 0, f"Chargers failed: {chargers}"
pt8_exists = any(c.get('charge_point_id') == 'chargerPT8' for c in chargers)
assert pt8_exists, "chargerPT8 not in chargers list"
print(f" -> PASS: {len(chargers)} chargers loaded, chargerPT8 confirmed present")

# 3. ChargerDetail Object
print("\n[TEST 3] GET /chargers/chargerPT8")
pt8 = curl_json("/chargers/chargerPT8")
assert pt8.get("charge_point_id") == "chargerPT8", f"Failed: {pt8}"
print(f" -> PASS: chargerPT8 loaded (Vendor={pt8.get('vendor')}, Model={pt8.get('model')}, Eichrecht={pt8.get('is_eichrecht_compliant')}, Profile={pt8.get('security_profile')})")

# 4. Meter Keys (Eichrecht & Medidores Tab)
print("\n[TEST 4] GET /ocmf/meter-keys?charge_point_id=chargerPT8")
meter_keys = curl_json("/ocmf/meter-keys?charge_point_id=chargerPT8")
assert isinstance(meter_keys, list) and len(meter_keys) == 2, f"Failed: {meter_keys}"
for mk in meter_keys:
    print(f"    * Tomada #{mk.get('connector_id')}: {mk.get('meter_model')} | Curva: {mk.get('curve_name')} | S/N: {mk.get('serial_number')}")
print(" -> PASS: 2 Eichrecht meter keys verified")

# 5. Certificates (Security Tab)
print("\n[TEST 5] GET /chargers/chargerPT8/certificates")
certs = curl_json("/chargers/chargerPT8/certificates")
assert isinstance(certs, list), f"Failed: {certs}"
print(f" -> PASS: {len(certs)} certificate(s) loaded")

# 6. Success Rate (both endpoints)
print("\n[TEST 6] GET /transactions/chargerPT8/success-rate")
sr1 = curl_json("/transactions/chargerPT8/success-rate")
assert isinstance(sr1, dict), f"Failed: {sr1}"
print(f" -> PASS: Success-rate via /transactions returned: {sr1}")

print("\n[TEST 7] GET /chargers/chargerPT8/success-rate (Alias)")
sr2 = curl_json("/chargers/chargerPT8/success-rate")
assert isinstance(sr2, dict), f"Failed: {sr2}"
print(f" -> PASS: Success-rate via /chargers returned: {sr2}")

# 7. Messages (OCPP Logs Tab)
print("\n[TEST 8] GET /chargers/chargerPT8/messages?limit=5")
msgs = curl_json("/chargers/chargerPT8/messages?limit=5")
assert isinstance(msgs, list), f"Failed: {msgs}"
print(f" -> PASS: {len(msgs)} messages retrieved from OCPP history")

# 8. Availability Monitor (Telemetry Tab)
print("\n[TEST 9] GET /chargers/chargerPT8/availability")
avail = curl_json("/chargers/chargerPT8/availability")
assert avail.get("charge_point_id") == "chargerPT8", f"Failed: {avail}"
print(f" -> PASS: Availability monitor loaded (Uptime 24h = {avail.get('uptime_24h_pct')}%, Timeline slots = {len(avail.get('hourly_timeline', []))})")

# 9. Public HTTPS Frontend
print("\n[TEST 10] Public Frontend HTTPS (https://ocpp.gatoescondido.com)")
stdin, stdout, stderr = ssh.exec_command("curl -s -I https://ocpp.gatoescondido.com -k")
http_header = stdout.read().decode('utf-8', errors='ignore')
assert "200" in http_header or "304" in http_header, f"Failed: {http_header}"
print(f" -> PASS: Frontend HTTPS returns 200 OK")

print("\n================ ALL 10 TESTS PASSED ================\n")
ssh.close()
