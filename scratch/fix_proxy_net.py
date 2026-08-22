import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

# 1. Connect coolify-proxy to d8j36rc0d2vizu18z7kqwf2f_default just in case
cmd = "echo canditos | sudo -S docker network connect d8j36rc0d2vizu18z7kqwf2f_default coolify-proxy 2>&1"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== CONNECT PROXY TO DEFAULT NET ===")
print(stdout.read().decode('utf-8'))

# 2. Test curl immediately
stdin2, stdout2, stderr2 = ssh.exec_command("curl -s -k -H 'Host: ocpp.gatoescondido.com' https://127.0.0.1:443/health")
print("=== CURL TEST AFTER CONNECT ===")
print(stdout2.read().decode('utf-8'))

ssh.close()
