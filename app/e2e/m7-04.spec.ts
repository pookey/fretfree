import { expect, test, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';
import {
  API_URL,
  CODE,
  COGNITO_URL,
  LINK_TOKEN,
  mockAuth,
  seedFinishedSessions,
} from './helpers/account';

// M7-04: optional email sign-in, against a mocked API and Cognito. The service
// worker is blocked so every request reaches the mocks.
test.use({ serviceWorkers: 'block' });

const EMAIL = 'learner@example.com';

const panel = (page: Page, name: string) => page.getByRole('region', { name });

async function requestCode(page: Page, email = EMAIL) {
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

async function typeCode(page: Page, code: string) {
  await page.getByLabel('6-digit code').fill(code);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Every origin the page talked to, to show nothing goes anywhere else (no analytics). */
function watchOrigins(page: Page): Set<string> {
  const origins = new Set<string>();
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.protocol.startsWith('http')) origins.add(url.origin);
  });
  return origins;
}

test.describe('M7-04 save your progress', () => {
  test('signs in with the emailed code, and signing out keeps local progress @smoke', async ({
    page,
  }) => {
    const auth = await mockAuth(page);
    const origins = watchOrigins(page);
    await freshStart(page, '/progress');

    const offer = panel(page, 'Save your progress across devices');
    await expect(offer).toContainText('It’s optional');
    await requestCode(page);
    expect(auth.emails).toEqual([EMAIL]);
    await expect(
      page.getByRole('status').filter({ hasText: 'We sent a code and a link' }),
    ).toContainText(EMAIL);
    await expect(page.getByLabel('6-digit code')).toBeFocused();
    await expect(offer).toContainText('Using FretFree from your Home Screen? Type the code here');
    await expect(
      page.getByRole('button', { name: /Send a new email \(\d+ seconds\)/ }),
    ).toBeDisabled();
    await expectNoHorizontalOverflow(page);

    await typeCode(page, CODE);
    const account = panel(page, 'Your account');
    await expect(account).toContainText(`Signed in as ${EMAIL}.`);

    await page.reload();
    await expect(panel(page, 'Your account')).toContainText(`Signed in as ${EMAIL}.`);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(panel(page, 'Save your progress across devices')).toBeVisible();
    // Local data stays: the app opens on Today, not onboarding.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();

    const app = new URL(page.url()).origin;
    expect([...origins].sort()).toEqual([app, API_URL, new URL(COGNITO_URL).origin].sort());
  });

  test('explains a wrong code, then points to the link once the tries run out', async ({
    page,
  }) => {
    const auth = await mockAuth(page);
    await freshStart(page, '/progress');
    await requestCode(page);

    await typeCode(page, '000000');
    await expect(page.getByRole('alert')).toContainText('That code didn’t work');
    await expect(page.getByRole('alert')).toContainText('each code works once');
    await expect(page.getByRole('alert')).toContainText('4 tries left');
    for (let i = 0; i < 3; i++) await typeCode(page, '000000');
    await expect(page.getByRole('alert')).toContainText('1 try left');
    await typeCode(page, '000000');
    await expect(page.getByRole('alert')).toContainText('Open the link in the same email instead');
    await expect(page.getByLabel('6-digit code')).toBeDisabled();
    expect(auth.answers).toHaveLength(5);

    // The emailed link still works: link answers spend no code attempt.
    await page.goto(`/account/verify#email=${encodeURIComponent(EMAIL)}&token=${LINK_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'You’re signed in' })).toBeVisible();
  });

  test('says when a code has expired', async ({ page }) => {
    await mockAuth(page);
    await freshStart(page, '/progress');
    await page.evaluate((email) => {
      const sentAt = Date.now() - 16 * 60_000;
      localStorage.setItem(
        'fretwork.account.pending',
        JSON.stringify({ email, sentAt, expiresAt: sentAt + 15 * 60_000, codeAnswers: 0 }),
      );
    }, EMAIL);
    await page.reload();
    await expect(panel(page, 'Save your progress across devices')).toContainText(
      'That code has expired',
    );
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await page.getByRole('button', { name: 'Send a new email' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'We sent a new email' })).toBeVisible();
    await typeCode(page, CODE);
    await expect(panel(page, 'Your account')).toBeVisible();
  });

  test('maps a rate limit to friendly copy and holds the button', async ({ page }) => {
    const auth = await mockAuth(page);
    await freshStart(page, '/progress');
    auth.rateLimitNext(1800);
    await page.getByLabel('Email address').fill(EMAIL);
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await expect(page.getByRole('alert')).toContainText('Try again in 30 minutes');
    await expect(
      page.getByRole('button', { name: /Email me a code \(30 minutes\)/ }),
    ).toBeDisabled();
  });

  test('the emailed link signs this browser in and leaves no token in history', async ({
    page,
  }) => {
    const auth = await mockAuth(page);
    auth.emailed(EMAIL);
    await freshStart(page, '/progress');
    await page.goto(`/account/verify#email=${encodeURIComponent(EMAIL)}&token=${LINK_TOKEN}`);
    await expect(page.getByRole('heading', { name: 'You’re signed in' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText(`This browser is signed in as ${EMAIL}.`);
    await expect(page.getByRole('status')).toContainText(
      'To sign in to FretFree on your Home Screen',
    );
    expect(new URL(page.url()).hash).toBe('');
    await expectNoHorizontalOverflow(page);

    // Back goes to Progress, not to a URL holding the token.
    await page.goBack();
    await expect(page).toHaveURL(/\/progress$/);
    await expect(panel(page, 'Your account')).toContainText(`Signed in as ${EMAIL}.`);
  });

  test('a used link explains itself and offers a new email', async ({ page }) => {
    const auth = await mockAuth(page);
    auth.emailed(EMAIL);
    await freshStart(page, '/progress');
    const link = `/account/verify#email=${encodeURIComponent(EMAIL)}&token=${LINK_TOKEN}`;
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'You’re signed in' })).toBeVisible();
    await page.evaluate(() => localStorage.removeItem('fretwork.account'));
    // Leave first: a fragment-only change to the same path wouldn't load the page again.
    await page.goto('/progress');
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'That link didn’t work' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('already been used or has expired');
    await expect(page.getByLabel('Email address')).toHaveValue(EMAIL);
  });

  test('Today offers it gently after a few sessions, and "Not now" hides it', async ({ page }) => {
    await mockAuth(page);
    await freshStart(page);
    const card = page.getByRole('region', { name: 'Save your progress across devices' });
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(card).toHaveCount(0);

    await seedFinishedSessions(page, 3);
    await page.reload();
    await expect(card).toContainText('It’s optional');
    const box = await card.getByRole('link', { name: 'Save my progress' }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await card.getByRole('link', { name: 'Save my progress' }).click();
    await expect(page).toHaveURL(/\/progress#account$/);
    await expect(page.getByLabel('Email address')).toBeFocused();

    await page.goto('/');
    await card.getByRole('button', { name: 'Not now' }).click();
    await expect(card).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await expect(card).toHaveCount(0);
  });

  test('lays the panel out beside its explanation on a wide iPad', async ({ page }, info) => {
    test.skip(info.project.name !== 'ipad-landscape', 'regular-wide layout');
    await mockAuth(page);
    await freshStart(page, '/progress');
    const copy = await panel(page, 'Save your progress across devices')
      .getByText('Sign in with your email')
      .boundingBox();
    const field = await page.getByLabel('Email address').boundingBox();
    expect(field!.x).toBeGreaterThan(copy!.x + copy!.width - 1);
    const button = await page.getByRole('button', { name: 'Email me a code' }).boundingBox();
    expect(button!.height).toBeGreaterThanOrEqual(44);
    expect(field!.height).toBeGreaterThanOrEqual(44);
  });
});
