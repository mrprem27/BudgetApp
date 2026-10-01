/** The sign-in email, as HTML and as plain text. */

import {
  MAGIC_LINK_TTL_MS,
} from '../utils/lib';

export const MINUTES = Math.round(MAGIC_LINK_TTL_MS / 60000);

/** The one line Gmail shows next to the subject. Wasted if left to chance. */
export const PREHEADER = `Tap to sign in. The link works once and expires in ${MINUTES} minutes.`;

// Lives here, not in `index.ts`: every named export of a Worker's MAIN module is treated as an
// entrypoint, and a string there stops the runtime from starting at all.
export const SIGN_IN_SUBJECT = 'Sign in to BudgetSplit';

/**
 * The sign-in email.
 *
 * Written to the constraints email actually has, not the ones a web page has:
 * tables rather than flexbox, inline styles rather than a stylesheet, a
 * `bgcolor` attribute beside every background colour so Outlook renders the
 * button, and no images — an image-based header would break the moment a client
 * blocks remote content, which most do by default.
 *
 * The token is printed as well as linked because the button only works on the
 * phone that has the app; opening the mail on a laptop otherwise dead-ends.
 */
export function signInHtml(openUrl: string, token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${SIGN_IN_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;background-color:#F1F5F4;">
<div style="display:none;font-size:1px;color:#F1F5F4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${PREHEADER}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F1F5F4" style="background-color:#F1F5F4;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;background-color:#FFFFFF;border-radius:16px;border:1px solid #E3EAE9;">
        <tr>
          <td style="padding:32px 28px 8px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <div style="font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#15A89D;">BudgetSplit</div>
            <h1 style="margin:12px 0 0 0;font-size:24px;line-height:32px;font-weight:600;color:#0A0F11;">Sign in</h1>
            <p style="margin:12px 0 0 0;font-size:15px;line-height:23px;color:#4A5A58;">
              Tap the button below on the phone where BudgetSplit is installed, and you're in. No password to remember.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 28px 8px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td align="center" bgcolor="#20C4B8" style="background-color:#20C4B8;border-radius:12px;">
                  <a href="${openUrl}" style="display:block;padding:15px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#04211F;text-decoration:none;">Sign in to BudgetSplit</a>
                </td>
              </tr>
            </table>
            <p style="margin:12px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#7C918E;text-align:center;">
              Works once &middot; expires in ${MINUTES} minutes
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 0 28px;">
            <div style="height:1px;background-color:#E3EAE9;line-height:1px;font-size:0;">&nbsp;</div>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 32px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
            <p style="margin:0;font-size:14px;line-height:21px;color:#4A5A58;">
              <strong style="color:#0A0F11;">Reading this on a computer?</strong><br>
              The button only works on your phone. Open BudgetSplit &rarr; Settings &rarr; Account, and paste this code instead:
            </p>
            <div style="margin:12px 0 0 0;padding:12px 14px;background-color:#F1F5F4;border-radius:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:19px;color:#0A0F11;word-break:break-all;">${token}</div>
          </td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:460px;">
        <tr>
          <td style="padding:20px 28px 0 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:19px;color:#7C918E;text-align:center;">
            Didn't ask to sign in? Ignore this email &mdash; nothing happens until the link is used.
            <br><br>
            Your account keeps a copy of your BudgetSplit data, so signing in on a new phone brings it all back.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function signInText(openUrl: string, token: string): string {
  return `Sign in to BudgetSplit\n\n`
    + `Tap this link on the phone where BudgetSplit is installed:\n${openUrl}\n\n`
    + `It works once and expires in ${MINUTES} minutes.\n\n`
    + `Reading this on a computer? The link only works on your phone. Open\n`
    + `BudgetSplit > Settings > Account and paste this code instead:\n\n${token}\n\n`
    + `Didn't ask to sign in? Ignore this email - nothing happens until the link\n`
    + `is used.\n`;
}
