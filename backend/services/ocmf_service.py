import base64
import binascii
import json
import logging
import re
from typing import Any, Dict, List, Optional
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import load_pem_public_key, load_der_public_key
from cryptography.exceptions import InvalidSignature

logger = logging.getLogger(__name__)

OBIS_DESCRIPTIONS = {
    "1-0:1.8.0": "Total Active Energy Import (Active Total)",
    "1-0:1.8.1": "Active Energy Import Tariff 1 (T1)",
    "1-0:1.8.2": "Active Energy Import Tariff 2 (T2)",
    "1-0:2.8.0": "Total Active Energy Export",
    "1-0:3.8.0": "Reactive Energy Import (Q+)",
    "1-0:4.8.0": "Reactive Energy Export (Q-)",
    "1-0:1.4.0": "Current Active Power Import",
    "1-0:31.7.0": "Phase L1 Instantaneous Current",
    "1-0:51.7.0": "Phase L2 Instantaneous Current",
    "1-0:71.7.0": "Phase L3 Instantaneous Current",
    "1-0:32.7.0": "Phase L1 Voltage",
    "1-0:52.7.0": "Phase L2 Voltage",
    "1-0:72.7.0": "Phase L3 Voltage",
}


class OcmfParseResult:
    def __init__(
        self,
        is_valid_format: bool,
        raw_ocmf: str,
        version: Optional[str] = None,
        gateway_id: Optional[str] = None,
        status: Optional[str] = None,
        timestamp: Optional[str] = None,
        identification_status: Optional[str] = None,
        meter_readings: Optional[List[Dict[str, Any]]] = None,
        signature_data: Optional[str] = None,
        signature_algo: Optional[str] = None,
        raw_data_to_verify: Optional[str] = None,
        error: Optional[str] = None,
    ):
        self.is_valid_format = is_valid_format
        self.raw_ocmf = raw_ocmf
        self.version = version
        self.gateway_id = gateway_id
        self.status = status
        self.timestamp = timestamp
        self.identification_status = identification_status
        self.meter_readings = meter_readings or []
        self.signature_data = signature_data
        self.signature_algo = signature_algo or "ECDSA-secp256r1-SHA256"
        self.raw_data_to_verify = raw_data_to_verify or ""
        self.error = error

    def to_dict(self) -> Dict[str, Any]:
        return {
            "is_valid_format": self.is_valid_format,
            "version": self.version,
            "gateway_id": self.gateway_id,
            "status": self.status,
            "timestamp": self.timestamp,
            "identification_status": self.identification_status,
            "meter_readings": self.meter_readings,
            "signature_algo": self.signature_algo,
            "signature_data_preview": (self.signature_data[:32] + "...") if self.signature_data else None,
            "error": self.error,
        }


def parse_ocmf(ocmf_str: str) -> OcmfParseResult:
    """
    Parses an OCMF (Open Charge Metering Format) string.
    Format: OCMF|<JSON_DATA>|<JSON_SIGNATURE>
    """
    if not ocmf_str or not isinstance(ocmf_str, str):
        return OcmfParseResult(False, str(ocmf_str), error="Payload OCMF vazio ou inválido")

    clean_str = ocmf_str.strip()
    if clean_str.startswith('"') and clean_str.endswith('"'):
        clean_str = clean_str[1:-1]

    parts = clean_str.split("|")
    if len(parts) < 3 or parts[0].upper() != "OCMF":
        return OcmfParseResult(
            False,
            clean_str,
            error="Formato de cabeçalho OCMF inválido (deve iniciar com 'OCMF|...|...')"
        )

    raw_data_to_verify = parts[1]
    raw_sig = parts[2]

    try:
        data_json = json.loads(raw_data_to_verify)
    except Exception as e:
        return OcmfParseResult(
            False,
            clean_str,
            error=f"Falha ao interpretar bloco de dados JSON do OCMF: {e}"
        )

    try:
        sig_json = json.loads(raw_sig)
    except Exception:
        sig_json = {"SD": raw_sig, "SA": "ECDSA-secp256r1-SHA256"}

    version = data_json.get("FV", data_json.get("version", "1.0"))
    gateway_id = data_json.get("GS", data_json.get("MS", data_json.get("GI", "")))
    status = data_json.get("ST", data_json.get("status", ""))
    is_status = data_json.get("IS", None)
    t_val = data_json.get("t", data_json.get("timestamp", None))

    # Read readings (RV array or direct OBIS entries)
    readings: List[Dict[str, Any]] = []
    raw_rv = data_json.get("RD", data_json.get("RV", data_json.get("readings", [])))
    if isinstance(raw_rv, list):
        for item in raw_rv:
            if isinstance(item, dict):
                obis = item.get("RI", item.get("t", item.get("obis", "")))
                val = item.get("RV", item.get("v", item.get("value", 0)))
                unit = item.get("RU", item.get("u", item.get("unit", "kWh")))
                loss = item.get("UC", item.get("l", item.get("loss", None)))
                readings.append({
                    "obis": obis,
                    "description": OBIS_DESCRIPTIONS.get(obis, f"Código OBIS {obis}"),
                    "value": val,
                    "unit": unit,
                    "cable_loss": loss,
                })

    sig_data = sig_json.get("SD", "") if isinstance(sig_json, dict) else ""
    if not sig_data and isinstance(data_json.get("SD"), str):
        sig_data = data_json["SD"]

    sig_algo = sig_json.get("SA", "ECDSA-secp256r1-SHA256") if isinstance(sig_json, dict) else "ECDSA-secp256r1-SHA256"

    return OcmfParseResult(
        is_valid_format=True,
        raw_ocmf=clean_str,
        version=str(version),
        gateway_id=str(gateway_id),
        status=str(status),
        timestamp=str(t_val) if t_val else None,
        identification_status=str(is_status) if is_status is not None else None,
        meter_readings=readings,
        signature_data=sig_data,
        signature_algo=sig_algo,
        raw_data_to_verify=raw_data_to_verify,
    )


def load_public_key_from_string(key_str: str, curve_hint: str = "secp256r1") -> Any:
    """
    Universal ECDSA Public Key Loader for LEM DCBM meters.
    Supports:
    - Raw SEC1 Uncompressed Hex (130 hex chars / 65 bytes starting with 04)
    - Raw 64-byte Hex (128 hex chars without leading 04)
    - Raw SEC1 Compressed Hex (66 hex chars / 33 bytes starting with 02/03)
    - Partial or Full ASN.1 DER Structures
    - X.509 SubjectPublicKeyInfo in DER (Hex or Base64)
    - Standard PEM formatted keys (-----BEGIN PUBLIC KEY-----)
    """
    if not key_str:
        raise ValueError("Chave pública não fornecida")

    clean_key = key_str.strip()

    # 1. PEM format
    if "BEGIN PUBLIC KEY" in clean_key or "BEGIN CERTIFICATE" in clean_key or "BEGIN EC PUBLIC KEY" in clean_key:
        return load_pem_public_key(clean_key.encode("utf-8"))

    # Curve selection
    curve = ec.BrainpoolP256R1() if "brainpool" in curve_hint.lower() else ec.SECP256R1()

    # Clean hex string
    hex_clean = re.sub(r"[^0-9a-fA-F]", "", clean_key)

    # 2. Check if embedded uncompressed EC point (04 + 128 hex = 130 chars) exists inside ASN.1 / partial DER or raw
    ec_uncompressed_match = re.search(r"04[0-9a-fA-F]{128}", hex_clean, re.IGNORECASE)
    if ec_uncompressed_match:
        try:
            pt_bytes = binascii.unhexlify(ec_uncompressed_match.group(0))
            return ec.EllipticCurvePublicKey.from_encoded_point(curve, pt_bytes)
        except Exception:
            pass

    # 3. Check if exact 64 bytes (128 hex chars without leading 04)
    if len(hex_clean) == 128:
        try:
            pt_bytes = b"\x04" + binascii.unhexlify(hex_clean)
            return ec.EllipticCurvePublicKey.from_encoded_point(curve, pt_bytes)
        except Exception:
            pass

    # 4. Check if compressed EC point (02 or 03 + 64 hex = 66 chars)
    if len(hex_clean) == 66 and (hex_clean.startswith("02") or hex_clean.startswith("03")):
        try:
            pt_bytes = binascii.unhexlify(hex_clean)
            return ec.EllipticCurvePublicKey.from_encoded_point(curve, pt_bytes)
        except Exception:
            pass

    # 5. Try standard DER SubjectPublicKeyInfo
    try:
        raw_bytes = binascii.unhexlify(hex_clean)
        return load_der_public_key(raw_bytes)
    except Exception:
        pass

    # 6. Try Base64 DER
    try:
        der_bytes = base64.b64decode(clean_key)
        return load_der_public_key(der_bytes)
    except Exception:
        pass

    # 7. Try Base64 raw EC Point
    try:
        b64_bytes = base64.b64decode(clean_key)
        if len(b64_bytes) in (65, 33):
            return ec.EllipticCurvePublicKey.from_encoded_point(curve, b64_bytes)
        elif len(b64_bytes) == 64:
            return ec.EllipticCurvePublicKey.from_encoded_point(curve, b"\x04" + b64_bytes)
    except Exception:
        pass

    raise ValueError("Formato de Chave Pública não reconhecido (use Hexadecimal 04..., PEM ou DER)")


def verify_ocmf_signature(
    ocmf_str: str,
    public_key_str: str,
    curve_name: str = "secp256r1"
) -> Dict[str, Any]:
    """
    Verify the ECDSA signature of an OCMF message using the meter's public key.
    Returns validation verdict, decoded readings, and audit report.
    """
    parsed = parse_ocmf(ocmf_str)
    if not parsed.is_valid_format or not parsed.signature_data:
        return {
            "verified": False,
            "error": parsed.error or "Assinatura digital não encontrada no payload OCMF",
            "parsed": parsed.to_dict() if parsed else None,
        }

    try:
        public_key = load_public_key_from_string(public_key_str, curve_hint=curve_name)
    except Exception as e:
        return {
            "verified": False,
            "error": f"Chave Pública do medidor LEM inválida: {e}",
            "parsed": parsed.to_dict(),
        }

    # Prepare signature bytes
    sig_raw = parsed.signature_data.strip()
    sig_bytes = None

    try:
        sig_bytes = base64.b64decode(sig_raw)
    except Exception:
        pass

    if not sig_bytes:
        try:
            sig_bytes = binascii.unhexlify(re.sub(r"[^0-9a-fA-F]", "", sig_raw))
        except Exception:
            return {
                "verified": False,
                "error": "Assinatura digital 'SD' não está em formato Base64 ou Hexadecimal válido",
                "parsed": parsed.to_dict(),
            }

    # Convert raw IEEE P1363 (R || S, 64 bytes) to ASN.1 DER if necessary
    der_signature = sig_bytes
    if len(sig_bytes) == 64:
        r = int.from_bytes(sig_bytes[:32], byteorder="big")
        s = int.from_bytes(sig_bytes[32:], byteorder="big")
        der_signature = utils.encode_dss_signature(r, s)

    data_to_verify = parsed.raw_data_to_verify.encode("utf-8")

    try:
        public_key.verify(
            der_signature,
            data_to_verify,
            ec.ECDSA(hashes.SHA256())
        )
        is_valid = True
        error_msg = None
    except InvalidSignature:
        is_valid = False
        error_msg = "Assinatura Criptográfica ECDSA Inválida (os dados foram alterados ou a chave pública não corresponde ao medidor)"
    except Exception as e:
        is_valid = False
        error_msg = f"Erro na validação criptográfica: {e}"

    return {
        "verified": is_valid,
        "error": error_msg,
        "algorithm": parsed.signature_algo,
        "curve": curve_name,
        "meter_serial": parsed.gateway_id,
        "ocmf_version": parsed.version,
        "status": parsed.status,
        "timestamp": parsed.timestamp,
        "readings": parsed.meter_readings,
        "parsed": parsed.to_dict(),
    }
