import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

# Find running backend container
stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=backend-d8j36rc0d2vizu18z7kqwf2f --format '{{.Names}}'")
stdin.write("canditos\n")
stdin.flush()
backend_container = stdout.read().decode('utf-8', errors='ignore').split('\n')[-2].strip()
print(f"Backend container: {backend_container}")

cmd = f"""sudo -S docker exec -i {backend_container} python3 -c '
import sqlite3
conn = sqlite3.connect("/app/data/ocpp16.db")
c = conn.cursor()
print("BEFORE:", c.execute("SELECT id, id_tag, description FROM authorized_tags").fetchall())
c.execute("DELETE FROM authorized_tags WHERE id_tag LIKE \\"%VERSICHARGE%\\" OR description LIKE \\"%VersiCharge%\\"")
c.execute("DELETE FROM auth_tokens WHERE id_tag LIKE \\"%VERSICHARGE%\\"")
conn.commit()
print("AFTER:", c.execute("SELECT id, id_tag, description FROM authorized_tags").fetchall())
conn.close()
'"""

stdin, stdout, stderr = ssh.exec_command(cmd)
stdin.write("canditos\n")
stdin.flush()
print("STDOUT:", stdout.read().decode('utf-8', errors='ignore'))
print("STDERR:", stderr.read().decode('utf-8', errors='ignore'))
ssh.close()
