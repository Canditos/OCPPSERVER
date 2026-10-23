import time
import requests
import paramiko

COOLIFY_API_URL = "https://coolify.gatoescondido.com/api/v1"
API_TOKEN = "3-49d7990d-2225-4fd7-9c0e-977d41c7990d"
RESOURCE_UUID = "d8j36rc0d2vizu18z7kqwf2f"

headers = {
    "Authorization": f"Bearer 14|eG0r5q3k9k5uOqX7nJ5tL3hM8vP2wY6z4x1c0b9a",
    "Content-Type": "application/json",
    "Accept": "application/json",
}

# SSH directly to server
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

print('Triggering redeploy on Coolify resource...')
stdin, stdout, stderr = ssh.exec_command("""
echo canditos | sudo -S docker ps --format "{{.Names}}"
""")
print(stdout.read().decode('utf-8', errors='ignore'))

ssh.close()
