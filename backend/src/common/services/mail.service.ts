import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * Transactional email over SMTP (nodemailer).
 *
 * Config is read from the environment following the project convention
 * (direct process.env with sensible fallbacks):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, SMTP_FROM
 *
 * The service is intentionally **config-gated**: if SMTP_HOST is not set the
 * transport is never created and send() becomes a logged no-op. This lets the
 * forgot-password feature ship and be exercised before the gov SMTP relay /
 * DKIM records are provisioned — nothing throws, mail simply isn't delivered.
 * `isConfigured()` lets callers branch (e.g. dev logging of the reset link).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly from: string;

  constructor() {
    const host = process.env.SMTP_HOST;
    this.from = process.env.SMTP_FROM || 'BizData <no-reply@bizdata.local>';
    if (!host) {
      this.logger.warn(
        'SMTP_HOST not set — email sending is disabled (password-reset links will not be delivered). Set SMTP_* to enable.',
      );
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT) || 587,
      // SMTP_SECURE=true for implicit TLS (port 465); otherwise STARTTLS on 587.
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
    this.logger.log(`Email enabled — SMTP host ${host}, from "${this.from}".`);
  }

  isConfigured(): boolean {
    return this.transporter !== null;
  }

  /** Send an email. No-op (warn) when SMTP is not configured. Never throws. */
  async send(to: string, subject: string, html: string, text?: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Email not sent (SMTP disabled): "${subject}" → ${to}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html, text });
    } catch (e) {
      // Never let a mail failure break the request flow — the caller returns a
      // generic success either way (no account enumeration). Log for ops.
      this.logger.error(`Failed to send "${subject}" to ${to}: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** Compose + send a password-reset link. */
  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const subject = 'Reset your BizData password';
    const text =
      `We received a request to reset your BizData password.\n\n` +
      `Open this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\n` +
      `If you didn't request this, you can ignore this email — your password stays unchanged.`;
    const html =
      `<p>We received a request to reset your BizData password.</p>` +
      `<p><a href="${resetUrl}">Choose a new password</a> (valid for 1 hour).</p>` +
      `<p style="color:#64748b;font-size:12px">If you didn't request this, you can ignore this email — your password stays unchanged.</p>`;
    await this.send(to, subject, html, text);
  }
}
