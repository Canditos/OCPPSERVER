import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(12):
    time.sleep(5)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep -E 'd8j36rc0d2vizu18z7kqwf2f|pvr0icyjdioss2ayjy6w94ea'")
    out = stdout.read().decode('utf-8').strip()
    print(f"=== Check {i+1} ===")
    print(out)
    if "frontend-d8j36rc0d2vizu18z7kqwf2f" in out and "backend-d8j36rc0d2vizu18z7kqwf2f" in out:
        if "Up Less than a minute" in out or "Up 1" in out:
            print("Both containers updated and running!")
            break

ssh.close()
