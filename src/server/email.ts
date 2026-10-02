import type { Context } from "hono";
import { connect } from "cloudflare:sockets";
import type { ServerEnv } from "./auth";

export type EmailProvider = "smtp" | "resend" | "sendgrid" | "brevo" | "postmark" | "mailchannels";

export interface EmailConfig {
  enabled: boolean;
  provider: EmailProvider;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  // SMTP settings
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  // API key for transactional email services (Resend, SendGrid, Brevo, Postmark)
  apiKey?: string;
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
  simulated?: boolean;
}

/**
 * Clean and normalize a string setting.
 */
function clean(val: unknown): string {
  if (typeof val === "string") return val.trim();
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

/**
 * Encode string to base64 safely in web/worker standards.
 */
function toBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Retrieve the active email configuration from database settings with env fallbacks.
 */
export async function getEmailConfig(c: Context<ServerEnv>): Promise<EmailConfig> {
  const env = (c.env || {}) as unknown as Record<string, string | undefined>;
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  const procEnv = proc?.env || {};

  // Fetch all settings from DB
  const dbSettings: Record<string, string> = {};
  try {
    const db = c.env.DB;
    if (db) {
      const res = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'email_%'").all<{ key: string; value: string }>();
      if (res && res.results) {
        for (const row of res.results) {
          dbSettings[row.key] = row.value;
        }
      }
    }
  } catch {
    /* fallback to env */
  }

  const getVal = (dbKey: string, envKey: string, fallback: string): string => {
    if (dbSettings[dbKey] !== undefined && dbSettings[dbKey] !== "") {
      return clean(dbSettings[dbKey]);
    }
    const envVal = env[envKey] ?? procEnv[envKey];
    if (envVal !== undefined && envVal !== "") {
      return clean(envVal);
    }
    return fallback;
  };

  const getBool = (dbKey: string, envKey: string, fallback: boolean): boolean => {
    if (dbSettings[dbKey] !== undefined && dbSettings[dbKey] !== "") {
      const v = clean(dbSettings[dbKey]).toLowerCase();
      return v === "true" || v === "1";
    }
    const envVal = env[envKey] ?? procEnv[envKey];
    if (envVal !== undefined && envVal !== "") {
      const v = clean(envVal).toLowerCase();
      return v === "true" || v === "1";
    }
    return fallback;
  };

  const enabled = getBool("email_enabled", "EMAIL_ENABLED", false);
  const provider = (getVal("email_provider", "EMAIL_PROVIDER", "smtp").toLowerCase() as EmailProvider) || "smtp";
  const fromAddress = getVal("email_from_address", "EMAIL_FROM", "noreply@openproperty.local");
  const fromName = getVal("email_from_name", "EMAIL_FROM_NAME", "OpenProperty");
  const replyTo = getVal("email_reply_to", "EMAIL_REPLY_TO", "");

  const smtpHost = getVal("email_smtp_host", "SMTP_HOST", "smtp.gmail.com");
  const smtpPortRaw = parseInt(getVal("email_smtp_port", "SMTP_PORT", "465"), 10);
  const smtpPort = Number.isFinite(smtpPortRaw) ? smtpPortRaw : 465;
  const smtpSecure = getBool("email_smtp_secure", "SMTP_SECURE", smtpPort === 465);
  const smtpUser = getVal("email_smtp_user", "SMTP_USER", "");
  const smtpPass = getVal("email_smtp_pass", "SMTP_PASS", "");
  const apiKey = getVal("email_api_key", "EMAIL_API_KEY", "");

  return {
    enabled,
    provider,
    fromAddress,
    fromName,
    replyTo: replyTo || undefined,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    apiKey,
  };
}

/**
 * Format email recipient or sender in "Name <email@example.com>" RFC format.
 */
function formatAddress(email: string, name?: string): string {
  if (name && name.trim()) {
    return `"${name.replace(/"/g, '\\"')}" <${email}>`;
  }
  return email;
}

/**
 * Generate a clean plain-text fallback from HTML.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "\n\n$1\n")
    .replace(/<p[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "• $1\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Send an email via Resend HTTP API.
 */
async function sendViaResend(cfg: EmailConfig, opts: SendEmailOptions): Promise<SendEmailResult> {
  if (!cfg.apiKey) {
    return { ok: false, error: "Resend API key is missing. Please configure it in Email Settings." };
  }

  const from = formatAddress(opts.from || cfg.fromAddress, opts.fromName || cfg.fromName);
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];

  const payload: Record<string, unknown> = {
    from,
    to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text || stripHtml(opts.html),
  };
  if (opts.replyTo || cfg.replyTo) {
    payload.reply_to = opts.replyTo || cfg.replyTo;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    let errMsg = errorText;
    try {
      const parsed = JSON.parse(errorText);
      errMsg = parsed.message || parsed.error || errorText;
    } catch {
      /* ignore */
    }
    return { ok: false, error: `Resend API error (${res.status}): ${errMsg}` };
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, messageId: data.id || `resend-${Date.now()}` };
}

/**
 * Send an email via SendGrid HTTP API.
 */
async function sendViaSendGrid(cfg: EmailConfig, opts: SendEmailOptions): Promise<SendEmailResult> {
  if (!cfg.apiKey) {
    return { ok: false, error: "SendGrid API key is missing. Please configure it in Email Settings." };
  }

  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const payload: Record<string, unknown> = {
    personalizations: [
      {
        to: to.map((e) => ({ email: e })),
      },
    ],
    from: {
      email: opts.from || cfg.fromAddress,
      name: opts.fromName || cfg.fromName,
    },
    subject: opts.subject,
    content: [
      {
        type: "text/plain",
        value: opts.text || stripHtml(opts.html),
      },
      {
        type: "text/html",
        value: opts.html,
      },
    ],
  };

  if (opts.replyTo || cfg.replyTo) {
    payload.reply_to = { email: opts.replyTo || cfg.replyTo };
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    return { ok: false, error: `SendGrid API error (${res.status}): ${errorText}` };
  }

  return { ok: true, messageId: `sg-${Date.now()}` };
}

/**
 * Send an email via Brevo (formerly Sendinblue) HTTP API.
 */
async function sendViaBrevo(cfg: EmailConfig, opts: SendEmailOptions): Promise<SendEmailResult> {
  if (!cfg.apiKey) {
    return { ok: false, error: "Brevo API key is missing. Please configure it in Email Settings." };
  }

  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const payload: Record<string, unknown> = {
    sender: {
      email: opts.from || cfg.fromAddress,
      name: opts.fromName || cfg.fromName,
    },
    to: to.map((email) => ({ email })),
    subject: opts.subject,
    htmlContent: opts.html,
    textContent: opts.text || stripHtml(opts.html),
  };

  if (opts.replyTo || cfg.replyTo) {
    payload.replyTo = { email: opts.replyTo || cfg.replyTo };
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": cfg.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    return { ok: false, error: `Brevo API error (${res.status}): ${errorText}` };
  }

  const data = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { ok: true, messageId: data.messageId || `brevo-${Date.now()}` };
}

/**
 * Send an email via Postmark HTTP API.
 */
async function sendViaPostmark(cfg: EmailConfig, opts: SendEmailOptions): Promise<SendEmailResult> {
  if (!cfg.apiKey) {
    return { ok: false, error: "Postmark Server Token is missing. Please configure it in Email Settings." };
  }

  const to = Array.isArray(opts.to) ? opts.to.join(",") : opts.to;
  const payload: Record<string, unknown> = {
    From: formatAddress(opts.from || cfg.fromAddress, opts.fromName || cfg.fromName),
    To: to,
    Subject: opts.subject,
    HtmlBody: opts.html,
    TextBody: opts.text || stripHtml(opts.html),
  };

  if (opts.replyTo || cfg.replyTo) {
    payload.ReplyTo = opts.replyTo || cfg.replyTo;
  }

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": cfg.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    return { ok: false, error: `Postmark API error (${res.status}): ${errorText}` };
  }

  const data = (await res.json().catch(() => ({}))) as { MessageID?: string };
  return { ok: true, messageId: data.MessageID || `postmark-${Date.now()}` };
}

/**
 * Send an email via Cloudflare MailChannels free transactional API.
 */
async function sendViaMailChannels(cfg: EmailConfig, opts: SendEmailOptions): Promise<SendEmailResult> {
  const to = Array.isArray(opts.to) ? opts.to : [opts.to];
  const payload: Record<string, unknown> = {
    personalizations: [
      {
        to: to.map((email) => ({ email })),
      },
    ],
    from: {
      email: opts.from || cfg.fromAddress,
      name: opts.fromName || cfg.fromName,
    },
    subject: opts.subject,
    content: [
      {
        type: "text/plain",
        value: opts.text || stripHtml(opts.html),
      },
      {
        type: "text/html",
        value: opts.html,
      },
    ],
  };

  const res = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok && res.status !== 202) {
    const errorText = await res.text().catch(() => res.statusText);
    return { ok: false, error: `MailChannels error (${res.status}): ${errorText}` };
  }

  return { ok: true, messageId: `mailchannels-${Date.now()}` };
}

/**
 * Native Socket-based SMTP Client using Cloudflare Workers `connect()` API.
 * Supports port 465 (Direct SSL/TLS) and port 587 / 25.
 */
async function sendViaSmtpSocket(cfg: EmailConfig, opts: SendEmailOptions): Promise<SendEmailResult> {
  const host = cfg.smtpHost;
  const port = cfg.smtpPort || 465;
  const user = cfg.smtpUser;
  const pass = cfg.smtpPass;

  if (!host) {
    return { ok: false, error: "SMTP Host is required. Please configure it in Email Settings." };
  }

  const from = opts.from || cfg.fromAddress;
  const toList = Array.isArray(opts.to) ? opts.to : [opts.to];
  
  // Port 465 is direct SSL/TLS (SMTPS).
  // Port 587 & 25 are submission/relay ports that connect in plaintext and upgrade via STARTTLS.
  const isDirectTls = port === 465 || (cfg.smtpSecure && port !== 587 && port !== 25);

  let socket: any;
  try {
    socket = connect(
      { hostname: host, port },
      { secureTransport: isDirectTls ? "on" : "starttls", allowHalfOpen: false }
    );
  } catch (err) {
    return {
      ok: false,
      error: `Could not connect to ${host}:${port}: ${(err as Error).message}`,
    };
  }

  let reader = socket.readable.getReader();
  let writer = socket.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const send = async (command: string) => {
    await writer.write(encoder.encode(command + "\r\n"));
  };

  let buffer = "";
  const readResponse = async (): Promise<{ code: number; text: string }> => {
    let raw = buffer;
    buffer = "";
    while (true) {
      if (raw.includes("\r\n") || raw.includes("\n")) {
        const lines = raw.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // In SMTP RFC 5321, multiline replies end ONLY with a 3-digit code followed by a SPACE (not hyphen)
          if (/^\d{3} /.test(line)) {
            const code = parseInt(line.slice(0, 3), 10);
            const consumed = lines.slice(0, i + 1).join("\n");
            buffer = lines.slice(i + 1).join("\n");
            return { code, text: consumed.trim() };
          }
        }
      }
      const { value, done } = await reader.read();
      if (done) break;
      raw += decoder.decode(value, { stream: true });
    }
    const code = parseInt(raw.trim().slice(0, 3), 10);
    return { code: Number.isFinite(code) ? code : 500, text: raw.trim() };
  };

  try {
    // 1. Read greeting banner (220)
    const banner = await readResponse();
    if (banner.code >= 400) {
      throw new Error(`SMTP banner rejected: ${banner.text}`);
    }

    // 2. Send initial EHLO
    await send("EHLO openproperty.local");
    const ehloRes = await readResponse();
    if (ehloRes.code >= 400) {
      throw new Error(`EHLO rejected: ${ehloRes.text}`);
    }

    // 3. Negotiate STARTTLS if not already direct TLS
    if (!isDirectTls && (ehloRes.text.toUpperCase().includes("STARTTLS") || port === 587)) {
      await send("STARTTLS");
      const tlsRes = await readResponse();
      if (tlsRes.code === 220) {
        try {
          writer.releaseLock();
          reader.releaseLock();
          socket = socket.startTls();
          reader = socket.readable.getReader();
          writer = socket.writable.getWriter();
          buffer = "";

          // RFC 3207: Client MUST re-issue EHLO after TLS handshake
          await send("EHLO openproperty.local");
          const secureEhlo = await readResponse();
          if (secureEhlo.code >= 400) {
            throw new Error(`Post-TLS EHLO rejected: ${secureEhlo.text}`);
          }
        } catch (tlsErr) {
          throw new Error(`STARTTLS upgrade failed: ${(tlsErr as Error).message}`);
        }
      } else {
        throw new Error(`STARTTLS rejected by server: ${tlsRes.text}`);
      }
    }

    // 4. Authenticate if username and password are provided
    if (user && pass) {
      await send("AUTH LOGIN");
      const authPrompt1 = await readResponse();
      if (authPrompt1.code !== 334) {
        throw new Error(`AUTH LOGIN rejected: ${authPrompt1.text}`);
      }

      await send(toBase64(user));
      const authPrompt2 = await readResponse();
      if (authPrompt2.code !== 334) {
        throw new Error(`Username rejected: ${authPrompt2.text}`);
      }

      await send(toBase64(pass));
      const authRes = await readResponse();
      if (authRes.code !== 235) {
        throw new Error(`Authentication failed: ${authRes.text}`);
      }
    }

    // 5. MAIL FROM
    await send(`MAIL FROM:<${from}>`);
    const mailRes = await readResponse();
    if (mailRes.code >= 400) {
      throw new Error(`MAIL FROM failed: ${mailRes.text}`);
    }

    // 6. RCPT TO for each recipient
    for (const recipient of toList) {
      await send(`RCPT TO:<${recipient}>`);
      const rcptRes = await readResponse();
      if (rcptRes.code >= 400) {
        throw new Error(`RCPT TO <${recipient}> rejected: ${rcptRes.text}`);
      }
    }

    // 7. DATA
    await send("DATA");
    const dataPrompt = await readResponse();
    if (dataPrompt.code !== 354) {
      throw new Error(`DATA prompt rejected: ${dataPrompt.text}`);
    }

    // 8. Send RFC 5322 MIME message
    const messageDate = new Date().toUTCString();
    const messageId = `<op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@openproperty.local>`;
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const rfcMessage = [
      `From: ${formatAddress(from, opts.fromName || cfg.fromName)}`,
      `To: ${toList.map((t) => formatAddress(t)).join(", ")}`,
      opts.replyTo || cfg.replyTo ? `Reply-To: ${opts.replyTo || cfg.replyTo}` : null,
      `Subject: ${opts.subject}`,
      `Date: ${messageDate}`,
      `Message-ID: ${messageId}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      "",
      opts.text || stripHtml(opts.html),
      "",
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: 7bit`,
      "",
      opts.html,
      "",
      `--${boundary}--`,
      ".",
    ]
      .filter((line) => line !== null)
      .join("\r\n");

    await send(rfcMessage);
    const msgRes = await readResponse();
    if (msgRes.code >= 400) {
      throw new Error(`Message delivery rejected: ${msgRes.text}`);
    }

    // 9. QUIT
    await send("QUIT");
    return { ok: true, messageId };
  } catch (err) {
    let errMsg = (err as Error).message || "SMTP error";
    if (errMsg.includes("Stream was cancelled")) {
      errMsg = `Connection was cancelled by server ('Stream was cancelled'). For IONOS, Gmail, or standard providers, switch to Port 465 with SSL/TLS enabled.`;
    }
    return { ok: false, error: errMsg };
  } finally {
    try {
      writer.releaseLock();
    } catch {}
    try {
      reader.releaseLock();
    } catch {}
    try {
      socket.close();
    } catch {}
  }
}

/**
 * Universal Send Email dispatcher.
 */
export async function sendEmail(
  cfg: EmailConfig,
  opts: SendEmailOptions,
  c?: Context<ServerEnv>
): Promise<SendEmailResult> {
  // If email is explicitly disabled or not configured, simulate delivery for dev
  if (!cfg.enabled) {
    const toStr = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
    console.log(`[Email Simulation (Disabled in Settings)] To: ${toStr} | Subject: "${opts.subject}"`);

    // Log to DB if available
    if (c) {
      await logEmail(c, {
        toEmail: toStr,
        subject: opts.subject,
        provider: `${cfg.provider} (simulated)`,
        status: "simulated",
      });
    }

    return {
      ok: true,
      simulated: true,
      messageId: `simulated-${Date.now()}`,
    };
  }

  let result: SendEmailResult;
  try {
    switch (cfg.provider) {
      case "resend":
        result = await sendViaResend(cfg, opts);
        break;
      case "sendgrid":
        result = await sendViaSendGrid(cfg, opts);
        break;
      case "brevo":
        result = await sendViaBrevo(cfg, opts);
        break;
      case "postmark":
        result = await sendViaPostmark(cfg, opts);
        break;
      case "mailchannels":
        result = await sendViaMailChannels(cfg, opts);
        break;
      case "smtp":
      default:
        result = await sendViaSmtpSocket(cfg, opts);
        break;
    }
  } catch (err) {
    result = {
      ok: false,
      error: (err as Error).message || "Unknown error sending email",
    };
  }

  // Log delivery attempt to DB
  if (c) {
    const toStr = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
    await logEmail(c, {
      toEmail: toStr,
      subject: opts.subject,
      provider: cfg.provider,
      status: result.ok ? "sent" : "failed",
      error: result.error,
    });
  }

  return result;
}

/**
 * Log email send attempt in database.
 */
export async function logEmail(
  c: Context<ServerEnv>,
  entry: {
    toEmail: string;
    subject: string;
    provider: string;
    status: "sent" | "failed" | "simulated";
    error?: string;
  }
): Promise<void> {
  try {
    const db = c.env.DB;
    if (db) {
      await db
        .prepare(
          `INSERT INTO email_logs (to_email, subject, provider, status, error, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`
        )
        .bind(entry.toEmail, entry.subject, entry.provider, entry.status, entry.error ?? null)
        .run();
    }
  } catch {
    /* ignore logging failure */
  }
}

// ── Email Templates ──────────────────────────────────────────────────

export interface InviteEmailParams {
  inviteeName: string;
  inviteeEmail: string;
  organizationName: string;
  role: string;
  inviterName?: string;
  inviterEmail?: string;
  appUrl: string;
}

/**
 * Render a high-aesthetic, responsive HTML email for team member invitations.
 */
export function renderInviteEmailHtml(params: InviteEmailParams): string {
  const roleTitle =
    params.role === "owner"
      ? "Organization Owner"
      : params.role === "admin"
      ? "Administrator"
      : params.role === "manager"
      ? "Property Manager"
      : params.role === "cleaner"
      ? "Turnover Cleaner"
      : "Portfolio Viewer";

  const isCleaner = params.role === "cleaner";
  const actionUrl = isCleaner && params.appUrl.includes("/organization")
    ? params.appUrl.replace(/\/organization$/, "/cleaner")
    : params.appUrl;

  const inviterText = params.inviterName
    ? `<strong>${escapeHtml(params.inviterName)}</strong>${
        params.inviterEmail ? ` (${escapeHtml(params.inviterEmail)})` : ""
      }`
    : "An organization administrator";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to join ${escapeHtml(params.organizationName)} on OpenProperty</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f5f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f5f7; padding: 40px 20px;">
    <tr>
      <td align="center">
        <!-- Main Card -->
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <!-- Top Accent Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #0284c7 0%, #4f46e5 100%); height: 8px;"></td>
          </tr>

          <!-- Header / Brand -->
          <tr>
            <td style="padding: 36px 40px 20px 40px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #f0fdf4; border-radius: 10px; width: 36px; height: 36px; text-align: center; vertical-align: middle; border: 1px solid #bbf7d0;">
                    <span style="font-size: 20px;">🏢</span>
                  </td>
                  <td style="padding-left: 12px;">
                    <span style="font-size: 18px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;">OpenProperty</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 10px 40px 36px 40px;">
              <h1 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 700; color: #0f172a; line-height: 1.3; letter-spacing: -0.02em;">
                You've been invited to join ${escapeHtml(params.organizationName)}
              </h1>

              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                Hello ${escapeHtml(params.inviteeName || "there")},
              </p>

              <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #475569;">
                ${inviterText} has invited you to collaborate on the property portfolio of <strong>${escapeHtml(
    params.organizationName
  )}</strong> on OpenProperty.
              </p>

              <!-- Role & Org Card -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 20px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding-bottom: 6px;">
                          Assigned Role
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 16px; font-weight: 700; color: #0284c7; padding-bottom: 14px;">
                          ${escapeHtml(roleTitle)}
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding-bottom: 6px;">
                          Invited Account
                        </td>
                      </tr>
                      <tr>
                        <td style="font-size: 14px; font-weight: 500; color: #1e293b; font-family: monospace;">
                          ${escapeHtml(params.inviteeEmail)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 28px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(actionUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #4f46e5 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);">
                      Accept Invitation & Sign In &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 12px 0; font-size: 13px; line-height: 1.5; color: #94a3b8;">
                If the button above does not work, copy and paste this link into your browser:
              </p>
              <p style="margin: 0; font-size: 12px; word-break: break-all; color: #64748b; font-family: monospace; background-color: #f1f5f9; padding: 10px; border-radius: 6px;">
                ${escapeHtml(actionUrl)}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px 0; font-size: 12px; color: #94a3b8;">
                This invitation was sent to <strong>${escapeHtml(params.inviteeEmail)}</strong> by ${escapeHtml(
    params.organizationName
  )}.
              </p>
              <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
                &copy; ${new Date().getFullYear()} OpenProperty &bull; Secure Real Estate Management
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Render HTML for test connection emails.
 */
export function renderTestEmailHtml(provider: string, fromAddress: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>OpenProperty Email Test</title></head>
<body style="font-family: -apple-system, sans-serif; background: #f8fafc; padding: 40px; color: #0f172a;">
  <div style="max-width: 520px; margin: auto; background: #ffffff; padding: 32px; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 2px 10px rgba(0,0,0,0.04);">
    <h2 style="margin: 0 0 12px 0; color: #0284c7;">🎉 Email Sender Test Succeeded!</h2>
    <p style="font-size: 14px; line-height: 1.6; color: #475569;">
      Your OpenProperty email configuration is working properly.
    </p>
    <div style="background: #f1f5f9; padding: 14px; border-radius: 8px; font-size: 13px; margin: 20px 0;">
      <p style="margin: 4px 0;"><strong>Active Provider:</strong> ${escapeHtml(provider.toUpperCase())}</p>
      <p style="margin: 4px 0;"><strong>Sender Address:</strong> ${escapeHtml(fromAddress)}</p>
      <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
    </div>
    <p style="font-size: 13px; color: #94a3b8; margin: 0;">
      Team member invitations and portfolio alerts will now be dispatched automatically using this service.
    </p>
  </div>
</body>
</html>`;
}

// ── Cleaning & Turnover Email Templates ──────────────────────────────

export interface CleaningEmailParams {
  cleanerName: string;
  cleanerEmail?: string;
  organizationName?: string;
  propertyName: string;
  propertyAddress?: string;
  unitName: string;
  scheduledDate: string;
  scheduledTime: string;
  nextCheckInDate?: string;
  nextCheckInTime?: string;
  lockboxCode?: string;
  checklist?: string[];
  notes?: string;
  appUrl: string;
}

/**
 * Render HTML email for when a cleaner is assigned to a turnover task.
 */
export function renderCleaningAssignmentEmailHtml(params: CleaningEmailParams): string {
  const windowText = params.nextCheckInDate
    ? `Guest departs at <strong>${escapeHtml(params.scheduledTime)}</strong>. Next guest check-in: <strong>${escapeHtml(
        params.nextCheckInDate
      )} at ${escapeHtml(params.nextCheckInTime || "15:00")}</strong>.`
    : `Guest departs at <strong>${escapeHtml(params.scheduledTime)}</strong>.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Cleaning Assignment: ${escapeHtml(params.unitName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <tr>
            <td style="background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); height: 8px;"></td>
          </tr>
          <tr>
            <td style="padding: 32px 36px 16px 36px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #f0fdfa; border-radius: 10px; width: 36px; height: 36px; text-align: center; vertical-align: middle; border: 1px solid #99f6e4;">
                    <span style="font-size: 20px;">🧹</span>
                  </td>
                  <td style="padding-left: 12px;">
                    <span style="font-size: 17px; font-weight: 700; color: #0f172a;">${escapeHtml(params.organizationName)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 36px 32px 36px;">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #0f172a;">
                New Turnover Cleaning Scheduled
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 15px; color: #475569; line-height: 1.5;">
                Hello <strong>${escapeHtml(params.cleanerName)}</strong>, you have been assigned to prepare <strong>${escapeHtml(params.unitName)}</strong> for the next arriving guest.
              </p>

              <!-- Main Task Card -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b;">
                      Unit & Property
                    </p>
                    <p style="margin: 0 0 14px 0; font-size: 16px; font-weight: 700; color: #0f172a;">
                      ${escapeHtml(params.unitName)} &bull; ${escapeHtml(params.propertyName)}
                    </p>

                    ${params.propertyAddress ? `
                    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b;">
                      Address
                    </p>
                    <p style="margin: 0 0 14px 0; font-size: 14px; color: #334155;">
                      📍 ${escapeHtml(params.propertyAddress)}
                    </p>
                    ` : ""}

                    <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b;">
                      Date & Turnover Window
                    </p>
                    <p style="margin: 0 0 14px 0; font-size: 15px; color: #0d9488; font-weight: 600;">
                      📅 ${escapeHtml(params.scheduledDate)} at ${escapeHtml(params.scheduledTime)}
                    </p>
                    <p style="margin: 0 0 14px 0; font-size: 13px; color: #64748b; line-height: 1.4;">
                      ${windowText}
                    </p>

                    ${params.lockboxCode ? `
                    <div style="background-color: #ecfdf5; border: 1px dashed #10b981; border-radius: 8px; padding: 12px 16px; margin-top: 8px;">
                      <span style="font-size: 12px; color: #047857; font-weight: 600; text-transform: uppercase;">🔑 Key Access / Lockbox Code:</span>
                      <div style="font-size: 20px; font-weight: 800; color: #065f46; letter-spacing: 0.1em; margin-top: 4px;">
                        ${escapeHtml(params.lockboxCode)}
                      </div>
                    </div>
                    ` : ""}

                    ${params.notes ? `
                    <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0;">
                      <span style="font-size: 12px; color: #64748b; font-weight: 600;">Special Instructions:</span>
                      <p style="margin: 4px 0 0 0; font-size: 13px; color: #334155; line-height: 1.4;">
                        ${escapeHtml(params.notes)}
                      </p>
                    </div>
                    ` : ""}
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(params.appUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(13, 148, 136, 0.25);">
                      Open Cleaning Checklist &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 12px; text-align: center; color: #94a3b8;">
                Tap above to view instructions, mark items complete, and notify the team when finished.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Render HTML email reminder for upcoming cleaning tasks.
 */
export function renderCleaningReminderEmailHtml(params: CleaningEmailParams): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Cleaning Reminder: ${escapeHtml(params.unitName)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05); border: 1px solid #e2e8f0;">
          <tr>
            <td style="background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); height: 8px;"></td>
          </tr>
          <tr>
            <td style="padding: 32px 36px 16px 36px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background-color: #fef3c7; border-radius: 10px; width: 36px; height: 36px; text-align: center; vertical-align: middle; border: 1px solid #fde68a;">
                    <span style="font-size: 20px;">⏰</span>
                  </td>
                  <td style="padding-left: 12px;">
                    <span style="font-size: 17px; font-weight: 700; color: #0f172a;">Turnover Reminder</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 36px 32px 36px;">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #0f172a;">
                Cleaning Due: ${escapeHtml(params.unitName)}
              </h1>
              <p style="margin: 0 0 20px 0; font-size: 15px; color: #475569; line-height: 1.5;">
                Hello <strong>${escapeHtml(params.cleanerName)}</strong>, this is a reminder for your turnover cleaning scheduled for <strong>${escapeHtml(
    params.scheduledDate
  )} at ${escapeHtml(params.scheduledTime)}</strong>.
              </p>

              <!-- Highlight Box -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fffbeb; border-radius: 12px; border: 1px solid #fef3c7; margin-bottom: 24px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 8px 0; font-size: 15px; font-weight: 700; color: #92400e;">
                      🏢 ${escapeHtml(params.unitName)} (${escapeHtml(params.propertyName)})
                    </p>
                    ${params.propertyAddress ? `<p style="margin: 0 0 10px 0; font-size: 13px; color: #b45309;">📍 ${escapeHtml(params.propertyAddress)}</p>` : ""}

                    ${params.lockboxCode ? `
                    <div style="background-color: #ffffff; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; margin-top: 10px;">
                      <div style="font-size: 12px; color: #92400e; font-weight: 600;">KEY LOCKBOX ACCESS CODE:</div>
                      <div style="font-size: 22px; font-weight: 800; color: #78350f; letter-spacing: 0.1em; margin-top: 4px;">
                        ${escapeHtml(params.lockboxCode)}
                      </div>
                    </div>
                    ` : ""}
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(params.appUrl)}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #ea580c 100%); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);">
                      Open Cleaning Task &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface CleaningCompletedEmailParams {
  managerName?: string;
  cleanerName: string;
  organizationName?: string;
  unitName: string;
  propertyName: string;
  completedAt?: string;
  completedTime?: string;
  notes?: string;
  issueReported?: string;
  appUrl: string;
}

/**
 * Render HTML notification to manager when cleaning is completed.
 */
export function renderCleaningCompletedEmailHtml(params: CleaningCompletedEmailParams): string {
  const completedDisplay = params.completedAt || params.completedTime || new Date().toLocaleString();
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Cleaning Completed: ${escapeHtml(params.unitName)}</title></head>
<body style="font-family: -apple-system, sans-serif; background: #f8fafc; padding: 32px; color: #0f172a;">
  <div style="max-width: 540px; margin: auto; background: #ffffff; padding: 32px; border-radius: 14px; border: 1px solid #e2e8f0; box-shadow: 0 2px 10px rgba(0,0,0,0.04);">
    <div style="display: inline-block; background: #ecfdf5; color: #047857; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 6px; margin-bottom: 12px;">
      ✓ READY FOR GUESTS
    </div>
    <h2 style="margin: 0 0 10px 0; color: #0f172a; font-size: 20px;">
      ${escapeHtml(params.unitName)} is Clean & Prepared!
    </h2>
    <p style="font-size: 14px; color: #475569; line-height: 1.5; margin: 0 0 16px 0;">
      <strong>${escapeHtml(params.cleanerName)}</strong> has marked the turnover cleaning as completed for <strong>${escapeHtml(
    params.unitName
  )}</strong> (${escapeHtml(params.propertyName)}).
    </p>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 13px; margin-bottom: 20px;">
      <p style="margin: 2px 0;"><strong>Completed at:</strong> ${escapeHtml(completedDisplay)}</p>
      ${params.notes ? `<p style="margin: 4px 0 0 0; color: #334155;"><strong>Cleaner Notes:</strong> ${escapeHtml(params.notes)}</p>` : ""}
    </div>

    ${params.issueReported ? `
    <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 14px; font-size: 13px; margin-bottom: 20px; color: #9f1239;">
      <strong>⚠️ Issue Reported by Cleaner:</strong>
      <p style="margin: 4px 0 0 0;">${escapeHtml(params.issueReported)}</p>
    </div>
    ` : ""}

    <div style="text-align: center; margin-top: 24px;">
      <a href="${escapeHtml(params.appUrl)}" style="background: #0f172a; color: #ffffff; padding: 10px 24px; border-radius: 8px; font-size: 13px; text-decoration: none; font-weight: 600;">
        View Unit in Dashboard
      </a>
    </div>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
