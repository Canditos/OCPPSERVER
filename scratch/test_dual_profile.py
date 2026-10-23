import sys
import os
import json
import base64
sys.path.insert(0, os.path.abspath('backend'))

from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes, serialization
from services.ocmf_service import verify_ocmf_signature

# Generate a real EC key
private_key = ec.generate_private_key(ec.SECP256R1())
public_key = private_key.public_key()
raw_pt = public_key.public_bytes(
    encoding=serialization.Encoding.X962,
    format=serialization.PublicFormat.UncompressedPoint
)
pk_hex = raw_pt.hex()

# Payload 1: OCMF 1.4.0 (Latest)
data_str_v14 = '{"FV":"1.4.0","GI":"LEM_DCBM_400","ST":"T","t":"2026-10-23T22:00:00Z","RV":[{"t":"1-0:1.8.0","v":10000,"u":"Wh","l":50}]}'
msg_to_sign_v14 = f'OCMF|{data_str_v14}|'.encode('utf-8')
der_sig_v14 = private_key.sign(msg_to_sign_v14, ec.ECDSA(hashes.SHA256()))
b64_sig_v14 = base64.b64encode(der_sig_v14).decode('utf-8')
ocmf_payload_v14 = f'OCMF|{data_str_v14}|{{"SA":"ECDSA-secp256r1-SHA256","SD":"{b64_sig_v14}"}}'

res_v14 = verify_ocmf_signature(ocmf_payload_v14, pk_hex, safe_profile='both')
print('--- Test OCMF 1.4.0 ---')
print('Verified:', res_v14['verified'])
print('v141 Status:', res_v14['profiles']['v141']['status'], 'Compliant:', res_v14['profiles']['v141']['compliant'])
print('v130 Status:', res_v14['profiles']['v130']['status'], 'Compliant:', res_v14['profiles']['v130']['compliant'])
print('v130 Warnings:', res_v14['profiles']['v130']['warnings'])

# Payload 2: OCMF 1.3.0 (Legacy Baseline)
data_str_v13 = '{"FV":"1.3.0","GI":"BAUER_BSM_WS","ST":"T","t":"2026-10-23T22:00:00Z","RV":[{"t":"1-0:1.8.0","v":8500,"u":"Wh"}]}'
msg_to_sign_v13 = f'OCMF|{data_str_v13}|'.encode('utf-8')
der_sig_v13 = private_key.sign(msg_to_sign_v13, ec.ECDSA(hashes.SHA256()))
b64_sig_v13 = base64.b64encode(der_sig_v13).decode('utf-8')
ocmf_payload_v13 = f'OCMF|{data_str_v13}|{{"SA":"ECDSA-secp256r1-SHA256","SD":"{b64_sig_v13}"}}'

res_v13 = verify_ocmf_signature(ocmf_payload_v13, pk_hex, safe_profile='both')
print('\n--- Test OCMF 1.3.0 ---')
print('Verified:', res_v13['verified'])
print('v141 Status:', res_v13['profiles']['v141']['status'], 'Compliant:', res_v13['profiles']['v141']['compliant'])
print('v130 Status:', res_v13['profiles']['v130']['status'], 'Compliant:', res_v13['profiles']['v130']['compliant'])
print('v130 Warnings:', res_v13['profiles']['v130']['warnings'])
