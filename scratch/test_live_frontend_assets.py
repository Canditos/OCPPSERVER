import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=frontend-d8j36rc0d2vizu18z7kqwf2f --format '{{.Names}}'")
stdin.write("canditos\n")
stdin.flush()
frontend_container = stdout.read().decode('utf-8', errors='ignore').split('\n')[-2].strip()
print(f"Checking frontend container: {frontend_container}")

# Check index.html and assets inside container
cmd = f"echo canditos | sudo -S docker exec {frontend_container} grep -rn 'Baias de Carregamento' /usr/share/nginx/html/assets/"
stdin, stdout, stderr = ssh.exec_command(cmd)
stdin.write("canditos\n")
stdin.flush()
res = stdout.read().decode('utf-8', errors='ignore')
assert "Baias de Carregamento" in res, "New EvseBay code not found in frontend bundle!"
print("-> PASS: 'Baias de Carregamento' verified inside deployed frontend bundle!")

cmd = f"echo canditos | sudo -S docker exec {frontend_container} grep -rn 'Ver Offline' /usr/share/nginx/html/assets/"
stdin, stdout, stderr = ssh.exec_command(cmd)
stdin.write("canditos\n")
stdin.flush()
res2 = stdout.read().decode('utf-8', errors='ignore')
assert "Ver Offline" in res2, "Offline filtering toggle not found in frontend bundle!"
print("-> PASS: 'Ver Offline' button verified inside deployed frontend bundle!")

cmd = f"echo canditos | sudo -S docker exec {frontend_container} grep -rn 'ocpp-theme-mode' /usr/share/nginx/html/assets/"
stdin, stdout, stderr = ssh.exec_command(cmd)
stdin.write("canditos\n")
stdin.flush()
res3 = stdout.read().decode('utf-8', errors='ignore')
assert "ocpp-theme-mode" in res3, "Theme management key not found in frontend bundle!"
print("-> PASS: Dark & Light theme hook verified inside deployed frontend bundle!")

cmd = f"echo canditos | sudo -S docker exec {frontend_container} grep -rni 'versicharge' /usr/share/nginx/html/assets/"
stdin, stdout, stderr = ssh.exec_command(cmd)
stdin.write("canditos\n")
stdin.flush()
res4 = stdout.read().decode('utf-8', errors='ignore')
cleaned_res4 = '\n'.join([l for l in res4.split('\n') if not l.startswith('[sudo') and l.strip()])
assert cleaned_res4 == "", f"VersiCharge found in bundle: {cleaned_res4}"
print("-> PASS: 0 occurrences of 'versicharge' in deployed frontend bundle!")

# Check English translations in deployed assets
cmd = f"echo canditos | sudo -S docker exec {frontend_container} grep -rn 'Fiscal & Metrological Audit' /usr/share/nginx/html/assets/"
stdin, stdout, stderr = ssh.exec_command(cmd)
stdin.write("canditos\n")
stdin.flush()
res5 = stdout.read().decode('utf-8', errors='ignore')
assert "Fiscal & Metrological Audit" in res5, "English OCMF audit strings not found in bundle!"
print("-> PASS: English OCMF Audit translations present in bundle!")

cmd = f"echo canditos | sudo -S docker exec {frontend_container} grep -rn 'A temporary UI error occurred' /usr/share/nginx/html/assets/"
stdin, stdout, stderr = ssh.exec_command(cmd)
stdin.write("canditos\n")
stdin.flush()
res6 = stdout.read().decode('utf-8', errors='ignore')
assert "A temporary UI error occurred" in res6, "English ErrorBoundary strings not found in bundle!"
print("-> PASS: English ErrorBoundary translations present in bundle!")

ssh.close()
print("\nALL LIVE ASSET & LOCALIZATION CHECKS PASSED!")
