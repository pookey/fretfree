import { expect, type Page } from '@playwright/test';
import { noteName } from '../helpers';

/** D37's skills (M3-14). */
export const NECK_TRIADS = 'C5.neck-triads';
export const NECK_SEVENTHS = 'C5.neck-sevenths';

/** The skill a D37 card belongs to: 7th chords to the second stage. */
function skillOf(itemId: string): string {
  return /7/.test(itemId.replace(/^chord-tones:[^@]*@/, '')) ? NECK_SEVENTHS : NECK_TRIADS;
}

/**
 * Seed known D37 cards, due now, with their skills mastered at `guideLevel`
 * (so no new items or worked examples join), then focus a session on them.
 * A focused session serves only its skills' cards, whatever else is open.
 */
export async function startChordTones(
  page: Page,
  itemIds: readonly string[],
  guideLevel: 0 | 1 | 2 | 3,
): Promise<void> {
  const items = itemIds.map((itemId) => ({ itemId, skillId: skillOf(itemId) }));
  await page.evaluate(
    async ({ items, guideLevel }) => {
      const DAY = 86_400_000;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open('fretwork');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const tx = db.transaction(['cards', 'skillStates'], 'readwrite');
      const now = Date.now();
      for (const { itemId, skillId } of items) {
        tx.objectStore('cards').put({
          itemId,
          skillId,
          fsrs: {
            due: new Date(now - DAY),
            stability: 3,
            difficulty: 5,
            elapsed_days: 0,
            scheduled_days: 3,
            learning_steps: 0,
            reps: 3,
            lapses: 0,
            state: 2,
            last_review: new Date(now - 4 * DAY),
          },
          createdAt: new Date(now - 6 * DAY),
          lastReviewedAt: new Date(now - 4 * DAY),
        });
      }
      for (const skillId of new Set(items.map((i) => i.skillId))) {
        tx.objectStore('skillStates').put({
          skillId,
          status: 'mastered',
          guideLevel,
          rollingAccuracy: 1,
        });
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { items, guideLevel },
  );
  const query = new URLSearchParams([...new Set(items.map((i) => ['skill', i.skillId]))]);
  await page.goto(`/session?${query.toString()}`);
  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByText('Preparing your session…')).toBeHidden({ timeout: 15_000 });
}

export interface Cell {
  string: number;
  fret: number;
}

const CHROMA: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};

/** Semitones above the root, per asked tones: every note, or one degree. */
const TRIADS: Record<string, Record<string, number[]>> = {
  major: { note: [0, 4, 7], '3rd': [4] },
  minor: { note: [0, 3, 7], '♭3rd': [3] },
};

/** What a triad prompt asks ("every note of C major in frets 5–8"): frets 0–12 without a range. */
export function parseAsk(text: string): {
  semitones: number[];
  root: number;
  frets: [number, number];
} {
  const m = /every (note|3rd|♭3rd) of ([A-G])([♯♭]?) (major|minor)/.exec(text);
  const semitones = m && TRIADS[m[4]!]?.[m[1]!];
  if (!m || !semitones) throw new Error(`Not a D37 triad prompt: ${text}`);
  const accidental = m[3] === '♯' ? 1 : m[3] === '♭' ? 11 : 0;
  const root = (CHROMA[m[2]!]! + accidental) % 12;
  const f = /in frets (\d+)–(\d+)/.exec(text);
  return { semitones, root, frets: f ? [Number(f[1]), Number(f[2])] : [0, 12] };
}

/** Every cell in the frets that holds an asked tone: an answer key independent of the app. */
export function answerKey(text: string): Cell[] {
  const { semitones, root, frets } = parseAsk(text);
  const out: Cell[] = [];
  for (let fret = frets[0]; fret <= frets[1]; fret++) {
    for (let string = 1; string <= 6; string++) {
      const rel = (CHROMA[noteName(string, fret)]! - root + 12) % 12;
      if (semitones.includes(rel)) out.push({ string, fret });
    }
  }
  return out;
}
