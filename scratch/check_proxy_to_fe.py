import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = "echo canditos | sudo -S docker exec coolify-proxy wget -qO- http://frontend-d8j36rc0d2vizu18z7kqwf2f-224630886193:80/health"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== PROXY TO FRONTEND ===")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

cmd2 = "echo canditos | sudo -S docker inspect frontend-d8j36rc0d2vizu18z7kqwf2f-224630886193 --format '{{range $net, $conf := .NetworkSettings.Networks}}{{$net}}: {{$conf.IPAddress}} {{end}}'"
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
print("=== FRONTEND IPS ===")
print(stdout2.read().decode('utf-8'))

ssh.close()
