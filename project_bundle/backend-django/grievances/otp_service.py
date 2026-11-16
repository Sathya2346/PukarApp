import secrets
from datetime import timedelta
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone
from .models import EmailOtpToken


def dispatch_email_otp(email: str, role: str, purpose: str = "login") -> EmailOtpToken:
    EmailOtpToken.objects.filter(email=email, role=role, consumed=False).update(consumed=True)
    code = f"{secrets.randbelow(900000) + 100000}"
    token = EmailOtpToken.objects.create(
        email=email.strip().lower(),
        role=role,
        purpose=purpose,
        code=code,
        expires_at=timezone.now() + timedelta(minutes=5),
    )

    if settings.EMAIL_HOST_USER:
        send_mail(
            subject="Makkal Pugar Seyali — Email OTP Verification",
            message=f"Your 6-digit Email OTP verification code is {code}. Valid for 5 minutes.",
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
        )
    return token
