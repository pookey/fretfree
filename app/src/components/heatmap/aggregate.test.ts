import { describe, expect, it } from 'vitest';
import { Rating } from 'ts-fsrs';
import { ENGINE_CONFIG } from '../../engine/config';
import type { CardRecord, ReviewLogRecord } from '../../engine/model';
import { createScheduler } from '../../engine/scheduler';
import { DROP_D_TUNING } from '../../theory';
import {
  bandLabels,
  buildHeatmap,
  cellSummary,
  forecastByString,
  formatDays,
  formatDue,
  formatPercent,
  formatSeconds,
  forecastSentence,
  itemPositions,
  itemString,
  stabilityBand,
  type HeatCell,
} from './aggregate';

const NOW = new Date('2026-10-18T12:00:00Z');
const DAY = 86_400_000;
const scheduler = createScheduler({ enableFuzz: false });
const retrievability = scheduler.retrievability;
const TARGETS = { targetMs: 2700, fluentTargetMs: 1700 };
const RANGE = { from: 0, to: 15 };

/** A card last reviewed `daysAgo` with the given stability. */
function known(itemId: string, stabilityDays: number, daysAgo = 0): CardRecord {
  const at = new Date(NOW.getTime() - daysAgo * DAY);
  return scheduler.seedKnownCard({ id: itemId, skillId: 'test' }, at, stabilityDays);
}

function log(itemId: string, responseMs: number, correct = true, minutesAgo = 0): ReviewLogRecord {
  return {
    itemId,
    skillId: 'test',
    drillType: 'name-the-note',
    correct,
    responseMs,
    rating: correct ? Rating.Good : Rating.Again,
    hintUsed: false,
    answerGiven: 'E',
    at: new Date(NOW.getTime() - minutesAgo * 60_000),
  };
}

function cellAt(cells: HeatCell[], string: number, fret: number): HeatCell {
  const cell = cells.find((c) => c.string === string && c.fret === fret);
  if (!cell) throw new Error(`no cell s${string}f${fret}`);
  return cell;
}

function heatmap(cards: CardRecord[], logs: ReviewLogRecord[] = []) {
  return buildHeatmap({
    cards,
    logs,
    fretRange: RANGE,
    targets: TARGETS,
    now: NOW,
    retrievability,
  });
}

describe('itemPositions', () => {
  it('maps a position→name item to its cell', () => {
    expect(itemPositions('note@s5f7')).toEqual([{ string: 5, fret: 7 }]);
  });

  it('maps a name→position item to every match on its string within frets 0–12', () => {
    expect(itemPositions('find:E@s6')).toEqual([
      { string: 6, fret: 0 },
      { string: 6, fret: 12 },
    ]);
    expect(itemPositions('find:G@s5')).toEqual([{ string: 5, fret: 10 }]);
    expect(itemPositions('find:Bb@s1')).toEqual([{ string: 1, fret: 6 }]);
  });

  it('follows the tuning', () => {
    expect(itemPositions('find:D@s6', DROP_D_TUNING)).toEqual([
      { string: 6, fret: 0 },
      { string: 6, fret: 12 },
    ]);
  });

  it('ignores items that are not about a neck position, or off this neck', () => {
    expect(itemPositions('marker:f7')).toEqual([]);
    expect(itemPositions('step:+1@E')).toEqual([]);
    expect(itemPositions('nonsense')).toEqual([]);
    expect(itemPositions('note@s7f3')).toEqual([]);
    expect(itemPositions('find:E@s7')).toEqual([]);
  });
});

describe('itemString', () => {
  it('names the string of neck items only', () => {
    expect(itemString('note@s5f7')).toBe(5);
    expect(itemString('find:G@s3')).toBe(3);
    expect(itemString('letter:+1@G')).toBeNull();
  });
});

describe('stability bands', () => {
  const bounds = ENGINE_CONFIG.heatmap.stabilityBandsDays;

  it('puts a stability in the first band whose upper bound it is under', () => {
    expect(stabilityBand(0.2, bounds)).toBe(0);
    expect(stabilityBand(1, bounds)).toBe(1);
    expect(stabilityBand(6.9, bounds)).toBe(1);
    expect(stabilityBand(7, bounds)).toBe(2);
    expect(stabilityBand(30, bounds)).toBe(3);
    expect(stabilityBand(90, bounds)).toBe(4);
    expect(stabilityBand(400, bounds)).toBe(4);
  });

  it('starts the mastery-level band at the mastery stability threshold', () => {
    expect(bounds).toContain(ENGINE_CONFIG.mastery.stabilityDays);
  });

  it('labels every band for the legend', () => {
    expect(bandLabels(bounds)).toEqual([
      'Under 1 day',
      '1–7 days',
      '7–21 days',
      '21–90 days',
      '90 days or more',
    ]);
    expect(bandLabels([2])).toEqual(['Under 2 days', '2 days or more']);
  });
});

describe('buildHeatmap', () => {
  it('has one cell per string and fret in range, empty when nothing is practised', () => {
    const cells = heatmap([]);
    expect(cells).toHaveLength(6 * 16);
    expect(cells.every((c) => c.band === null && c.stabilityDays === null)).toBe(true);
    expect(cellAt(cells, 6, 15)).toMatchObject({
      reviews: 0,
      correct: 0,
      medianMs: null,
      slow: false,
      recallNow: null,
      recallForecast: null,
      nextDue: null,
    });
  });

  it('colours a cell by its stability', () => {
    const cells = heatmap([known('note@s5f7', 12), known('note@s6f3', 0.5)]);
    expect(cellAt(cells, 5, 7)).toMatchObject({ stabilityDays: 12, band: 2 });
    expect(cellAt(cells, 6, 3)).toMatchObject({ stabilityDays: 0.5, band: 0 });
    expect(cellAt(cells, 5, 8).band).toBeNull();
  });

  it('leaves new, never-reviewed cards out', () => {
    const fresh = scheduler.newCard({ id: 'note@s5f7', skillId: 'test' }, NOW);
    expect(cellAt(heatmap([fresh]), 5, 7).band).toBeNull();
  });

  it('takes the weakest practised direction of a cell', () => {
    // note@s6f12 (E) and find:E@s6 (frets 0 and 12) both test fret 12.
    const cells = heatmap([known('note@s6f12', 40), known('find:E@s6', 3)]);
    expect(cellAt(cells, 6, 12)).toMatchObject({ stabilityDays: 3, band: 1 });
    expect(cellAt(cells, 6, 0)).toMatchObject({ stabilityDays: 3, band: 1 });
    expect(cellAt(cells, 6, 12).nextDue).toEqual(new Date(NOW.getTime() + 3 * DAY));
  });

  it('predicts recall now and at the forecast horizon from FSRS retrievability', () => {
    const card = known('note@s5f7', 7, 2);
    const cell = cellAt(heatmap([card]), 5, 7);
    expect(cell.recallNow).toBeCloseTo(retrievability(card, NOW), 6);
    expect(cell.recallForecast).toBeCloseTo(
      retrievability(card, new Date(NOW.getTime() + 7 * DAY)),
      6,
    );
    expect(cell.recallForecast!).toBeLessThan(cell.recallNow!);
  });

  it('counts answers and takes the median of the latest correct ones', () => {
    const logs = [
      log('note@s5f7', 9000, true, 100), // older than the window
      ...Array.from({ length: 10 }, (_, i) => log('note@s5f7', 1000 + i * 100, true, 50 - i)),
      log('note@s5f7', 5000, false, 1), // wrong answers don't count toward speed
    ];
    const cell = cellAt(heatmap([known('note@s5f7', 5)], logs), 5, 7);
    expect(cell.reviews).toBe(12);
    expect(cell.correct).toBe(11);
    expect(cell.medianMs).toBe(1450);
    expect(cell.slow).toBe(false);
  });

  it('ignores guided answers, which show the note, for speed and counts', () => {
    const guided = { ...log('note@s5f7', 600, true, 10), hintUsed: true };
    const logs = [guided, log('note@s5f7', 3500, true, 5), log('note@s5f7', 4000, true, 1)];
    const cell = cellAt(heatmap([known('note@s5f7', 2)], logs), 5, 7);
    // With the 0.6s worked example the median would be 3.5s; still slow, but
    // a lone fast guided rep would otherwise hide a slow cell entirely.
    expect(cell).toMatchObject({ medianMs: 3750, slow: true, reviews: 2, correct: 2 });
    const onlyGuided = cellAt(
      heatmap([known('note@s5f7', 2)], [guided, log('note@s5f7', 4000)]),
      5,
      7,
    );
    expect(onlyGuided).toMatchObject({ medianMs: 4000, slow: true, reviews: 1 });
  });

  it('marks a cell slow when its median answer is over the target', () => {
    const logs = [log('find:A@s5', 3000), log('find:A@s5', 3200), log('note@s5f0', 1000)];
    const cells = heatmap([known('find:A@s5', 2), known('note@s5f0', 2)], logs);
    expect(cellAt(cells, 5, 0)).toMatchObject({ medianMs: 3000, slow: true, reviews: 3 });
    // find:A@s5 also covers fret 12.
    expect(cellAt(cells, 5, 12)).toMatchObject({ medianMs: 3100, slow: true });
  });

  it('reads logs in time order whatever order they arrive in', () => {
    const logs = Array.from({ length: 12 }, (_, i) =>
      log('note@s1f1', i < 2 ? 9000 : 1000, true, 12 - i),
    );
    const cells = heatmap([known('note@s1f1', 2)], [...logs].reverse());
    expect(cellAt(cells, 1, 1).medianMs).toBe(1000);
  });

  it('honours a custom config and fret range', () => {
    const cells = buildHeatmap({
      cards: [known('note@s5f7', 12)],
      logs: [],
      fretRange: { from: 5, to: 9 },
      targets: TARGETS,
      now: NOW,
      retrievability,
      cfg: { stabilityBandsDays: [20], recentAnswers: 3, forecastDays: 1 },
    });
    expect(cells).toHaveLength(6 * 5);
    expect(cellAt(cells, 5, 7).band).toBe(0);
  });
});

describe('forecastByString', () => {
  it('averages next-week recall over each string’s practised cards', () => {
    const a = known('note@s5f7', 30);
    const b = known('find:C@s5', 2, 1);
    const fresh = scheduler.newCard({ id: 'note@s5f3', skillId: 'test' }, NOW);
    const forecasts = forecastByString({
      cards: [a, b, fresh, known('marker:f7', 10)],
      now: NOW,
      retrievability,
    });
    expect(forecasts.map((f) => f.string)).toEqual([1, 2, 3, 4, 5, 6]);
    const week = new Date(NOW.getTime() + 7 * DAY);
    const s5 = forecasts.find((f) => f.string === 5)!;
    expect(s5.practised).toBe(2);
    expect(s5.recall).toBeCloseTo((retrievability(a, week) + retrievability(b, week)) / 2, 6);
    expect(forecasts.find((f) => f.string === 6)).toEqual({
      string: 6,
      practised: 0,
      recall: null,
    });
  });

  it('looks as far ahead as configured', () => {
    const card = known('note@s6f5', 10);
    const [f] = forecastByString({
      cards: [card],
      now: NOW,
      retrievability,
      cfg: { forecastDays: 10 },
    }).filter((x) => x.string === 6);
    // FSRS stability is the interval at which recall falls to 90%.
    expect(f!.recall).toBeCloseTo(0.9, 2);
  });
});

describe('copy', () => {
  it('formats percentages, days, seconds and due dates', () => {
    expect(formatPercent(0.9234)).toBe('92%');
    expect(formatDays(0.4)).toBe('under a day');
    expect(formatDays(1.2)).toBe('1 day');
    expect(formatDays(12.4)).toBe('12 days');
    expect(formatSeconds(1450)).toBe('1.4s');
    expect(formatDue(new Date(NOW.getTime() - 1), NOW)).toBe('due now');
    expect(formatDue(new Date(NOW.getTime() + DAY / 2), NOW)).toBe('due within a day');
    expect(formatDue(new Date(NOW.getTime() + DAY), NOW)).toBe('due in 1 day');
    expect(formatDue(new Date(NOW.getTime() + 3.2 * DAY), NOW)).toBe('due in 3 days');
  });

  it('writes the forecast sentence', () => {
    expect(forecastSentence({ string: 5, practised: 4, recall: 0.921 }, 7)).toBe(
      "You'll remember ~92% of string 5 next week.",
    );
    expect(forecastSentence({ string: 2, practised: 1, recall: 0.5 }, 3)).toBe(
      "You'll remember ~50% of string 2 in 3 days.",
    );
    expect(forecastSentence({ string: 1, practised: 0, recall: null }, 7)).toBe(
      'String 1: nothing practised yet.',
    );
  });

  it('names a cell for VoiceOver with its note and state', () => {
    const [practised] = heatmap([known('note@s5f7', 12)], [log('note@s5f7', 4000)]).filter(
      (c) => c.string === 5 && c.fret === 7,
    );
    expect(cellSummary(practised!)).toBe('string 5, fret 7, E: remembered for 12 days, slow');
    expect(cellSummary(cellAt(heatmap([]), 6, 3))).toBe('string 6, fret 3, G: not practised yet');
    expect(cellSummary(cellAt(heatmap([]), 5, 1), undefined, 'flat')).toBe(
      'string 5, fret 1, Bb: not practised yet',
    );
  });
});
