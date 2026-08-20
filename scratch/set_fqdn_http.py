import urllib.request
import json

url = "https://coolify.gatoescondido.com/api/v1/applications/d8j36rc0d2vizu18z7kqwf2f"
token = "2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366"
headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "curl/8.0"}

payload = {"fqdn": "http://ocpp.gatoescondido.com"}
data = json.dumps(payload).encode('utf-8')

req = urllib.request.Request(url, data=data, headers=headers, method="POST")
try:
    res = urllib.request.urlopen(req)
    print("POST FQDN OK:", res.read().decode())
except Exception as e:
    print("POST FQDN ERROR:", e)
