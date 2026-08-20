import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

print("=== VET APP LABELS ===")
print(run_cmd("docker inspect w7yrf64alyicg65z61lsjykm-201221983785 --format '{{json .Config.Labels}}'"))

ssh.close()
