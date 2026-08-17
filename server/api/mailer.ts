import type { Env } from './types';

/**
 * Sends the one email this server sends: the sign-in link.
 *
 * Two providers, because Cloudflare's own Email Sending is **Workers Paid only**
 * ($5/mo, and it needs a domain you own onboarded to Cloudflare). That is the
 * better long-term answer and the worse starting one, so the default here is an
 * HTTP provider with a real free tier and single-sender verification — no
 * domain, no card, no second deployment.
 *
 * Deliberately not Nodemailer: it is an SMTP *client library*, not a service, and
 * it cannot run here at all — Workers provide no `node:net`/`node:tls`, and
 * outbound port 25 is blocked. Running it would mean a second Node host beside
 * this Worker, which is a lot of moving parts for one email.
 *
 * Which provider is used is decided by what is configured, so switching is
 * `wrangler secret put` and a redeploy — never a code change.
 */

/** Neither provider is configured — the deploy isn't finished. */
export class MailNotConfiguredError extends Error {
  code = 'E_MAIL_NOT_CONFIGURED';
  constructor() {
    super('No email provider is configured: set BREVO_API_KEY, or bind Cloudflare Email Sending.');
    this.name = 'MailNotConfiguredError';
  }
}

/** The provider rejected the send. `code` is passed through to the client. */
export class MailSendError extends Error {
  code: string;
  constructor(message: string, code = 'E_MAIL_SEND_FAILED') {
    super(message);
    this.name = 'MailSendError';
    this.code = code;
  }
}

export type Mail = { to: string; subject: string; html: string; text: string };

export async function sendMail(env: Env, mail: Mail): Promise<void> {
  if (env.BREVO_API_KEY) return sendViaBrevo(env, mail);
  if (env.EMAIL) return sendViaCloudflare(env, mail);
  throw new MailNotConfiguredError();
}

/** Which provider a deploy will use — surfaced by `/health` so a misconfigured deploy is visible. */
export const mailProvider = (env: Env): 'brevo' | 'cloudflare' | 'none' =>
  env.BREVO_API_KEY ? 'brevo' : env.EMAIL ? 'cloudflare' : 'none';

/**
 * Brevo's transactional endpoint. Free tier: 300 emails/day, no card, and the
 * sender address is verified by clicking a link in that inbox — which is what
 * makes this work without owning a domain.
 */
async function sendViaBrevo(env: Env, mail: Mail): Promise<void> {
  let response: Response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY as string,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: env.EMAIL_FROM, name: 'BudgetSplit' },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: mail.html,
        textContent: mail.text,
      }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new MailSendError(`Could not reach the email provider: ${detail}`, 'E_MAIL_UNREACHABLE');
  }

  if (response.ok) return;

  const body = await response.text().catch(() => '');
  // A 401 is NOT always a bad key: Brevo also 401s when the calling IP isn't on
  // its "authorised IPs" list, which a Worker can never satisfy — the edge IP
  // changes per request. Passing the provider's own sentence through is the
  // difference between fixing it in a minute and hunting the wrong problem, so
  // the generic "bad key" message is only used when there's nothing better.
  if (response.status === 401) {
    const detail = extractProviderMessage(body);
    throw new MailSendError(
      detail ?? 'The email provider rejected the API key.',
      detail?.includes('IP address') ? 'E_MAIL_IP_BLOCKED' : 'E_MAIL_KEY_INVALID',
    );
  }
  // Brevo answers 400 with `code: "invalid_parameter"` when the sender address
  // has not been verified — the single most likely first-deploy failure.
  if (response.status === 400 && body.includes('sender')) {
    throw new MailSendError(
      `The sender address ${env.EMAIL_FROM} is not verified with the email provider.`,
      'E_SENDER_NOT_VERIFIED',
    );
  }
  throw new MailSendError(`Email provider returned ${response.status}: ${body.slice(0, 200)}`);
}

/** Providers answer `{message, code}`; fall back to the raw body if not. */
function extractProviderMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    return typeof parsed.message === 'string' && parsed.message ? parsed.message : null;
  } catch {
    return body.trim() ? body.slice(0, 200) : null;
  }
}

/** Cloudflare Email Sending — Workers Paid, and the domain must be onboarded. */
async function sendViaCloudflare(env: Env, mail: Mail): Promise<void> {
  try {
    await (env.EMAIL as SendEmail).send({
      to: mail.to,
      from: { email: env.EMAIL_FROM, name: 'BudgetSplit' },
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    const detail = err instanceof Error ? err.message : String(err);
    throw new MailSendError(detail, code ?? 'E_MAIL_SEND_FAILED');
  }
}
