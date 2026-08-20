import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_sudo(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8') + stderr.read().decode('utf-8')

print("=== FRONTEND LOGS ===")
print(run_sudo("docker logs frontend-d8j36rc0d2vizu18z7kqwf2f-232342840072 --tail 30"))

print("=== BACKEND LOGS ===")
print(run_sudo("docker logs backend-d8j36rc0d2vizu18z7kqwf2f-232342836128 --tail 30"))

ssh.close()
