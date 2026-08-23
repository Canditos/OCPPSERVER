import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(40):
    time.sleep(5)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format '{{.Names}} | {{.Status}} | {{.Image}}'")
    out = stdout.read().decode('utf-8').strip()
    if "870c2e5" in out and "Up" in out:
        print("=== DEPLOY SUCCESS: Commit 870c2e5 is UP and RUNNING! ===")
        print(out)
        break
    else:
        # Check if deploy job is still running or failed
        stdin2, stdout2, stderr2 = ssh.exec_command(
            "echo canditos | sudo -S docker exec coolify-db psql -U coolify -d coolify -t -c "
            "\"SELECT deployment_uuid, status FROM application_deployment_queues ORDER BY id DESC LIMIT 1;\""
        )
        db_out = stdout2.read().decode('utf-8', errors='replace').strip()
        print(f"Waiting {i+1}... Latest deploy: {db_out}")
        if 'failed' in db_out:
            print("DEPLOY FAILED! Checking build logs...")
            break

ssh.close()
