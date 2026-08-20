import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

print("=== CLEARING CUSTOM LABELS IN COOLIFY DB ===")
print(run_cmd("docker exec coolify-db psql -U coolify -d coolify -c \"UPDATE applications SET custom_labels = NULL, fqdn = 'https://ocpp.gatoescondido.com' WHERE uuid='d8j36rc0d2vizu18z7kqwf2f';\""))

print("=== TRIGGERING DEPLOYMENT ===")
cmd = (
    "curl -i -X POST 'http://localhost:8000/api/v1/deploy?uuid=d8j36rc0d2vizu18z7kqwf2f&force=true' "
    "-H 'Authorization: Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366' "
    "-H 'Content-Type: application/json'"
)
print(run_cmd(cmd))

ssh.close()
