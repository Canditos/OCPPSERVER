import paramiko
import urllib.request
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

# 1. Update Coolify DB fqdn = 'http://ocpp.gatoescondido.com'
print("=== UPDATING COOLIFY DB FQDN TO HTTP ===")
print(run_cmd("docker exec coolify-db psql -U coolify -d coolify -c \"UPDATE applications SET fqdn = 'http://ocpp.gatoescondido.com', custom_labels = NULL WHERE uuid='d8j36rc0d2vizu18z7kqwf2f';\""))

# 2. Update cloudflared config.yml
config_content = """tunnel: 546bdd38-02e5-4223-80f7-d66177f7d12f
credentials-file: /etc/cloudflared/546bdd38-02e5-4223-80f7-d66177f7d12f.json

ingress:
  - hostname: vet.gatoescondido.com
    service: http://localhost:80
  - hostname: coolify.gatoescondido.com
    service: http://localhost:8000
  - hostname: ocpp.gatoescondido.com
    service: http://localhost:80
  - service: http_status:404
"""

sftp = ssh.open_sftp()
with sftp.open('/tmp/config.yml', 'w') as f:
    f.write(config_content)
sftp.close()

print(run_cmd("cp /tmp/config.yml /etc/cloudflared/config.yml"))
print(run_cmd("systemctl restart cloudflared"))
print("CLOUDFLARED UPDATED TO HTTP PORT 80!")

# 3. Trigger deploy via SSH localhost
cmd = (
    "curl -i -X POST 'http://localhost:8000/api/v1/deploy?uuid=d8j36rc0d2vizu18z7kqwf2f&force=true' "
    "-H 'Authorization: Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366' "
    "-H 'Content-Type: application/json'"
)

print(run_cmd(cmd))

ssh.close()
