import { expect, test, type Page } from '@playwright/test';
import { freshStart } from './helpers';
import { audioLevel, tapAudioOutput } from './helpers/audio';
import { fakeMic } from './helpers/mic-device';

// M4-14: sound through iOS silent mode. iOS gives Web Audio the "ambient"
// session, which silent mode mutes. A tap asks for the "playback" session and,
// where Safari ignores that (the user's iPhone did), plays a looping silent
// <audio> track instead. While the mic listens, capture has play-and-record.

interface SessionLog {
  types: string[];
  tracks: { src: string; loop: boolean }[];
}

/**
 * A `navigator.audioSession` whose setter takes, or is ignored as on the
 * user's iPhone, plus a log of every silent track the page starts.
 */
async function stubSession(page: Page, sticks: boolean): Promise<void> {
  await page.addInitScript((sticks: boolean) => {
    const log: SessionLog = { types: [], tracks: [] };
    (window as unknown as { __session: SessionLog }).__session = log;
    let type = 'auto';
    Object.defineProperty(navigator, 'audioSession', {
      configurable: true,
      value: {
        get type() {
          return type;
        },
        set type(t: string) {
          log.types.push(t);
          if (sticks) type = t;
        },
      },
    });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      log.tracks.push({ src: this.src.slice(0, 22), loop: this.loop });
      return play.call(this).catch(() => undefined);
    };
  }, sticks);
}

const session = (page: Page) =>
  page.evaluate(() => ({
    type: (navigator as unknown as { audioSession: { type: string } }).audioSession.type,
    ...(window as unknown as { __session: SessionLog }).__session,
  }));

const sound = (page: Page) => page.getByRole('main').getByRole('group', { name: 'Sound' });
const micCard = (page: Page) => page.getByRole('group', { name: 'Mic mode' });

async function playTestNote(page: Page) {
  await sound(page).getByRole('button', { name: 'Play a test note' }).click();
  await expect
    .poll(() => audioLevel(page), { timeout: 10_000, intervals: [50] })
    .toBeGreaterThan(0.01);
}

test.describe('M4-14 sound through iOS silent mode', () => {
  test('a tap asks for the playback session @smoke', async ({ page }) => {
    await stubSession(page, true);
    await tapAudioOutput(page);
    await freshStart(page, '/settings');
    await playTestNote(page);
    const s = await session(page);
    expect(s.type).toBe('playback');
    expect(s.tracks).toEqual([]);
  });

  test('where the session setting is ignored, a silent track plays instead', async ({ page }) => {
    await stubSession(page, false);
    await tapAudioOutput(page);
    await freshStart(page, '/settings');
    await playTestNote(page);
    const s = await session(page);
    expect(s.types).toContain('playback');
    expect(s.type).toBe('auto');
    expect(s.tracks.length).toBeGreaterThan(0);
    expect(s.tracks[0]).toEqual({ src: 'data:audio/wav;base64,', loop: true });
  });

  test('the mic holds play-and-record while it listens, then playback comes back', async ({
    page,
  }) => {
    await stubSession(page, true);
    await fakeMic(page, { kind: 'tone', frequency: 196 });
    await freshStart(page, '/settings');
    await micCard(page).getByRole('checkbox', { name: 'Mic mode' }).click();
    await expect(micCard(page).getByTestId('mic-status')).toContainText('Heard G3.', {
      timeout: 10_000,
    });
    expect((await session(page)).type).toBe('play-and-record');
    await micCard(page).getByRole('button', { name: 'Stop listening' }).click();
    await expect(micCard(page).getByRole('button', { name: 'Check the microphone' })).toBeVisible();
    await expect.poll(async () => (await session(page)).type).toBe('playback');
  });
});
