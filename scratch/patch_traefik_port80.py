import urllib.request
import json

url = "https://coolify.gatoescondido.com/api/v1/applications/d8j36rc0d2vizu18z7kqwf2f"
token = "2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366"

custom_labels = (
    "traefik.enable=true\n"
    "traefik.http.routers.http-0-d8j36rc0d2vizu18z7kqwf2f-frontend.entryPoints=http\n"
    "traefik.http.routers.http-0-d8j36rc0d2vizu18z7kqwf2f-frontend.rule=Host(`ocpp.gatoescondido.com`) && PathPrefix(`/`)\n"
    "traefik.http.routers.http-0-d8j36rc0d2vizu18z7kqwf2f-frontend.service=http-0-d8j36rc0d2vizu18z7kqwf2f-frontend\n"
    "traefik.http.services.http-0-d8j36rc0d2vizu18z7kqwf2f-frontend.loadbalancer.server.port=80\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.entryPoints=https\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.rule=Host(`ocpp.gatoescondido.com`) && PathPrefix(`/`)\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.service=https-0-d8j36rc0d2vizu18z7kqwf2f-frontend\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.tls=true\n"
    "traefik.http.routers.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.tls.certresolver=letsencrypt\n"
    "traefik.http.services.https-0-d8j36rc0d2vizu18z7kqwf2f-frontend.loadbalancer.server.port=80"
)

payload = {"custom_labels": custom_labels}
data = json.dumps(payload).encode('utf-8')

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "User-Agent": "curl/8.0"
}

req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")

try:
    res = urllib.request.urlopen(req)
    print("PATCH OK:", res.read().decode())
except Exception as e:
    print("PATCH ERROR:", e)

# Trigger deployment
deploy_url = "https://coolify.gatoescondido.com/api/v1/deploy?uuid=d8j36rc0d2vizu18z7kqwf2f&force=true"
dreq = urllib.request.Request(deploy_url, data=b'{}', headers=headers, method="POST")

try:
    dres = urllib.request.urlopen(dreq)
    print("DEPLOY OK:", dres.read().decode())
except Exception as e:
    print("DEPLOY ERROR:", e)
