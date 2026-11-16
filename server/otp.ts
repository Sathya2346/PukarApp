import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { db } from './db';

export interface OtpDispatchResult {
  success: boolean;
  expiresInSeconds: number;
  deliveryMode: 'smtp' | 'sandbox';
  devOtpHint?: string;
  cooldownSecondsRemaining?: number;
  error?: string;
}

function getSettingNumber(key: string, fallback: number): number {
  const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!row) return fallback;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function issueEmailOtp(params: {
  email: string;
  role: string;
  purpose: 'login' | 'register' | 'reset_password';
}): Promise<OtpDispatchResult> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const nowMs = Date.now();

  // Check 20s resend cooldown to prevent abuse while staying responsive
  const recent = db
    .prepare(
      'SELECT created_at FROM otp_tokens WHERE email = ? AND role = ? AND consumed = 0 ORDER BY id DESC LIMIT 1'
    )
    .get(normalizedEmail, params.role) as { created_at: number } | undefined;

  if (recent && nowMs - recent.created_at < 15_000) {
    const remaining = Math.ceil((15_000 - (nowMs - recent.created_at)) / 1000);
    return {
      success: false,
      expiresInSeconds: 0,
      deliveryMode: 'sandbox',
      cooldownSecondsRemaining: remaining,
      error: `Please wait ${remaining}s before requesting another OTP.`,
    };
  }

  // Invalidate older unconsumed OTPs for same email+role
  db.prepare('UPDATE otp_tokens SET consumed = 1 WHERE email = ? AND role = ? AND consumed = 0').run(
    normalizedEmail,
    params.role
  );

  const expiryMinutes = getSettingNumber('otp_expiry_minutes', 5);
  const expiresAtMs = nowMs + expiryMinutes * 60 * 1000;
  const code = String(crypto.randomInt(100000, 999999));

  db.prepare(
    'INSERT INTO otp_tokens (email, role, purpose, code, expires_at, attempts, consumed, created_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?)'
  ).run(normalizedEmail, params.role, params.purpose, code, expiresAtMs, nowMs);

  // Attempt SMTP email delivery if configured
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || smtpUser,
        to: normalizedEmail,
        subject: 'Makkal Pugar Seyali — Email OTP Verification Code',
        text: `Your Email OTP verification code is ${code}. Valid for ${expiryMinutes} minutes. Do not share this code.`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 12px;">
            <h2 style="color: #b91c1c; margin-top: 0;">மக்கள் புகார் செயலி | Makkal Pugar Seyali</h2>
            <p>Your 6-digit Email OTP verification code for <strong>${params.role.toUpperCase()}</strong> access is:</p>
            <div style="font-size: 28px; font-weight: 700; letter-spacing: 6px; padding: 16px; background: #fef2f2; color: #991b1b; text-align: center; border-radius: 8px;">
              ${code}
            </div>
            <p style="color: #6b7280; font-size: 13px; margin-top: 16px;">This code expires in ${expiryMinutes} minutes.</p>
          </div>
        `,
      });

      return {
        success: true,
        expiresInSeconds: expiryMinutes * 60,
        deliveryMode: 'smtp',
      };
    } catch (err) {
      console.error('SMTP send failed, falling back to sandbox preview:', err);
    }
  }

  return {
    success: true,
    expiresInSeconds: expiryMinutes * 60,
    deliveryMode: 'sandbox',
    devOtpHint: code,
  };
}
