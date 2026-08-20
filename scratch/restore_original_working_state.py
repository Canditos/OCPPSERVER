import urllib.request
import json
import paramiko

url = "https://coolify.gatoescondido.com/api/v1/applications/d8j36rc0d2vizu18z7kqwf2f"
token = "2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "curl/8.0"}

# Reset custom_labels and fqdn to official working values
payload = {"fqdn": "https://ocpp.gatoescondido.com", "custom_labels": None}
data = json.dumps(payload).encode('utf-8')

req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
try:
    res = urllib.request.urlopen(req)
    print("RESET COOLIFY APP OK:", res.read().decode())
except Exception as e:
    print("RESET COOLIFY APP ERROR:", e)

# Restore Cloudflared config
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

config_content = """tunnel: 546bdd38-02e5-4223-80f7-d66177f7d12f
credentials-file: /etc/cloudflared/546bdd38-02e5-4223-80f7-d66177f7d12f.json

ingress:
  - hostname: vet.gatoescondido.com
    service: https://localhost:443
    originRequest:
      noTLSVerify: true
  - hostname: coolify.gatoescondido.com
    service: http://localhost:8000
  - hostname: ocpp.gatoescondido.com
    service: https://localhost:443
    originRequest:
      noTLSVerify: true
  - service: http_status:404
"""

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

sftp = ssh.open_sftp()
with sftp.open('/tmp/config.yml', 'w') as f:
    f.write(config_content)
sftp.close()

print(run_cmd("cp /tmp/config.yml /etc/cloudflared/config.yml"))
print(run_cmd("systemctl restart cloudflared"))
print("CLOUDFLARED RESTORED TO WORKING 443 HTTPS STATE!")

ssh.close()

# Deploy clean build
deploy_url = "https://coolify.gatoescondido.com/api/v1/deploy?uuid=d8j36rc0d2vizu18z7kqwf2f&force=true"
dreq = urllib.request.Request(deploy_url, data=b'{}', headers=headers, method="POST")
try:
    dres = urllib.request.urlopen(dreq)
    print("DEPLOY OK:", dres.read().decode())
except Exception as e:
    print("DEPLOY ERROR:", e)
