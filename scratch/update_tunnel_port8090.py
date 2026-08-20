import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

config_content = """tunnel: 546bdd38-02e5-4223-80f7-d66177f7d12f
credentials-file: /etc/cloudflared/546bdd38-02e5-4223-80f7-d66177f7d12f.json

ingress:
  - hostname: vet.gatoescondido.com
    service: http://localhost:80
  - hostname: coolify.gatoescondido.com
    service: http://localhost:8000
  - hostname: ocpp.gatoescondido.com
    service: http://localhost:8090
  - service: http_status:404
"""

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore') + stderr.read().decode('utf-8', errors='ignore')

# Write file via sftp
sftp = ssh.open_sftp()
with sftp.open('/tmp/config.yml', 'w') as f:
    f.write(config_content)
sftp.close()

print(run_cmd("cp /tmp/config.yml /etc/cloudflared/config.yml"))
print(run_cmd("systemctl restart cloudflared"))
print("CLOUDFLARED CONFIG UPDATED TO PORT 8090!")

ssh.close()
