import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

channel = ssh.invoke_shell()
channel.send("sudo docker ps\n")
import time
time.sleep(1)
channel.send("canditos\n")
time.sleep(2)
output = channel.recv(10000).decode('utf-8')
print(output)
ssh.close()
