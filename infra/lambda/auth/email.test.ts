import { describe, expect, it } from 'vitest';
import { signInEmail, signInLink } from './email';

describe('signInEmail', () => {
  const mail = signInEmail({
    brand: 'Fret Free',
    code: '042137',
    link: 'https://fretfree.app/account/verify#email=a%40b.co&token=t',
    minutes: 15,
  });

  it('carries both the code and the link, in text and HTML', () => {
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain('042137');
      expect(body).toContain('15 minutes');
    }
    expect(mail.text).toContain('https://fretfree.app/account/verify#email=a%40b.co&token=t');
    expect(mail.html).toContain(
      'href="https://fretfree.app/account/verify#email=a%40b.co&amp;token=t"',
    );
  });

  it('puts the code in the subject, so a notification shows it', () => {
    expect(mail.subject).toBe('042137 is your Fret Free sign-in code');
  });

  it('names the brand it is given, never a hardcoded one', () => {
    const other = signInEmail({ brand: 'Other <App>', code: '1', link: 'x', minutes: 1 });
    expect(other.subject).toContain('Other <App>');
    expect(other.html).toContain('Other &lt;App&gt;');
    expect(other.html).not.toContain('<App>');
    for (const body of [mail.subject, mail.text, mail.html, other.text, other.html]) {
      expect(body).not.toMatch(/fretwork/i);
    }
  });
});

describe('signInLink', () => {
  it('lands on /account/verify with the address and token in the fragment', () => {
    const link = signInLink('https://fretfree.app/', 'ada+gtr@example.com', 'abc_-1');
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe('https://fretfree.app/account/verify');
    expect(url.search).toBe('');
    const params = new URLSearchParams(url.hash.slice(1));
    expect(params.get('email')).toBe('ada+gtr@example.com');
    expect(params.get('token')).toBe('abc_-1');
  });
});
