import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(12):
    time.sleep(5)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'd8j36rc0d2vizu18z7kqwf2f|arupbsvesse3pvbfnkdes39z'")
    out = stdout.read().decode('utf-8').strip()
    print(f"=== Check {i+1} ===")
    print(out)
    if "backend-d8j36rc0d2vizu18z7kqwf2f" in out and "frontend-d8j36rc0d2vizu18z7kqwf2f" in out:
        if "Up" in out:
            print("Both frontend and backend are UP and running!")
            break

ssh.close()
