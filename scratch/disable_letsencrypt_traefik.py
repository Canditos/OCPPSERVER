import paramiko
import base64
import urllib.request
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

custom_labels_plain = (
    "traefik.enable=true\n"
    "traefik.http.middlewares.gzip.compress=true\n"
    "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https\n"
    "traefik.http.routers.http-0-d8j36rc0d2vizu18z7kqwf2f-frontend.entryPoints=http\n"
    "traefik.http.routers.http-0-d8j36rc0d2vizu18z7kqwf2f-frontend.middlewares=redirect-to-https\n"
    "traefik.http.routers.http-0-d8j36rc0d2vizu18z7kqwf2f-frontend.rule=Host(`ocpp.gatoescondido.com`) && PathPrefix(`/`)\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.entryPoints=https\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.middlewares=gzip\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.rule=Host(`ocpp.gatoescondido.com`) && PathPrefix(`/`)\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.tls=true"
)

b64_labels = base64.b64encode(custom_labels_plain.encode('utf-8')).decode('utf-8')

print("=== UPDATING COOLIFY DB WITH NO-LETSENCRYPT LABELS ===")
sql = f"UPDATE applications SET custom_labels = '{b64_labels}', fqdn = 'https://ocpp.gatoescondido.com' WHERE uuid='d8j36rc0d2vizu18z7kqwf2f';"
print(run_cmd(f"docker exec coolify-db psql -U coolify -d coolify -c \"{sql}\""))

print("=== TRIGGERING DEPLOYMENT ===")
cmd = (
    "curl -i -X POST 'http://localhost:8000/api/v1/deploy?uuid=d8j36rc0d2vizu18z7kqwf2f&force=true' "
    "-H 'Authorization: Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366' "
    "-H 'Content-Type: application/json'"
)
print(run_cmd(cmd))

ssh.close()
