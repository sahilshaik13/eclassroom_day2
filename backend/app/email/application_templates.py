"""HTML + plain-text bodies for application lifecycle emails (SMTP / Supabase-style)."""

from html import escape

_BRAND_GOLD = "#C9A84C"
_FONT = "'DM Sans', sans-serif"


def _wrap_html(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{escape(title)}</title>
</head>
<body style="margin:0;padding:24px 16px;background:#fafafa;">
  <div style="font-family:{_FONT};color:#1a1a1a;max-width:600px;margin:0 auto;border:1px solid #eee;border-radius:16px;padding:32px;background:#ffffff;">
    <h2 style="color:{_BRAND_GOLD};font-size:24px;margin:0 0 16px;">{escape(title)}</h2>
    {body_html}
    <hr style="border:0;border-top:1px solid #eee;margin:32px 0;" />
    <p style="color:#999;font-size:12px;margin:0;">ThinkTarteeb E-Classroom Portal</p>
  </div>
</body>
</html>"""


def teacher_application_rejected(name: str, tenant_name: str) -> tuple[str, str, str]:
    subject = f"Update on your teaching application — {tenant_name}"
    safe_name = escape(name)
    safe_tenant = escape(tenant_name)
    body_html = f"""
<p>Hello <strong>{safe_name}</strong>,</p>
<p>Thank you for your interest in joining <strong>{safe_tenant}</strong> as a teacher.</p>
<p>After careful review, we are unable to move forward with your application at this time.</p>
<p style="color:#666;font-size:14px;">We appreciate the time you took to apply and wish you success in your teaching journey.</p>
"""
    plain = (
        f"Hello {name},\n\n"
        f"Thank you for applying to teach at {tenant_name}.\n\n"
        "After review, we are unable to approve your application at this time.\n\n"
        "We appreciate your interest and wish you success."
    )
    return subject, _wrap_html("Application update", body_html), plain


def teacher_application_approved(name: str, tenant_name: str) -> tuple[str, str, str]:
    subject = f"Your teaching application was approved — {tenant_name}"
    safe_name = escape(name)
    safe_tenant = escape(tenant_name)
    body_html = f"""
<p>Hello <strong>{safe_name}</strong>,</p>
<p>Great news! Your application to join <strong>{safe_tenant}</strong> as a teacher has been <strong>approved</strong>.</p>
<p>You will receive a <strong>separate email</strong> titled <em>Welcome to ThinkTarteeb!</em> with a link to set up your account password. Please check your inbox (and spam folder) within the next few minutes.</p>
<p style="color:#666;font-size:14px;">If you do not receive the setup email, contact your school administrator to resend the invite.</p>
"""
    plain = (
        f"Hello {name},\n\n"
        f"Your application to join {tenant_name} as a teacher has been approved.\n\n"
        "You will receive a separate email with a link to set up your account and password.\n\n"
        "If you do not see it within a few minutes, check spam or contact your administrator."
    )
    return subject, _wrap_html("Application approved", body_html), plain


def student_application_rejected(name: str, tenant_name: str) -> tuple[str, str, str]:
    subject = f"Update on your student application — {tenant_name}"
    safe_name = escape(name)
    safe_tenant = escape(tenant_name)
    body_html = f"""
<p>Hello <strong>{safe_name}</strong>,</p>
<p>Thank you for applying to join <strong>{safe_tenant}</strong>.</p>
<p>After review, we are unable to approve your student application at this time.</p>
<p style="color:#666;font-size:14px;">If you have questions, please contact the school directly.</p>
"""
    plain = (
        f"Hello {name},\n\n"
        f"Thank you for applying to {tenant_name}.\n\n"
        "After review, we are unable to approve your application at this time.\n\n"
        "Please contact the school if you have questions."
    )
    return subject, _wrap_html("Application update", body_html), plain


def student_application_approved(
    name: str, tenant_name: str, class_name: str, login_url: str
) -> tuple[str, str, str]:
    subject = f"Welcome to {tenant_name} — your application was approved"
    safe_name = escape(name)
    safe_tenant = escape(tenant_name)
    safe_class = escape(class_name)
    safe_url = escape(login_url)
    body_html = f"""
<p>Hello <strong>{safe_name}</strong>,</p>
<p>Your application to join <strong>{safe_tenant}</strong> has been <strong>approved</strong>.</p>
<p>You have been assigned to class: <strong>{safe_class}</strong>.</p>
<p>Log in with your registered phone number using the one-time code sent to your phone:</p>
<div style="margin:32px 0;">
  <a href="{safe_url}"
     style="background-color:{_BRAND_GOLD};color:white;padding:12px 24px;text-decoration:none;border-radius:12px;font-weight:600;display:inline-block;">
    Go to student login
  </a>
</div>
<p style="color:#666;font-size:14px;">We look forward to seeing you in class!</p>
"""
    plain = (
        f"Hello {name},\n\n"
        f"Your application to {tenant_name} has been approved.\n"
        f"Class: {class_name}\n\n"
        f"Log in with your phone number at: {login_url}"
    )
    return subject, _wrap_html("Welcome to ThinkTarteeb!", body_html), plain
