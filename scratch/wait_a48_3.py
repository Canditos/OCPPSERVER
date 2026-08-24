import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(25):
    time.sleep(4)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'")
    out = stdout.read().decode('utf-8').strip()
    if "a48e583" in out and "Up" in out:
        print("=== DEPLOY SUCCESS: Commit a48e583 is UP and RUNNING! ===")
        print(out)
        break
    else:
        # Check if helper is running
        stdin2, stdout2, stderr2 = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=coolify-helper --format '{{.Names}} - {{.Status}}'")
        helper = stdout2.read().decode('utf-8').strip()
        print(f"Waiting {i+1}... (Helper: {helper or 'none'})")

ssh.close()
