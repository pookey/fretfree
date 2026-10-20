export interface SignInEmail {
  subject: string;
  text: string;
  html: string;
}

export interface SignInEmailInput {
  /** The product name as the learner sees it. Config, never hardcoded: the brand changes. */
  brand: string;
  code: string;
  link: string;
  minutes: number;
}

const escapeHtml = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/**
 * One email, two ways in. The code comes first: an installed iPad app can't open
 * email links (they open in Safari, which has its own storage), so typing the
 * code is how the home-screen app signs in. The link signs in whichever browser
 * it opens in. The code is in the subject so a notification shows it.
 */
export function signInEmail({ brand, code, link, minutes }: SignInEmailInput): SignInEmail {
  const subject = `${code} is your ${brand} sign-in code`;
  const text = [
    `Your ${brand} sign-in code is ${code}`,
    '',
    `Type it into ${brand} to sign in, or open this link on the device you want to sign in on:`,
    link,
    '',
    `The code and link work once and expire in ${minutes} minutes.`,
    `If you didn't ask to sign in, you can ignore this email.`,
  ].join('\n');
  const b = escapeHtml(brand);
  const html = `<!doctype html>
<html lang="en"><body style="font-family:-apple-system,system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">
<p>Your ${b} sign-in code is</p>
<p style="font-size:32px;font-weight:700;letter-spacing:0.15em;margin:8px 0 16px">${escapeHtml(code)}</p>
<p>Type it into ${b} to sign in, or open this link on the device you want to sign in on:</p>
<p><a href="${escapeHtml(link)}">Sign in to ${b}</a></p>
<p style="color:#555">The code and link work once and expire in ${minutes} minutes. If you didn't ask to sign in, you can ignore this email.</p>
</body></html>`;
  return { subject, text, html };
}

/** `/account/verify` reads the address and token from the fragment, which never reaches a server log. */
export function signInLink(siteUrl: string, email: string, token: string): string {
  const fragment = new URLSearchParams({ email, token }).toString();
  return `${siteUrl.replace(/\/$/, '')}/account/verify#${fragment}`;
}
