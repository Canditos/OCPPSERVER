import urllib.request
import json

url = "https://coolify.gatoescondido.com/api/v1/applications/d8j36rc0d2vizu18z7kqwf2f"
token = "2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366"
headers = {"Authorization": f"Bearer {token}", "User-Agent": "curl/8.0"}

req = urllib.request.Request(url, headers=headers)
res = urllib.request.urlopen(req)
app = json.loads(res.read().decode())
print("Keys:", list(app.keys()))
print("custom_labels:", app.get("custom_labels"))
