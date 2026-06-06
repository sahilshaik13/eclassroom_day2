"""
Application approve/reject notifications.

Direct teacher invites use Supabase Auth "Invite user" template (password setup).
Application approved/rejected emails use backend SMTP (same credentials as Supabase Custom SMTP).
Student approve/reject uses Twilio SMS (applications collect phone, not email).
"""
from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from twilio.rest import Client as TwilioClient

from app.core.config import settings
from app.db.supabase import get_admin_client
from app.email import application_templates


class ApplicationNotificationService:
    @staticmethod
    def _smtp_configured() -> bool:
        return bool(
            settings.SMTP_HOST.strip()
            and settings.SMTP_FROM_EMAIL.strip()
            and settings.SMTP_USER.strip()
            and settings.SMTP_PASSWORD.strip()
        )

    @staticmethod
    def _send_smtp_sync(to_email: str, subject: str, html_body: str, plain_body: str) -> None:
        import ssl

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = (
            f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            if settings.SMTP_FROM_NAME
            else settings.SMTP_FROM_EMAIL
        )
        msg["To"] = to_email
        msg.attach(MIMEText(plain_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        port = settings.SMTP_PORT
        use_ssl = settings.SMTP_USE_SSL or port == 465
        ctx = ssl.create_default_context()

        if use_ssl:
            with smtplib.SMTP_SSL(
                settings.SMTP_HOST, port, timeout=30, context=ctx
            ) as server:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
        else:
            with smtplib.SMTP(settings.SMTP_HOST, port, timeout=30) as server:
                if settings.SMTP_USE_TLS:
                    server.starttls(context=ctx)
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())

    @staticmethod
    async def send_email(to_email: str, subject: str, html_body: str, plain_body: str) -> bool:
        if not to_email or "@" not in to_email:
            return False
        if not ApplicationNotificationService._smtp_configured():
            if not settings.is_production:
                print(f"[dev] Application email skipped (SMTP not configured): {subject} -> {to_email}")
            return False
        try:
            await asyncio.to_thread(
                ApplicationNotificationService._send_smtp_sync,
                to_email.strip(),
                subject,
                html_body,
                plain_body,
            )
            return True
        except Exception as exc:
            print(f"Application email failed ({to_email}): {exc}")
            return False

    @staticmethod
    async def send_sms(phone: str, body: str) -> bool:
        phone = "".join(filter(lambda x: x.isdigit() or x == "+", phone or ""))
        if not phone:
            return False
        if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
            if not settings.is_production:
                print(f"[dev] Application SMS skipped (Twilio not configured): {body[:80]}...")
            return False
        try:
            client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
            send_args: dict = {"to": phone, "body": body}
            if settings.TWILIO_MESSAGING_SERVICE_SID:
                send_args["messaging_service_sid"] = settings.TWILIO_MESSAGING_SERVICE_SID
            elif settings.TWILIO_PHONE_NUMBER:
                send_args["from_"] = settings.TWILIO_PHONE_NUMBER
            else:
                return False
            await asyncio.to_thread(client.messages.create, **send_args)
            return True
        except Exception as exc:
            print(f"Application SMS failed ({phone}): {exc}")
            return False

    @staticmethod
    def _tenant_name(tenant_id: str) -> str:
        try:
            admin = get_admin_client()
            res = (
                admin.table("tenants")
                .select("name")
                .eq("id", tenant_id)
                .maybe_single()
                .execute()
            )
            if res and res.data:
                return str(res.data.get("name") or "your organization")
        except Exception:
            pass
        return "your organization"

    @staticmethod
    async def notify_teacher_rejected(
        *, email: str, name: str, tenant_id: str
    ) -> None:
        tenant_name = ApplicationNotificationService._tenant_name(tenant_id)
        subject, html, plain = application_templates.teacher_application_rejected(
            name, tenant_name
        )
        await ApplicationNotificationService.send_email(email, subject, html, plain)

    @staticmethod
    async def notify_teacher_approved(
        *, email: str, name: str, tenant_id: str
    ) -> None:
        """Application approved notice — Supabase Invite email handles password setup separately."""
        tenant_name = ApplicationNotificationService._tenant_name(tenant_id)
        subject, html, plain = application_templates.teacher_application_approved(
            name, tenant_name
        )
        await ApplicationNotificationService.send_email(email, subject, html, plain)

    @staticmethod
    async def notify_student_rejected(
        *, phone: str, name: str, tenant_id: str, email: Optional[str] = None
    ) -> None:
        tenant_name = ApplicationNotificationService._tenant_name(tenant_id)
        sms = (
            f"Assalamu alaikum {name}, thank you for applying to {tenant_name}. "
            "After review, we are unable to approve your student application at this time. "
            "Please contact the school if you have questions."
        )
        await ApplicationNotificationService.send_sms(phone, sms)
        if email:
            subject, html, plain = application_templates.student_application_rejected(
                name, tenant_name
            )
            await ApplicationNotificationService.send_email(email, subject, html, plain)

    @staticmethod
    async def notify_student_approved(
        *,
        phone: str,
        name: str,
        tenant_id: str,
        class_name: str,
        email: Optional[str] = None,
    ) -> None:
        tenant_name = ApplicationNotificationService._tenant_name(tenant_id)
        login_url = f"{settings.FRONTEND_URL.rstrip('/')}/auth/student-login"
        sms = (
            f"Assalamu alaikum {name}, your application to {tenant_name} has been approved! "
            f"Class: {class_name}. Log in with your phone at {login_url}"
        )
        await ApplicationNotificationService.send_sms(phone, sms)
        if email:
            subject, html, plain = application_templates.student_application_approved(
                name, tenant_name, class_name, login_url
            )
            await ApplicationNotificationService.send_email(email, subject, html, plain)
