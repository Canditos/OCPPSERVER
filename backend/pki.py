"""
OCPP 1.6 & 2.0.1 PKI (Public Key Infrastructure) Module.
Manages Root CA, sub-CAs, Client Certificates, and CSR signing for Security Profile 3 (mTLS).
"""
import os
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Tuple, Dict, Any, Optional
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa

CERTS_DIR = os.path.join(os.path.dirname(__file__), "certs")
os.makedirs(CERTS_DIR, exist_ok=True)

CA_KEY_FILE = os.path.join(CERTS_DIR, "csms_root_ca.key")
CA_CERT_FILE = os.path.join(CERTS_DIR, "csms_root_ca.crt")


def get_or_create_root_ca(common_name: str = "Canditos CSMS Root CA") -> Tuple[str, str]:
    """
    Returns (ca_cert_pem, ca_key_pem). If not already present, generates a new 2048-bit RSA Root CA valid for 10 years.
    """
    if os.path.exists(CA_KEY_FILE) and os.path.exists(CA_CERT_FILE):
        with open(CA_KEY_FILE, "rb") as f:
            key_pem = f.read().decode("utf-8")
        with open(CA_CERT_FILE, "rb") as f:
            cert_pem = f.read().decode("utf-8")
        return cert_pem, key_pem

    # Generate RSA 2048 Private Key
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "PT"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Setubal"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Canditos OCPP Network"),
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
    ])

    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=3650))  # 10 years
        .add_extension(
            x509.BasicConstraints(ca=True, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=False,
                key_cert_sign=True,
                crl_sign=True,
                content_commitment=False,
                data_encipherment=False,
                key_agreement=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .sign(private_key, hashes.SHA256())
    )

    key_pem_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    )
    cert_pem_bytes = cert.public_bytes(serialization.Encoding.PEM)

    with open(CA_KEY_FILE, "wb") as f:
        f.write(key_pem_bytes)
    with open(CA_CERT_FILE, "wb") as f:
        f.write(cert_pem_bytes)

    return cert_pem_bytes.decode("utf-8"), key_pem_bytes.decode("utf-8")


def issue_client_certificate(
    charge_point_id: str,
    validity_days: int = 365,
    organization: str = "Canditos EV Charging"
) -> Dict[str, Any]:
    """
    Issues a full client certificate and private key for a Charge Point (EVSE).
    Common Name (CN) is set to charge_point_id.
    """
    ca_cert_pem, ca_key_pem = get_or_create_root_ca()
    ca_cert = x509.load_pem_x509_certificate(ca_cert_pem.encode("utf-8"))
    ca_key = serialization.load_pem_private_key(ca_key_pem.encode("utf-8"), password=None)

    client_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    subject = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "PT"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization),
        x509.NameAttribute(NameOID.COMMON_NAME, charge_point_id),
    ])

    now = datetime.now(timezone.utc)
    serial_number = x509.random_serial_number()

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(ca_cert.subject)
        .public_key(client_key.public_key())
        .serial_number(serial_number)
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=validity_days))
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=True,
                content_commitment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH]),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode("utf-8")
    key_pem = client_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    hash_data = calculate_ocpp_certificate_hash(cert_pem)

    return {
        "charge_point_id": charge_point_id,
        "certificate_pem": cert_pem,
        "private_key_pem": key_pem,
        "ca_root_pem": ca_cert_pem,
        "serial_number": str(serial_number),
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(days=validity_days)).isoformat(),
        "issuer_name_hash": hash_data["issuer_name_hash"],
        "issuer_key_hash": hash_data["issuer_key_hash"],
    }


def sign_csr(
    csr_pem: str,
    validity_days: int = 365,
    expected_charge_point_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Signs a Certificate Signing Request (CSR) submitted by an EVSE via OCPP SignCertificate.
    Returns the signed X.509 certificate in PEM format.
    """
    ca_cert_pem, ca_key_pem = get_or_create_root_ca()
    ca_cert = x509.load_pem_x509_certificate(ca_cert_pem.encode("utf-8"))
    ca_key = serialization.load_pem_private_key(ca_key_pem.encode("utf-8"), password=None)

    csr = x509.load_pem_x509_csr(csr_pem.encode("utf-8"))
    if not csr.is_signature_valid:
        raise ValueError("A assinatura digital do CSR é inválida")

    common_names = csr.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
    cn = common_names[0].value if common_names else "UnknownEVSE"

    if expected_charge_point_id and cn != expected_charge_point_id:
        raise ValueError(f"O CommonName no CSR ('{cn}') não coincide com o ID do posto ('{expected_charge_point_id}')")

    now = datetime.now(timezone.utc)
    serial_number = x509.random_serial_number()

    cert = (
        x509.CertificateBuilder()
        .subject_name(csr.subject)
        .issuer_name(ca_cert.subject)
        .public_key(csr.public_key())
        .serial_number(serial_number)
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=validity_days))
        .add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=True,
                content_commitment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(
            x509.ExtendedKeyUsage([ExtendedKeyUsageOID.CLIENT_AUTH]),
            critical=False,
        )
        .sign(ca_key, hashes.SHA256())
    )

    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode("utf-8")
    hash_data = calculate_ocpp_certificate_hash(cert_pem)

    return {
        "certificate_pem": cert_pem,
        "ca_root_pem": ca_cert_pem,
        "serial_number": str(serial_number),
        "valid_from": now.isoformat(),
        "valid_to": (now + timedelta(days=validity_days)).isoformat(),
        "issuer_name_hash": hash_data["issuer_name_hash"],
        "issuer_key_hash": hash_data["issuer_key_hash"],
    }


def calculate_ocpp_certificate_hash(cert_pem: str) -> Dict[str, str]:
    """
    Calculates standard OCPP 1.6/2.0.1 CertificateHashData:
    - issuer_name_hash: SHA256 of Issuer DER bytes (hex string)
    - issuer_key_hash: SHA256 of Issuer Public Key DER bytes (hex string)
    - serial_number: decimal serial number string
    """
    cert = x509.load_pem_x509_certificate(cert_pem.encode("utf-8"))
    
    # Issuer Name DER
    issuer_der = cert.issuer.public_bytes()
    issuer_name_hash = hashlib.sha256(issuer_der).hexdigest()

    # Issuer Public Key Info DER
    ca_cert_pem, _ = get_or_create_root_ca()
    ca_cert = x509.load_pem_x509_certificate(ca_cert_pem.encode("utf-8"))
    ca_pubkey_der = ca_cert.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    issuer_key_hash = hashlib.sha256(ca_pubkey_der).hexdigest()

    return {
        "issuer_name_hash": issuer_name_hash,
        "issuer_key_hash": issuer_key_hash,
        "serial_number": str(cert.serial_number),
        "subject_cn": cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value if cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME) else "Unknown",
        "issuer_cn": cert.issuer.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value if cert.issuer.get_attributes_for_oid(NameOID.COMMON_NAME) else "Unknown",
    }
