import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(12):
    stdin, stdout, stderr = ssh.exec_command("curl -s -k https://ocpp.gatoescondido.com/health")
    out = stdout.read().decode('utf-8').strip()
    print(f"Check {i+1}: {out}")
    if '"connected_chargers":1' in out or '"connected_chargers": 1' in out or '"connected_chargers":2' in out:
        print("Charger is connected! Running test_apply...")
        stdin2, stdout2, stderr2 = ssh.exec_command("echo canditos | sudo -S docker exec backend-d8j36rc0d2vizu18z7kqwf2f-224630882163 python /tmp/test_apply.py")
        print(stdout2.read().decode('utf-8'))
        break
    time.sleep(5)

ssh.close()
