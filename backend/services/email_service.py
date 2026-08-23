import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

logger = logging.getLogger(__name__)

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM = os.getenv("SMTP_FROM", "Canditos OCPP <noreply@canditos.com>")
SMTP_TLS = os.getenv("SMTP_TLS", "true").lower() in ("true", "1", "yes")

# Cache to avoid sending duplicate SuspendedEV emails in the same transaction
_NOTIFIED_SUSPENDED_TXS = set()
_NOTIFIED_STOPPED_TXS = set()


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an email using configured SMTP or log if SMTP is not configured."""
    if not to_email or "@" not in to_email:
        logger.warning(f"Invalid recipient email: {to_email}")
        return False

    if not SMTP_HOST or not SMTP_USER:
        logger.info(f"📧 [EMAIL SIMULATION / SMTP NOT CONFIGURED]\nTo: {to_email}\nSubject: {subject}\nBody preview: {html_body[:200]}...")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to_email

        part = MIMEText(html_body, "html", "utf-8")
        msg.attach(part)

        if SMTP_TLS:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM, [to_email], msg.as_string())

        logger.info(f"📧 [EMAIL SENT] To: {to_email} | Subject: {subject}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


def notify_ac_suspended_ev(
    to_email: str,
    username: str,
    charge_point_id: str,
    connector_id: int,
    transaction_id: int,
    kwh: float,
    start_time_str: str,
):
    """Send notification when AC charging reaches SuspendedEV (battery full / EV suspended)."""
    if transaction_id in _NOTIFIED_SUSPENDED_TXS:
        return
    _NOTIFIED_SUSPENDED_TXS.add(transaction_id)

    subject = f"⚡ Bateria Cheia / Carga Suspensa (AC) - Posto {charge_point_id}"
    
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; color: #f3f4f6; margin: 0; padding: 20px; }}
        .container {{ max-width: 560px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
        .header {{ background: linear-gradient(135deg, #10b981, #059669); padding: 24px; text-align: center; color: white; }}
        .content {{ padding: 24px; }}
        .card {{ background: #1f2937; border-radius: 12px; padding: 16px; margin: 16px 0; border: 1px solid #374151; }}
        .stat {{ display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }}
        .stat-label {{ color: #9ca3af; }}
        .stat-value {{ font-weight: bold; color: #f9fafb; }}
        .kwh {{ font-size: 24px; color: #10b981; font-weight: bold; text-align: center; margin: 12px 0; }}
        .footer {{ text-align: center; padding: 16px; font-size: 12px; color: #6b7280; border-top: 1px solid #1f2937; }}
        .badge {{ display: inline-block; padding: 4px 10px; background: rgba(16, 185, 129, 0.2); color: #34d399; border-radius: 9999px; font-size: 12px; font-weight: 600; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 20px;">@Canditos OCPP</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">Aviso de Fim de Carregamento</p>
        </div>
        <div class="content">
          <p style="font-size: 16px;">Olá <strong>{username}</strong>,</p>
          <p style="color: #9ca3af; font-size: 14px; line-height: 1.5;">
            O teu veículo suspendeu o carregamento (<strong>Bateria a 100% / SuspendedEV</strong>) no posto AC.
            Por favor, retira o veículo assim que possível para libertar a tomada para outros condutores.
          </p>

          <div class="card">
            <div style="text-align: center; margin-bottom: 10px;">
              <span class="badge">Sessão AC Suspensa / Concluída</span>
            </div>
            <div class="kwh">{kwh:.2f} kWh</div>
            <div class="stat">
              <span class="stat-label">Posto:</span>
              <span class="stat-value">{charge_point_id}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Tomada:</span>
              <span class="stat-value">#{connector_id}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Transação:</span>
              <span class="stat-value">#{transaction_id}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Início:</span>
              <span class="stat-value">{start_time_str}</span>
            </div>
          </div>
        </div>
        <div class="footer">
          Central System OCPP 1.6 · @Canditos OCPP
        </div>
      </div>
    </body>
    </html>
    """
    send_email(to_email, subject, html)


def notify_dc_charging_completed(
    to_email: str,
    username: str,
    charge_point_id: str,
    connector_id: int,
    transaction_id: int,
    kwh: float,
    start_time_str: str,
    stop_time_str: str,
    stop_reason: str,
):
    """Send notification when DC fast charging finishes (StopTransaction)."""
    if transaction_id in _NOTIFIED_STOPPED_TXS:
        return
    _NOTIFIED_STOPPED_TXS.add(transaction_id)

    subject = f"🔋 Carregamento Rápido DC Concluído - Posto {charge_point_id}"

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0b0f19; color: #f3f4f6; margin: 0; padding: 20px; }}
        .container {{ max-width: 560px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }}
        .header {{ background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 24px; text-align: center; color: white; }}
        .content {{ padding: 24px; }}
        .card {{ background: #1f2937; border-radius: 12px; padding: 16px; margin: 16px 0; border: 1px solid #374151; }}
        .stat {{ display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }}
        .stat-label {{ color: #9ca3af; }}
        .stat-value {{ font-weight: bold; color: #f9fafb; }}
        .kwh {{ font-size: 26px; color: #60a5fa; font-weight: bold; text-align: center; margin: 12px 0; }}
        .footer {{ text-align: center; padding: 16px; font-size: 12px; color: #6b7280; border-top: 1px solid #1f2937; }}
        .badge {{ display: inline-block; padding: 4px 10px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; border-radius: 9999px; font-size: 12px; font-weight: 600; }}
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; font-size: 20px;">@Canditos OCPP</h1>
          <p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">Resumo da Sessão DC</p>
        </div>
        <div class="content">
          <p style="font-size: 16px;">Olá <strong>{username}</strong>,</p>
          <p style="color: #9ca3af; font-size: 14px; line-height: 1.5;">
            O teu carregamento rápido DC foi concluído com sucesso. Abaixo encontras o resumo detalhado da sessão:
          </p>

          <div class="card">
            <div style="text-align: center; margin-bottom: 10px;">
              <span class="badge">Carregamento DC Concluído</span>
            </div>
            <div class="kwh">{kwh:.2f} kWh</div>
            <div class="stat">
              <span class="stat-label">Posto DC:</span>
              <span class="stat-value">{charge_point_id}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Tomada:</span>
              <span class="stat-value">#{connector_id}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Transação:</span>
              <span class="stat-value">#{transaction_id}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Início:</span>
              <span class="stat-value">{start_time_str}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Fim:</span>
              <span class="stat-value">{stop_time_str}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Motivo de Paragem:</span>
              <span class="stat-value">{stop_reason}</span>
            </div>
          </div>
        </div>
        <div class="footer">
          Central System OCPP 1.6 · @Canditos OCPP
        </div>
      </div>
    </body>
    </html>
    """
    send_email(to_email, subject, html)
