import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

print("=== FRONTEND PORTS AND IP ===")
print(run_cmd("docker inspect frontend-d8j36rc0d2vizu18z7kqwf2f-233500583940 --format '{{json .NetworkSettings.Ports}}'"))
print(run_cmd("docker inspect frontend-d8j36rc0d2vizu18z7kqwf2f-233500583940 --format '{{json .NetworkSettings.Networks}}'"))

ssh.close()
