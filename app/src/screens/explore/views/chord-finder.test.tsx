import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Chord } from 'tonal';
import guitar from '@tombatossals/chords-db/lib/guitar.json';
import * as audio from '../../../audio/audio';
import { useAppStore } from '../../../app-store';
import { SKILLS } from '../../../engine';
import { noteSkillIds } from '../../../session/focus';
import { DROP_D_TUNING, STANDARD_TUNING, chromaOf, midiAt } from '../../../theory';
import {
  BOOK_SUFFIXES,
  STRUM_GAP,
  bassOf,
  View,
  bassFirst,
  bookVoicing,
  chordQuizFocus,
  chordSkillIds,
  chordTones,
  lookUpVoicings,
  normaliseSymbol,
  pickedMarkers,
  pickedNotes,
  readChord,
  toneAt,
  togglePick,
  type ChordBook,
} from './chord-finder';
import { frontierSkillIds } from './fretboard-explorer';

/** Every registered skill open, as for a learner who has unlocked them all. */
const ALL_OPEN: ReadonlySet<string> = new Set(SKILLS.map((s) => s.id));

/** A fresh learner: nothing stored, so only the first skills are on the frontier. */
const FRESH = frontierSkillIds(SKILLS, new Map());

const picks = (...cells: [number, number][]) => new Map(cells);

/** Tapped cells → the names `readChord` gives, best first. */
const names = (...cells: [number, number][]) =>
  readChord(bassFirst(pickedNotes(picks(...cells)))).map((r) => r.symbol);

afterEach(() => {
  vi.restoreAllMocks();
  useAppStore.setState((s) => ({ settings: { ...s.settings, tuning: STANDARD_TUNING.id } }));
});

describe('togglePick', () => {
  it('picks one note per string, moves it, and lifts it when tapped again', () => {
    let p = togglePick(new Map(), { string: 5, fret: 3 });
    expect([...p]).toEqual([[5, 3]]);
    p = togglePick(p, { string: 5, fret: 2 });
    expect([...p]).toEqual([[5, 2]]);
    p = togglePick(p, { string: 4, fret: 2 });
    expect(p.size).toBe(2);
    p = togglePick(p, { string: 5, fret: 2 });
    expect([...p]).toEqual([[4, 2]]);
  });
});

describe('pickedNotes and bassFirst', () => {
  it('orders notes low to high and keeps each pitch class once, bass first', () => {
    // Open E major: 022100.
    const notes = pickedNotes(picks([1, 0], [2, 0], [3, 1], [4, 2], [5, 2], [6, 0]));
    expect(notes.map((n) => n.name)).toEqual(['E2', 'B2', 'E3', 'G#3', 'B3', 'E4']);
    expect(bassFirst(notes)).toEqual(['E', 'B', 'G#']);
  });

  it('spells by the accidental preference and the tuning', () => {
    expect(pickedNotes(picks([6, 1]), STANDARD_TUNING, 'flat')[0]?.pc).toBe('F');
    expect(pickedNotes(picks([5, 1]), STANDARD_TUNING, 'flat')[0]?.pc).toBe('Bb');
    expect(pickedNotes(picks([6, 0]), DROP_D_TUNING)[0]?.name).toBe('D2');
  });
});

describe('readChord', () => {
  it('names open chords', () => {
    expect(names([5, 3], [4, 2], [3, 0], [2, 1], [1, 0])[0]).toBe('C');
    expect(names([5, 0], [4, 2], [3, 2], [2, 1], [1, 0])[0]).toBe('Am');
    expect(names([5, 3], [4, 2], [3, 3], [2, 1], [1, 0])[0]).toBe('C7');
    expect(names([4, 0], [3, 2], [2, 1], [1, 1])[0]).toBe('Dm7');
  });

  it('names an inversion by its root, not as an odd chord on the bass', () => {
    // E G C: C/E, not Em#5.
    expect(names([4, 2], [3, 0], [2, 1])).toEqual(['C/E']);
  });

  it('puts a reading with its root in the bass first', () => {
    // C E A G: C6, also Am7/C. With C on top instead of G it is Am/C.
    expect(names([5, 3], [4, 2], [3, 2], [1, 3])).toEqual(['C6', 'Am7/C']);
    expect(names([5, 3], [4, 2], [3, 2], [2, 1])).toEqual(['Am/C']);
  });

  it('reads a shell voicing without its 5th as the full chord', () => {
    // C E Bb (x3x35x → x 3 . 3 5): C7.
    expect(names([5, 3], [3, 3], [2, 5])[0]).toBe('C7');
  });

  it('writes charts’ spellings and gives the type’s name', () => {
    const [cadd9] = readChord(['C', 'E', 'G', 'D']);
    expect(cadd9).toEqual({ symbol: 'Cadd9', root: 'C', bass: null, name: expect.any(String) });
    expect(readChord(['C', 'E', 'G', 'B'])[0]).toMatchObject({ name: 'major seventh' });
    expect(readChord(['E', 'C', 'G'])[0]).toMatchObject({ symbol: 'C/E', bass: 'E' });
  });

  it('keeps an odd reading only when nothing else fits, and caps the list', () => {
    expect(readChord(['C', 'E', 'G#', 'B']).map((r) => r.symbol)).toEqual(['CM7b6']);
    expect(readChord(['C', 'Eb', 'Gb', 'A'], 2)).toHaveLength(2);
  });

  it('spells a root as charts do when the tapped spelling needs double sharps or flats', () => {
    // Sharp preference: A# D F is Bb (not A# C## E#), and so on.
    expect(readChord(['A#', 'D', 'F'])[0]?.symbol).toBe('Bb');
    expect(readChord(['D#', 'G', 'A#'])[0]?.symbol).toBe('Eb');
    expect(readChord(['G#', 'C', 'D#'])[0]?.symbol).toBe('Ab');
    expect(readChord(['A#', 'D', 'F', 'G#'])[0]?.symbol).toBe('Bb7');
    // Flat preference: Gb A Db is F#m (not Gb Bbb Db).
    expect(readChord(['Gb', 'A', 'Db'])[0]?.symbol).toBe('F#m');
    expect(readChord(['C#', 'F', 'G#'])[0]?.symbol).toBe('Db');
    // A plain triad keeps its spelling, either way, even with an E# 7th.
    expect(readChord(['F#', 'A#', 'C#'])[0]?.symbol).toBe('F#');
    expect(readChord(['F#', 'A#', 'C#', 'F'])[0]?.symbol).toBe('F#maj7');
    expect(readChord(['C#', 'E', 'G#'])[0]?.symbol).toBe('C#m');
    expect(readChord(['Db', 'F', 'Ab'])[0]?.symbol).toBe('Db');
  });

  it('spells the bass of a respelled slash chord from the chord', () => {
    expect(readChord(['D', 'F', 'A#'])[0]).toMatchObject({ symbol: 'Bb/D', root: 'Bb', bass: 'D' });
    expect(readChord(['A#', 'D#', 'G'])[0]).toMatchObject({ symbol: 'Eb/Bb', bass: 'Bb' });
  });

  it('names nothing for fewer than two notes or a cluster', () => {
    expect(readChord([])).toEqual([]);
    expect(readChord(['C'])).toEqual([]);
    expect(readChord(['C', 'C#'])).toEqual([]);
  });
});

describe('chordTones', () => {
  it('gives each note its degree, style and spelling', () => {
    const t = chordTones('Bm7');
    expect([...t.values()]).toEqual([
      { degree: 'R', style: 'root', pc: 'B' },
      { degree: 'b3', style: 'third', pc: 'D' },
      { degree: '5', style: 'fifth', pc: 'F#' },
      { degree: 'b7', style: 'seventh', pc: 'A' },
    ]);
  });

  it('marks 6ths and 9ths as added notes, and ignores a bass', () => {
    expect(chordTones('C6/9').get(9)).toEqual({ degree: '6', style: 'added', pc: 'A' });
    expect(chordTones('C6/9').get(2)).toMatchObject({ degree: '9', style: 'added' });
    expect(chordTones('C/E').get(0)?.degree).toBe('R');
    expect(chordTones('Cdim7').get(9)?.degree).toBe('bb7');
  });
});

describe('pickedMarkers', () => {
  const notes = pickedNotes(picks([5, 3], [4, 2], [3, 2], [2, 1]));

  it('draws unnamed notes as plain tones labelled by note', () => {
    expect(pickedMarkers(notes, null).map((m) => [m.style, m.label])).toEqual([
      ['tone', 'C'],
      ['tone', 'E'],
      ['tone', 'A'],
      ['tone', 'C'],
    ]);
  });

  it('shapes them by degree once named, an added note a dashed ring', () => {
    expect(pickedMarkers(notes, chordTones('C6')).map((m) => m.style)).toEqual([
      'root',
      'third',
      'ghost',
      'root',
    ]);
  });

  it('spells them for the chord', () => {
    // G# C E tapped under the sharp preference reads as Abaug: Ab C E.
    const aug = pickedNotes(picks([4, 6], [3, 5], [2, 5]), STANDARD_TUNING, 'sharp');
    const [reading] = readChord(bassFirst(aug));
    expect(reading?.symbol).toBe('Abaug');
    expect(pickedMarkers(aug, chordTones(reading!.symbol)).map((m) => m.label)).toEqual([
      'Ab',
      'C',
      'E',
    ]);
    // An F# minor tapped under the flat preference keeps F#'s letters.
    const fsm = pickedNotes(picks([4, 4], [3, 2], [2, 2]), STANDARD_TUNING, 'flat');
    expect(pickedMarkers(fsm, chordTones('F#m')).map((m) => m.label)).toEqual(['F#', 'A', 'C#']);
  });
});

describe('toneAt', () => {
  it('names a note outside the chord by its interval above the root', () => {
    const c11 = chordTones('C11');
    expect(toneAt(c11, 0)).toMatchObject({ degree: 'R', style: 'root' });
    expect(toneAt(c11, 4)).toEqual({ degree: '3', style: 'third', pc: 'E' });
    expect(toneAt(chordTones('C7alt'), 6)).toMatchObject({ degree: 'b5', style: 'fifth' });
    expect(toneAt(chordTones('C7'), 3)).toMatchObject({ degree: '#9', style: 'added' });
    expect(toneAt(chordTones('C13'), 5)).toMatchObject({ degree: '11', style: 'added' });
  });
});

describe('normaliseSymbol', () => {
  it('tidies typed symbols', () => {
    expect(normaliseSymbol(' f♯ m7 ')).toBe('F#m7');
    expect(normaliseSymbol('b♭')).toBe('Bb');
    expect(normaliseSymbol('CΔ7')).toBe('Cmaj7');
    expect(normaliseSymbol('')).toBe('');
  });
});

describe('the chord book', () => {
  const book = guitar as unknown as ChordBook;

  it('maps every listed suffix to a chord tonal can spell', () => {
    for (const ours of Object.values(BOOK_SUFFIXES)) {
      expect(Chord.get(`C${ours}`).empty, ours).toBe(false);
    }
  });

  it('lists every key and every mapped suffix in every key', () => {
    expect(book.keys).toHaveLength(12);
    for (const key of book.keys) {
      const suffixes = new Set(book.chords[key.replace('#', 'sharp')]?.map((c) => c.suffix));
      for (const suffix of Object.keys(BOOK_SUFFIXES))
        expect(suffixes, `${key}${suffix}`).toContain(suffix);
    }
  });

  it('shows only shapes that sound their own chord, bar the filled-out extended chords', () => {
    const missing: string[] = [];
    for (const key of book.keys) {
      for (const ours of Object.values(BOOK_SUFFIXES)) {
        const result = lookUpVoicings(`${key}${ours}`);
        if (!result.ok) {
          missing.push(`${key}${ours}`);
          continue;
        }
        if (['11', '13', 'maj13', '7alt'].includes(ours)) continue;
        const want = new Set(Chord.get(`${key}${ours}`).notes.map((n) => chromaOf(n)));
        for (const v of result.voicings) {
          const got = v.voicing.notes.map((n) => midiAt(n) % 12);
          expect(
            got.filter((c) => !want.has(c)),
            `${key}${ours} ${v.where}`,
          ).toEqual([]);
        }
      }
    }
    // The book's E madd9 shapes all sound F madd9.
    expect(missing).toEqual(['Emadd9']);
  });

  it('names the notes a filled-out chord adds beyond tonal’s spelling', () => {
    // tonal's C11 has no 3rd; the book's C11 shapes do.
    const r = lookUpVoicings('C11', 'degrees');
    if (!r.ok) throw new Error(r.message);
    const labels = r.voicings.flatMap((v) => v.voicing.notes.map((n) => n.label));
    expect(labels).toContain('3');
    expect(labels).not.toContain(undefined);
  });
});

describe('bookVoicing', () => {
  it('reads chords-db frets relative to the base fret, low string first', () => {
    const tones = chordTones('C');
    // The C barre at the 3rd fret: frets 1 1 3 3 3 1 from base fret 3.
    const v = bookVoicing(
      { frets: [1, 1, 3, 3, 3, 1], fingers: [1, 1, 2, 3, 4, 1], baseFret: 3 },
      tones,
    );
    expect(v.voicing.notes.map((n) => [n.string, n.fret, n.finger])).toEqual([
      [6, 3, 1],
      [5, 3, 1],
      [4, 5, 2],
      [3, 5, 3],
      [2, 5, 4],
      [1, 3, 1],
    ]);
    expect(v.where).toBe('frets 3–5');
    expect(v.notes).toEqual(['G2', 'C3', 'G3', 'C4', 'E4', 'G4']);
    expect([...v.picked]).toEqual([
      [6, 3],
      [5, 3],
      [4, 5],
      [3, 5],
      [2, 5],
      [1, 3],
    ]);
  });

  it('mutes, leaves open strings unfingered, and labels by degree or note name', () => {
    const tones = chordTones('C');
    const open = { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 };
    const v = bookVoicing(open, tones);
    expect(v.voicing.notes).toHaveLength(5);
    expect(v.voicing.notes.find((n) => n.string === 3)).toEqual({
      string: 3,
      fret: 0,
      style: 'fifth',
      label: '5',
    });
    expect(v.voicing.notes.find((n) => n.string === 5)).toMatchObject({
      style: 'root',
      label: 'R',
    });
    expect(bookVoicing(open, tones, 'names').voicing.notes.map((n) => n.label)).toEqual([
      'C',
      'E',
      'G',
      'C',
      'E',
    ]);
    expect(v.where).toBe('frets 1–3');
  });

  it('says where a one-fret or open shape sits, and draws added notes as plain tones', () => {
    const tones = chordTones('Em');
    expect(
      bookVoicing({ frets: [0, 0, 0, 0, 0, 0], fingers: [0, 0, 0, 0, 0, 0], baseFret: 1 }, tones)
        .where,
    ).toBe('open strings');
    const c69 = chordTones('C6/9');
    const v = bookVoicing(
      { frets: [-1, 2, 1, 1, 2, 2], fingers: [0, 2, 1, 1, 3, 4], baseFret: 2 },
      c69,
    );
    expect(v.voicing.notes.find((n) => n.label === '6')?.style).toBe('tone');
    expect(
      bookVoicing({ frets: [-1, -1, 1, 1, 1, -1], fingers: [0, 0, 1, 1, 1, 0], baseFret: 5 }, tones)
        .where,
    ).toBe('fret 5');
  });
});

describe('bassOf', () => {
  it('takes the lowest pitch, not the lowest sounding string', () => {
    // String 6 at fret 7 (B2) over an open string 5 (A2): the bass is A.
    expect(
      bassOf({ frets: [3, 0, -1, -1, -1, -1], fingers: [1, 0, 0, 0, 0, 0], baseFret: 5 }),
    ).toBe(9);
    expect(bassOf({ frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 })).toBe(
      0,
    );
  });
});

describe('lookUpVoicings', () => {
  it('finds the open C first', () => {
    const r = lookUpVoicings('C');
    if (!r.ok) throw new Error(r.message);
    expect(r.symbol).toBe('C');
    expect(r.voicings.length).toBeGreaterThanOrEqual(3);
    expect(r.voicings[0]?.notes).toEqual(['C3', 'E3', 'G3', 'C4', 'E4']);
    expect(r.note).toBeNull();
  });

  it('accepts other spellings of the type and keeps the typed root', () => {
    for (const typed of ['Cmaj7', 'CM7', 'CΔ7', 'cmaj7']) {
      const r = lookUpVoicings(typed);
      expect(r.ok && r.symbol, typed).toBe('Cmaj7');
    }
    const db = lookUpVoicings('Dbm7');
    expect(db.ok && db.symbol).toBe('Dbm7');
    const cs = lookUpVoicings('C#m7');
    expect(cs.ok && db.ok && cs.voicings.map((v) => v.notes)).toEqual(
      db.ok && db.voicings.map((v) => v.notes),
    );
    const min = lookUpVoicings('Amin');
    expect(min.ok && min.symbol).toBe('Am');
    const sixNine = lookUpVoicings('C69');
    expect(sixNine.ok && sixNine.symbol).toBe('C6/9');
  });

  it('uses the book’s slash shapes, then the plain shapes with that bass', () => {
    const ce = lookUpVoicings('C/E');
    if (!ce.ok) throw new Error(ce.message);
    expect(ce.symbol).toBe('C/E');
    expect(ce.voicings.every((v) => v.notes[0]?.startsWith('E'))).toBe(true);

    const cg = lookUpVoicings('C/G');
    if (!cg.ok) throw new Error(cg.message);
    expect(cg.symbol).toBe('C/G');
    expect(cg.voicings.every((v) => v.notes[0]?.startsWith('G'))).toBe(true);

    const am = lookUpVoicings('Am/G');
    if (!am.ok) throw new Error(am.message);
    expect(am.symbol).toBe('Am/G');
    expect(am.voicings.every((v) => v.notes[0]?.startsWith('G'))).toBe(true);
  });

  it('falls back to the plain chord when no shape has that bass, and says so', () => {
    const r = lookUpVoicings('Cmaj7/F#');
    if (!r.ok) throw new Error(r.message);
    expect(r.symbol).toBe('Cmaj7');
    expect(r.note).toBe('The chord book has no Cmaj7/F# shape, so these are Cmaj7 shapes.');
  });

  it('explains an empty, unknown or missing chord', () => {
    expect(lookUpVoicings('  ')).toEqual({
      ok: false,
      message: 'Type a chord symbol, such as Am7 or F#.',
    });
    expect(lookUpVoicings('Hm7')).toMatchObject({
      ok: false,
      message: expect.stringContaining('isn’t a chord symbol'),
    });
    expect(lookUpVoicings('Cxyz')).toMatchObject({
      ok: false,
      message: expect.stringContaining('isn’t a chord symbol'),
    });
    expect(lookUpVoicings('C5')).toEqual({
      ok: false,
      message: 'The chord book has no voicings for C5.',
    });
    const empty: ChordBook = { keys: ['C'], chords: { C: [] } };
    expect(lookUpVoicings('C', 'degrees', empty)).toEqual({
      ok: false,
      message: 'The chord book has no voicings for C.',
    });
  });
});

describe('"Quiz me on this"', () => {
  it('finds the C5 skills, and those that drill one kind', () => {
    const all = chordSkillIds(SKILLS, null);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((id) => id.startsWith('C5.'))).toBe(true);
    const m7 = chordSkillIds(SKILLS, 'm7');
    expect(m7.length).toBeGreaterThan(0);
    expect(m7.length).toBeLessThan(all.length);
  });

  it('quizzes spelling the chord on its root and finding its tones', () => {
    const focus = chordQuizFocus('Bm7', ALL_OPEN);
    expect(focus.itemIds).toContain('spell-chord:m7@B');
    expect(focus.itemIds).not.toContain('spell-chord:m7@A');
    expect(focus.itemIds?.some((id) => id.startsWith('chord-tone:') && id.endsWith('@m7'))).toBe(
      true,
    );
  });

  it('reads the root of an inversion, and quizzes chord construction for chords C5 skips', () => {
    expect(chordQuizFocus('C/E', ALL_OPEN).itemIds).toContain('spell-chord:major@C');
    expect(chordQuizFocus('C6', ALL_OPEN)).toEqual({ skillIds: chordSkillIds(SKILLS, null) });
    expect(chordQuizFocus(null, ALL_OPEN)).toEqual({ skillIds: chordSkillIds(SKILLS, null) });
  });

  it('walks back to the nearest open prerequisites while the chord skills are gated', () => {
    const c5 = new Set(chordSkillIds(SKILLS, null));
    const focus = chordQuizFocus('Bm7', new Set([...ALL_OPEN].filter((id) => !c5.has(id))));
    expect(focus.itemIds).toBeUndefined();
    expect(focus.skillIds?.length).toBeGreaterThan(0);
    expect(focus.skillIds?.some((id) => c5.has(id))).toBe(false);
  });

  it('falls back to the notes when nothing on the way is open', () => {
    expect(chordQuizFocus('Bm7', new Set())).toEqual({ skillIds: noteSkillIds(SKILLS) });
    expect(chordQuizFocus('C', FRESH).skillIds?.length).toBeGreaterThan(0);
  });
});

function renderView() {
  return render(
    <MemoryRouter>
      <View />
    </MemoryRouter>,
  );
}

const cell = (string: number, fret: number) =>
  document.querySelector(`[data-cell="s${string}f${fret}"]`) as Element;

describe('<View>', () => {
  it('names the chord as notes are tapped, plays each, and lifts a note tapped again', async () => {
    const play = vi.spyOn(audio, 'playNotes').mockResolvedValue();
    renderView();
    expect(screen.getByTestId('chord-name')).toHaveTextContent('Tap at least two notes');
    fireEvent.pointerDown(cell(5, 3));
    await vi.waitFor(() =>
      expect(play).toHaveBeenLastCalledWith(['C3'], expect.objectContaining({ gap: 0 })),
    );
    fireEvent.pointerDown(cell(4, 2));
    fireEvent.pointerDown(cell(3, 0));
    expect(screen.getByTestId('chord-name')).toHaveTextContent('C (major)');
    expect(screen.getByTestId('chord-notes')).toHaveTextContent('C R');
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Root3rd5th');
    expect(screen.getAllByTestId('marker-root')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'string 5, fret 3, C, picked' })).toBeInTheDocument();

    // Let the three taps' sounds land before checking the lift is silent.
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(3));
    play.mockClear();
    fireEvent.pointerDown(cell(3, 0));
    expect(play).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'string 3, fret 0, G' })).toBeInTheDocument();
    expect(screen.getByTestId('chord-name')).toHaveTextContent('don’t make a chord');
    fireEvent.pointerDown(cell(3, 0));
    fireEvent.pointerDown(cell(2, 0));
    expect(screen.getByTestId('chord-name')).toHaveTextContent('Cmaj7 (major seventh)');
    expect(screen.getByTestId('chord-notes')).toHaveTextContent('B 7');
  });

  it('strums the tapped notes and clears them', async () => {
    const play = vi.spyOn(audio, 'playNotes').mockResolvedValue();
    renderView();
    const strum = screen.getByRole('button', { name: 'Play' });
    expect(strum).toBeDisabled();
    fireEvent.pointerDown(cell(5, 0));
    fireEvent.pointerDown(cell(4, 2));
    fireEvent.pointerDown(cell(3, 2));
    fireEvent.pointerDown(cell(2, 1));
    expect(screen.getByTestId('chord-name')).toHaveTextContent('Am');
    fireEvent.click(strum);
    await vi.waitFor(() =>
      expect(play).toHaveBeenLastCalledWith(
        ['A2', 'E3', 'A3', 'C4'],
        expect.objectContaining({ gap: STRUM_GAP }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(document.querySelectorAll('[data-testid^="marker-"]')).toHaveLength(0);
    expect(screen.getByTestId('chord-name')).toHaveTextContent('Tap at least two notes');
  });

  it('says when the notes make no chord, and lists other readings', () => {
    vi.spyOn(audio, 'playNotes').mockResolvedValue();
    renderView();
    fireEvent.pointerDown(cell(5, 3));
    fireEvent.pointerDown(cell(4, 0));
    expect(screen.getByTestId('chord-name')).toHaveTextContent('don’t make a chord');
    fireEvent.pointerDown(cell(4, 2));
    fireEvent.pointerDown(cell(3, 2));
    fireEvent.pointerDown(cell(1, 3));
    expect(screen.getByTestId('chord-name')).toHaveTextContent('C6');
    expect(screen.getByTestId('chord-alternatives')).toHaveTextContent('Also read as Am7/C');
    expect(screen.getAllByTestId('marker-ghost')).toHaveLength(1);
  });

  it('shows the voicings of a typed chord, with fingers, degrees or note names', () => {
    renderView();
    const list = () => screen.getByRole('list', { name: /^Voicings of / });
    expect(list()).toHaveAccessibleName('Voicings of C');
    fireEvent.change(screen.getByRole('textbox', { name: 'Chord symbol' }), {
      target: { value: 'am7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show voicings' }));
    expect(list()).toHaveAccessibleName('Voicings of Am7');
    expect(screen.getByTestId('voicings-status')).toHaveTextContent(/Am7: \d voicings/);
    const first = within(list()).getAllByRole('img')[0] as Element;
    expect(first).toHaveAccessibleName(/finger/);
    fireEvent.click(screen.getByRole('radio', { name: 'Degrees' }));
    expect(within(list()).getAllByRole('img')[0]).toHaveAccessibleName(/labelled b3/);
    fireEvent.click(screen.getByRole('radio', { name: 'Note names' }));
    expect(within(list()).getAllByRole('img')[0]).toHaveAccessibleName(/labelled C/);
  });

  it('explains a symbol it can’t show', () => {
    renderView();
    const input = screen.getByRole('textbox', { name: 'Chord symbol' });
    fireEvent.change(input, { target: { value: 'Q7' } });
    fireEvent.submit(input);
    expect(screen.getByTestId('voicings-status')).toHaveTextContent('isn’t a chord symbol');
    expect(screen.queryByRole('list', { name: /^Voicings of / })).not.toBeInTheDocument();
  });

  it('plays a voicing and puts it on the neck, where it is named', async () => {
    const play = vi.spyOn(audio, 'playNotes').mockResolvedValue();
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Play C, frets 1–3' }));
    await vi.waitFor(() =>
      expect(play).toHaveBeenLastCalledWith(
        ['C3', 'E3', 'G3', 'C4', 'E4'],
        expect.objectContaining({ gap: STRUM_GAP }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show C, frets 3–5, on the neck' }));
    expect(screen.getByTestId('chord-name')).toHaveTextContent('C');
    expect(screen.getAllByTestId('marker-root').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'string 6, fret 3, G, picked' })).toBeInTheDocument();
  });

  it('names a tapped flat-root chord as charts do, under the default sharp preference', () => {
    vi.spyOn(audio, 'playNotes').mockResolvedValue();
    renderView();
    // The Bb barre, x13331.
    for (const [string, fret] of [
      [5, 1],
      [4, 3],
      [3, 3],
      [2, 3],
      [1, 1],
    ] as const) {
      fireEvent.pointerDown(cell(string, fret));
    }
    expect(screen.getByTestId('chord-name')).toHaveTextContent('Bb (major)');
    expect(screen.getByTestId('chord-notes')).toHaveTextContent(/^Bb R\s*F 5\s*Bb R\s*D 3\s*F 5$/);
    expect(screen.getByRole('button', { name: 'Voicings of Bb' })).toBeInTheDocument();
  });

  it('opens the voicings of a tapped chord', () => {
    vi.spyOn(audio, 'playNotes').mockResolvedValue();
    renderView();
    fireEvent.pointerDown(cell(4, 0));
    fireEvent.pointerDown(cell(3, 2));
    fireEvent.pointerDown(cell(2, 3));
    fireEvent.pointerDown(cell(1, 2));
    fireEvent.click(screen.getByRole('button', { name: 'Voicings of D' }));
    expect(screen.getByRole('textbox', { name: 'Chord symbol' })).toHaveValue('D');
    expect(screen.getByRole('list', { name: 'Voicings of D' })).toBeInTheDocument();
  });

  it('keeps voicings in standard tuning when the learner tunes otherwise', () => {
    useAppStore.setState((s) => ({ settings: { ...s.settings, tuning: DROP_D_TUNING.id } }));
    vi.spyOn(audio, 'playNotes').mockResolvedValue();
    renderView();
    expect(screen.getByText('Voicings are shown in standard tuning.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /on the neck$/ })).not.toBeInTheDocument();
    fireEvent.pointerDown(cell(6, 0));
    expect(screen.getByRole('button', { name: 'string 6, fret 0, D, picked' })).toBeInTheDocument();
  });

  it('links the quiz to the chord on show and credits chords-db', () => {
    renderView();
    expect(screen.getByRole('link', { name: 'Quiz me on this' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/session\?/),
    );
    expect(screen.getByRole('link', { name: 'chords-db' })).toHaveAttribute(
      'href',
      'https://github.com/tombatossals/chords-db',
    );
  });
});
