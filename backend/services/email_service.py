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
        logger.info(f"📧 [EMAIL SIMULATION / SMTP READY]\nTo: {to_email}\nSubject: {subject}\nBody preview: {html_body[:250]}...")
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


def _get_base_template(
    title_badge: str,
    title_gradient: str,
    headline: str,
    greeting_name: str,
    intro_paragraphs: list[str],
    kwh: float,
    kwh_color: str,
    stats_rows: list[tuple[str, str]],
    action_box_text: str,
    tip_text: str,
) -> str:
    """Reusable high-end HTML email template with dark sleek aesthetic & friendly workplace tone."""
    stats_html = "".join(
        f"""
        <div style="display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #27272a; font-size: 13px;">
          <span style="color: #a1a1aa;">{label}</span>
          <span style="font-weight: 600; color: #f4f4f5; font-family: monospace;">{val}</span>
        </div>
        """
        for label, val in stats_rows
    )

    intro_html = "".join(f"<p style='margin: 0 0 12px 0; line-height: 1.6; font-size: 14.5px;'>{p}</p>" for p in intro_paragraphs)

    return f"""
    <!DOCTYPE html>
    <html lang="pt">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>@Canditos OCPP</title>
    </head>
    <body style="margin: 0; padding: 24px 12px; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e4e4e7;">
      <div style="max-width: 540px; margin: 0 auto; background: #121826; border: 1px solid #1e293b; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
        
        <!-- Header Brand -->
        <div style="background: linear-gradient(135deg, #1e293b, #0f172a); padding: 28px 24px; text-align: center; border-bottom: 1px solid #1e293b;">
          <div style="display: inline-block; padding: 6px 14px; border-radius: 9999px; background: {title_badge}; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px;">
            {headline}
          </div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; background: {title_gradient}; -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
            @Canditos OCPP
          </h1>
          <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">Central de Mobilidade Elétrica Partilhada</p>
        </div>

        <!-- Main Body -->
        <div style="padding: 28px 24px;">
          <p style="margin: 0 0 14px 0; font-size: 16px; font-weight: 600; color: #ffffff;">
            Olá <span style="color: #60a5fa;">{greeting_name}</span> 👋
          </p>
          
          <div style="color: #cbd5e1;">
            {intro_html}
          </div>

          <!-- Highlight Action Box -->
          <div style="background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.25); border-radius: 14px; padding: 14px 18px; margin: 20px 0; text-align: center;">
            <div style="font-size: 14px; font-weight: 600; color: #93c5fd; margin-bottom: 4px;">
              🤝 Pedido de Cortesia entre Colegas
            </div>
            <div style="font-size: 13px; color: #bfdbfe; line-height: 1.4;">
              {action_box_text}
            </div>
          </div>

          <!-- Session Summary Card -->
          <div style="background: #182234; border: 1px solid #283548; border-radius: 16px; padding: 18px; margin-top: 20px;">
            <div style="text-align: center; margin-bottom: 8px;">
              <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; font-weight: 600;">Energia Carregada</span>
            </div>
            <div style="font-size: 30px; font-weight: 800; text-align: center; color: {kwh_color}; font-family: monospace; margin-bottom: 14px;">
              {kwh:.2f} <span style="font-size: 16px; font-weight: normal; color: #94a3b8;">kWh</span>
            </div>
            
            {stats_html}
          </div>

          <!-- Team Tip -->
          <div style="margin-top: 22px; padding: 12px 16px; background: #0f172a; border-radius: 12px; border: 1px solid #1e293b; font-size: 12px; color: #94a3b8; line-height: 1.5; text-align: center;">
            💡 <em>{tip_text}</em>
          </div>
        </div>

        <!-- Footer -->
        <div style="background: #0d1320; padding: 18px 24px; text-align: center; border-top: 1px solid #1e293b; font-size: 11px; color: #64748b;">
          <p style="margin: 0 0 4px 0;">Obrigado por fazeres parte da transição para uma mobilidade sustentável! ⚡</p>
          <p style="margin: 0; opacity: 0.7;">@Canditos OCPP Central System · Postos Partilhados da Empresa</p>
        </div>

      </div>
    </body>
    </html>
    """


def notify_ac_suspended_ev(
    to_email: str,
    username: str,
    charge_point_id: str,
    connector_id: int,
    transaction_id: int,
    kwh: float,
    start_time_str: str,
):
    """Send collaborative reminder when AC charging reaches SuspendedEV (battery full)."""
    if transaction_id in _NOTIFIED_SUSPENDED_TXS:
        return
    _NOTIFIED_SUSPENDED_TXS.add(transaction_id)

    subject = f"🚗 Carregamento Concluído (100%)! Por favor liberta o posto para um colega ⚡"
    
    html = _get_base_template(
        title_badge="rgba(16, 185, 129, 0.2); color: #34d399;",
        title_gradient="linear-gradient(90deg, #34d399, #60a5fa)",
        headline="🔋 BATERIA A 100% / CARGA CONCLUÍDA",
        greeting_name=username,
        intro_paragraphs=[
            f"O teu veículo terminou o carregamento no posto <strong>{charge_point_id} (Tomada #{connector_id})</strong>.",
            "Como partilhamos os postos de carregamento com toda a equipa, agradecemos imenso que <strong>retires o carro assim que tiveres disponibilidade</strong> para que outro colega possa também carregar.",
        ],
        kwh=kwh,
        kwh_color="#34d399",
        stats_rows=[
            ("Posto:", charge_point_id),
            ("Tomada:", f"#{connector_id}"),
            ("Transação:", f"#{transaction_id}"),
            ("Hora de Início:", start_time_str),
            ("Estado:", "🟢 Bateria Cheia / SuspendedEV"),
        ],
        action_box_text="Se puderes dar um saltinho ao parque para retirar o cabo, deixas a tomada pronta para o próximo colaborador da lista! Muito obrigado! 🙌",
        tip_text="Dica de equipa: Libertar o posto assim que a carga acaba ajuda todos os colegas a terem bateria para regressar a casa sem stress!",
    )
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

    subject = f"⚡ Carregamento Rápido DC Concluído - Posto {charge_point_id} livre para o próximo colega"

    html = _get_base_template(
        title_badge="rgba(59, 130, 246, 0.2); color: #60a5fa;",
        title_gradient="linear-gradient(90deg, #60a5fa, #818cf8)",
        headline="🚀 CARGA RÁPIDA DC FINALIZADA",
        greeting_name=username,
        intro_paragraphs=[
            f"A tua sessão de carregamento rápido DC no posto <strong>{charge_point_id} (Tomada #{connector_id})</strong> foi finalizada.",
            "O posto DC já se encontra disponível. Podes desocupar o lugar quando puderes para garantir a rotatividade rápida da equipa.",
        ],
        kwh=kwh,
        kwh_color="#60a5fa",
        stats_rows=[
            ("Posto DC:", charge_point_id),
            ("Tomada:", f"#{connector_id}"),
            ("Transação:", f"#{transaction_id}"),
            ("Início:", start_time_str),
            ("Fim:", stop_time_str),
            ("Motivo:", stop_reason),
        ],
        action_box_text="Muito obrigado pelo espírito de equipa e por manteres a nossa infraestrutura de carregamento a rodar para todos! 🚗💨",
        tip_text="Os postos DC destinam-se a cargas rápidas. Desocupar o lugar logo após o término permite que mais colegas aproveitem a potência máxima!",
    )
    send_email(to_email, subject, html)


def notify_manual_move_car_reminder(
    to_email: str,
    username: str,
    charge_point_id: str,
    connector_id: int,
    requester_name: str = "Administração / Colega de Equipa",
    current_kwh: float = 0.0,
):
    """Send manual reminder sent by Admin or colleague asking driver to move car."""
    subject = f"🔔 Lembrete Amigável: Há um colega à espera para carregar no Posto {charge_point_id} ⚡"

    html = _get_base_template(
        title_badge="rgba(245, 158, 11, 0.2); color: #fbbf24;",
        title_gradient="linear-gradient(90deg, #fbbf24, #f59e0b)",
        headline="🔔 LEMBRETE DE EQUIPA",
        greeting_name=username,
        intro_paragraphs=[
            f"Temos um colega de equipa a aguardar por uma tomada disponível no posto <strong>{charge_point_id} (Tomada #{connector_id})</strong>.",
            f"Se o teu veículo já tiver carga suficiente (ou tiver terminado a sessão), pedimos a gentileza de <strong>moveres o carro quando tiveres 5 minutinhos livres</strong>.",
        ],
        kwh=current_kwh,
        kwh_color="#fbbf24",
        stats_rows=[
            ("Posto:", charge_point_id),
            ("Tomada:", f"#{connector_id}"),
            ("Solicitado por:", requester_name),
            ("Consumo da Sessão:", f"{current_kwh:.2f} kWh"),
        ],
        action_box_text="Um simples gesto que faz toda a diferença para o dia de trabalho dos teus colegas! Muito obrigado pela entreajuda! 🤝",
        tip_text="A mobilidade partilhada funciona melhor com cooperação. Obrigado pela atenção!",
    )
    return send_email(to_email, subject, html)
