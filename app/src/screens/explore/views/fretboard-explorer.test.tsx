import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SKILLS, noteItemId, type Skill, type SkillStatus } from '../../../engine';
import { getDb, putSkillState } from '../../../storage';
import { Fretboard } from '../../../components/fretboard/Fretboard';
import { focusHref, noteSkillIds } from '../../../session/focus';
import { DROP_D_TUNING, chromaOf, midiAt, type IntervalName } from '../../../theory';
import {
  CHORD_TONES_DRILL,
  View,
  explorerContent,
  explorerMarkers,
  frontierSkillIds,
  intervalSkillIds,
  quizFocus,
} from './fretboard-explorer';

/** The developer "unlock every skill" switch (M1-36). */
const DEV_UNLOCK_KEY = 'fretwork.dev.unlockAll';

/** Every registered skill open, as for a learner who has unlocked them all. */
const ALL_OPEN: ReadonlySet<string> = new Set(SKILLS.map((s) => s.id));

/** Every skill open but D37's, which a chord's quiz would open first. */
const OPEN_BUT_D37: ReadonlySet<string> = new Set(
  SKILLS.filter((s) => !s.drillTypes.includes(CHORD_TONES_DRILL)).map((s) => s.id),
);

/** D37's cards for C7 (M3-14), which a C7 quiz opens once they are open. */
const D37_C7 = { itemIds: ['chord-tones:C7', 'chord-tones:b7@C7'] };

/** A fresh learner: nothing stored, so only the first skills are on the frontier. */
const FRESH = frontierSkillIds(SKILLS, new Map());

const C3_SHOWN_BY_C7 = ['C3.thirds', 'C3.fourths-fifths', 'C3.sevenths'];

const at = (markers: ReturnType<typeof explorerMarkers>, string: number, fret: number) =>
  markers.find((m) => m.string === string && m.fret === fret);

function skill(id: string, itemIds: string[], drillTypes: string[] = []): Skill {
  return {
    id,
    topic: 'X',
    order: 0,
    title: id,
    prerequisites: [],
    drillTypes,
    items: () => itemIds.map((i) => ({ id: i, skillId: id })),
  };
}

describe('explorerContent', () => {
  it('spells a major key from its root, root first', () => {
    const c = explorerContent(0, 'scale:major');
    expect(c.name).toBe('C major key');
    expect(c.chord).toBeNull();
    expect(c.tones.map((t) => t.pc)).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
    expect(c.tones.map((t) => t.degree)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(c.tones.map((t) => t.interval)).toEqual(['P1', 'M2', 'M3', 'P4', 'P5', 'M6', 'M7']);
    expect(c.tones.map((t) => t.style)).toEqual(['root', ...Array(6).fill('tone')]);
  });

  it('spells the root with fewer accidentals, then by preference', () => {
    expect(explorerContent(1, 'scale:major', 'sharp').root).toBe('Db');
    expect(explorerContent(1, 'scale:minor', 'flat').root).toBe('C#');
    expect(explorerContent(6, 'scale:major', 'sharp').root).toBe('F#');
    expect(explorerContent(6, 'scale:major', 'flat').root).toBe('Gb');
    expect(explorerContent(1, 'chord:major').name).toBe('Db');
  });

  it('covers minor keys and the other scales', () => {
    expect(explorerContent(9, 'scale:minor').tones.map((t) => t.degree)).toEqual([
      '1',
      '2',
      'b3',
      '4',
      '5',
      'b6',
      'b7',
    ]);
    expect(explorerContent(9, 'scale:minor-pentatonic').tones.map((t) => t.pc)).toEqual([
      'A',
      'C',
      'D',
      'E',
      'G',
    ]);
    expect(explorerContent(0, 'scale:major-pentatonic').name).toBe('C major pentatonic');
    expect(explorerContent(9, 'scale:harmonic-minor').tones.at(-1)?.pc).toBe('G#');
  });

  it('falls back to the major key for an unknown pick', () => {
    expect(explorerContent(0, 'scale:nope').name).toBe('C major key');
    expect(explorerContent(0, 'chord:nope' as never).name).toBe('C major key');
  });

  it('marks chord tones by degree: root, 3rd, 5th and 7th', () => {
    const c = explorerContent(0, 'chord:7');
    expect(c.name).toBe('C7');
    expect(c.chord).toBe('7');
    expect(c.tones.map((t) => [t.pc, t.degree, t.interval, t.style])).toEqual([
      ['C', 'R', 'P1', 'root'],
      ['E', '3', 'M3', 'third'],
      ['G', '5', 'P5', 'fifth'],
      ['Bb', 'b7', 'm7', 'seventh'],
    ]);
  });

  it('names altered chord tones as players write them', () => {
    const dim7 = explorerContent(0, 'chord:dim7').tones;
    expect(dim7.map((t) => t.interval)).toEqual(['P1', 'm3', 'd5', 'd7']);
    expect(dim7.map((t) => t.style)).toEqual(['root', 'third', 'fifth', 'seventh']);
    expect(explorerContent(0, 'chord:augmented').tones[2]).toMatchObject({
      degree: '#5',
      interval: 'A5',
      style: 'fifth',
    });
    expect(explorerContent(11, 'chord:m7b5').tones.map((t) => t.degree)).toEqual([
      'R',
      'b3',
      'b5',
      'b7',
    ]);
  });
});

describe('explorerMarkers', () => {
  it('marks every cell of the whole neck that holds a tone, and nothing else', () => {
    const c = explorerContent(0, 'scale:major');
    const markers = explorerMarkers(c, 'names');
    const scale = new Set(c.tones.map((t) => chromaOf(t.pc)));
    expect(markers.length).toBeGreaterThan(50);
    for (const m of markers) {
      expect(m.fret).toBeGreaterThanOrEqual(0);
      expect(m.fret).toBeLessThanOrEqual(15);
      expect(scale.has(midiAt(m) % 12)).toBe(true);
    }
    expect(at(markers, 5, 3)).toMatchObject({ style: 'root', label: 'C' });
    expect(at(markers, 6, 1)).toMatchObject({ style: 'tone', label: 'F' });
    expect(at(markers, 6, 2)).toBeUndefined();
    expect(markers.some((m) => m.fret === 15)).toBe(true);
  });

  it('labels by degree or interval', () => {
    const c = explorerContent(0, 'chord:7');
    expect(at(explorerMarkers(c, 'degrees'), 3, 3)).toMatchObject({
      style: 'seventh',
      label: 'b7',
    });
    expect(at(explorerMarkers(c, 'intervals'), 6, 0)).toMatchObject({
      style: 'third',
      label: 'M3',
    });
    expect(at(explorerMarkers(c, 'names'), 5, 3)).toMatchObject({ style: 'root', label: 'C' });
  });

  it('follows the tuning and range', () => {
    const c = explorerContent(2, 'chord:major');
    const markers = explorerMarkers(c, 'names', { from: 0, to: 3 }, DROP_D_TUNING);
    expect(at(markers, 6, 0)).toMatchObject({ style: 'root', label: 'D' });
    expect(markers.every((m) => m.fret <= 3)).toBe(true);
  });
});

describe('quizFocus', () => {
  it('quizzes the notes on the neck for note names', () => {
    expect(quizFocus(explorerContent(0, 'scale:major'), 'names')).toEqual({
      skillIds: noteSkillIds(SKILLS),
    });
  });

  it('quizzes the interval shapes a pick shows for degrees and intervals', () => {
    const chord = quizFocus(explorerContent(0, 'chord:7'), 'intervals', OPEN_BUT_D37).skillIds;
    expect(chord).toEqual(C3_SHOWN_BY_C7);
    const scale = quizFocus(explorerContent(0, 'scale:major'), 'degrees', ALL_OPEN).skillIds;
    expect(scale).toEqual(expect.arrayContaining(['C3.seconds', 'C3.sixths', 'C3.thirds']));
  });

  it('falls back to the notes when no interval skill fits', () => {
    const notes = [skill('N', [noteItemId({ string: 6, fret: 1 })], ['name-the-note'])];
    expect(quizFocus(explorerContent(0, 'chord:7'), 'degrees', new Set(['N']), notes)).toEqual({
      skillIds: ['N'],
    });
  });

  it('quizzes the notes while C3 is locked, as for a fresh learner (rule 7)', () => {
    expect(FRESH.has('C3.thirds')).toBe(false);
    for (const labels of ['degrees', 'intervals'] as const) {
      expect(quizFocus(explorerContent(0, 'chord:7'), labels, FRESH)).toEqual({
        skillIds: noteSkillIds(SKILLS),
      });
    }
    // Before the frontier loads, nothing counts as open.
    expect(quizFocus(explorerContent(0, 'chord:7'), 'degrees')).toEqual({
      skillIds: noteSkillIds(SKILLS),
    });
  });

  it('quizzes only the C3 skills on the frontier', () => {
    // Practising 3rds soft-unlocks 4ths and 5ths; 7ths wait for those.
    const stored = new Map<string, SkillStatus>([['C3.thirds', 'practising']]);
    const frontier = frontierSkillIds(SKILLS, stored);
    expect(quizFocus(explorerContent(0, 'chord:7'), 'intervals', frontier)).toEqual({
      skillIds: ['C3.thirds', 'C3.fourths-fifths'],
    });
  });

  it('opens D37 on that chord, in any spelling, once a skill offers it', () => {
    const d37 = skill(
      'C5.tones',
      ['chord-tones:C7', 'chord-tones:3@Db7', 'chord-tones:C#7', 'chord-tones:Cmaj7'],
      [CHORD_TONES_DRILL],
    );
    const skills = [...SKILLS.filter((s) => OPEN_BUT_D37.has(s.id)), d37];
    const open = new Set([...OPEN_BUT_D37, 'C5.tones']);
    expect(quizFocus(explorerContent(1, 'chord:7'), 'names', open, skills)).toEqual({
      itemIds: ['chord-tones:3@Db7', 'chord-tones:C#7'],
    });
    // No item names the chord: the whole D37 skill.
    expect(quizFocus(explorerContent(4, 'chord:m7b5'), 'degrees', open, skills)).toEqual({
      skillIds: ['C5.tones'],
    });
    // Scales don't open D37.
    expect(quizFocus(explorerContent(0, 'scale:major'), 'names', open, skills)).toEqual({
      skillIds: noteSkillIds(SKILLS),
    });
    // A locked D37 isn't offered: the quiz falls through.
    expect(quizFocus(explorerContent(1, 'chord:7'), 'names', FRESH, skills)).toEqual({
      skillIds: noteSkillIds(SKILLS),
    });
  });

  it('opens the real D37 cards for a chord (M3-14)', () => {
    expect(quizFocus(explorerContent(0, 'chord:major'), 'names', ALL_OPEN)).toEqual({
      itemIds: ['chord-tones:C', 'chord-tones:3@C'],
    });
    expect(quizFocus(explorerContent(0, 'chord:7'), 'intervals', ALL_OPEN)).toEqual(D37_C7);
    expect(quizFocus(explorerContent(10, 'chord:minor'), 'degrees', ALL_OPEN)).toEqual({
      itemIds: ['chord-tones:Bbm', 'chord-tones:b3@Bbm'],
    });
  });
});

describe('frontierSkillIds', () => {
  it('derives statuses in registry order, as the runner does', () => {
    expect(FRESH.has('F2.string6-naturals')).toBe(true);
    const mastered = new Map<string, SkillStatus>(
      ['F1.half-steps', 'F1.whole-steps', 'C1.octaves'].map((id) => [id, 'mastered']),
    );
    const frontier = frontierSkillIds(SKILLS, mastered);
    expect(frontier.has('C3.thirds')).toBe(true);
    expect(frontier.has('C3.fourths-fifths')).toBe(false);
    // Mastered skills are no longer the frontier.
    expect(frontier.has('C1.octaves')).toBe(false);
  });

  it('lays the developer overlay over the derived statuses, as the runner does', () => {
    const unlocked = frontierSkillIds(SKILLS, new Map(), { unlockAll: true });
    expect(FRESH.has('C3.sevenths')).toBe(false);
    expect(unlocked.has('C3.sevenths')).toBe(true);
    // D37 is open too, so a C7 quiz opens its C7 cards.
    expect(quizFocus(explorerContent(0, 'chord:7'), 'intervals', unlocked)).toEqual(D37_C7);
    // Mastered skills stay mastered under the overlay (rule 11).
    const mastered = new Map<string, SkillStatus>([['C1.octaves', 'mastered']]);
    expect(frontierSkillIds(SKILLS, mastered, { unlockAll: true }).has('C1.octaves')).toBe(false);
    // Without the overlay, nothing changes.
    expect(frontierSkillIds(SKILLS, new Map(), null)).toEqual(FRESH);
    expect(frontierSkillIds(SKILLS, new Map(), {})).toEqual(FRESH);
  });
});

describe('intervalSkillIds', () => {
  it('keeps skills made only of interval shapes that drill a shown interval', () => {
    const skills = [
      skill('thirds', ['interval:M3@s6→s5', 'interval-name:m3@s6→s5']),
      skill('mixed', ['interval:M3@s6→s5', noteItemId({ string: 6, fret: 1 })]),
      skill('empty', []),
      skill('sixths', ['interval:M6@s6→s4']),
    ];
    expect(intervalSkillIds(skills, new Set<IntervalName>(['M3']))).toEqual(['thirds']);
  });
});

describe('<View>', () => {
  afterEach(async () => {
    localStorage.removeItem(DEV_UNLOCK_KEY);
    await getDb().skillStates.clear();
  });

  function renderView() {
    render(
      <MemoryRouter>
        <View />
      </MemoryRouter>,
    );
  }

  const quiz = () => screen.getByRole('link', { name: 'Quiz me on this' });

  it('opens on the C major key with note names across the whole neck', () => {
    renderView();
    expect(screen.getByTestId('explorer-name')).toHaveTextContent('C major key');
    const neck = screen.getByRole('group', { name: 'C major key across the neck' });
    expect(neck).toHaveAttribute('data-fret-from', '0');
    expect(neck).toHaveAttribute('data-fret-to', '15');
    expect(screen.getByRole('radio', { name: 'Note names' })).toBeChecked();
    expect(quiz()).toHaveAttribute('href', focusHref({ skillIds: noteSkillIds(SKILLS) }));
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Root', 'Scale note']);
  });

  it('shows a chord coloured by degree, with shapes, and relabels it', () => {
    renderView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Root' }), { target: { value: '7' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'chord:7' },
    });
    expect(screen.getByTestId('explorer-name')).toHaveTextContent('G7 (dominant seventh)');
    const notes = within(screen.getByRole('list', { name: 'Notes' })).getAllByRole('listitem');
    expect(notes.map((li) => li.textContent)).toEqual(['G R', 'B 3', 'D 5', 'F b7']);
    const legend = screen.getByRole('list', { name: 'Legend' });
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Root', '3rd', '5th', '7th']);

    const neck = screen.getByRole('group', { name: 'G7 across the neck' });
    const seventh = neck.querySelector(
      '[data-testid="marker-seventh"][data-string="6"][data-fret="1"]',
    );
    expect(seventh?.querySelector('polygon')).not.toBeNull();
    expect(seventh).toHaveTextContent('F');
    const fifth = neck.querySelector(
      '[data-testid="marker-fifth"][data-string="5"][data-fret="5"]',
    );
    expect(fifth?.querySelector('polygon')).not.toBeNull();
    expect(neck.querySelector('[data-testid="marker-third"] circle')).not.toBeNull();
    expect(neck.querySelector('[data-testid="marker-root"] rect')).not.toBeNull();
    expect(neck.querySelector('[data-testid="marker-tone"]')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Degrees' }));
    expect(
      neck.querySelector('[data-testid="marker-seventh"][data-string="6"][data-fret="1"]'),
    ).toHaveTextContent('b7');
    fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
    expect(
      neck.querySelector('[data-testid="marker-seventh"][data-string="6"][data-fret="1"]'),
    ).toHaveTextContent('m7');
    // A fresh learner hasn't unlocked the interval shapes: the quiz stays on the notes.
    expect(quiz()).toHaveAttribute('href', focusHref({ skillIds: noteSkillIds(SKILLS) }));

    // Back to a scale: the chord's degree markers and legend go.
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'scale:major-pentatonic' },
    });
    expect(screen.getByTestId('explorer-name')).toHaveTextContent('G major pentatonic');
    const scaleNeck = screen.getByRole('group', { name: 'G major pentatonic across the neck' });
    for (const style of ['third', 'fifth', 'seventh']) {
      expect(scaleNeck.querySelector(`[data-testid="marker-${style}"]`)).toBeNull();
    }
    expect(scaleNeck.querySelector('[data-testid="marker-tone"]')).not.toBeNull();
    expect(
      within(screen.getByRole('list', { name: 'Legend' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Root', 'Scale note']);
  });

  it('quizzes the interval shapes once the learner practises them', async () => {
    for (const skillId of C3_SHOWN_BY_C7) {
      await putSkillState(getDb(), {
        skillId,
        status: 'practising',
        guideLevel: 3,
        rollingAccuracy: 0,
      });
    }
    renderView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'chord:7' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
    await waitFor(() =>
      expect(quiz()).toHaveAttribute('href', focusHref({ skillIds: C3_SHOWN_BY_C7 })),
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Note names' }));
    expect(quiz()).toHaveAttribute('href', focusHref({ skillIds: noteSkillIds(SKILLS) }));
  });

  function quizC7Intervals() {
    renderView();
    fireEvent.change(screen.getByRole('combobox', { name: 'Show' }), {
      target: { value: 'chord:7' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Intervals' }));
  }

  it('quizzes locked skills with the developer switch on', async () => {
    localStorage.setItem(DEV_UNLOCK_KEY, '1');
    quizC7Intervals();
    // Every skill is open, D37 among them, so a chord opens its D37 cards.
    await waitFor(() => expect(quiz()).toHaveAttribute('href', focusHref(D37_C7)));
  });

  it('still refuses locked skills with the developer switch off', async () => {
    // Practising 3rds soft-unlocks 4ths and 5ths; 7ths stay locked.
    await putSkillState(getDb(), {
      skillId: 'C3.thirds',
      status: 'practising',
      guideLevel: 3,
      rollingAccuracy: 0,
    });
    quizC7Intervals();
    await waitFor(() =>
      expect(quiz()).toHaveAttribute(
        'href',
        focusHref({ skillIds: ['C3.thirds', 'C3.fourths-fifths'] }),
      ),
    );
  });

  it('shrinks long labels to fit the 5th triangle', () => {
    render(
      <Fretboard
        fretRange={{ from: 0, to: 5 }}
        markers={[
          { string: 6, fret: 1, style: 'fifth', label: 'F##' },
          { string: 5, fret: 1, style: 'fifth', label: 'B#' },
          { string: 4, fret: 1, style: 'seventh', label: 'F##' },
        ]}
      />,
    );
    const label = (string: number) =>
      document.querySelector(`[data-string="${string}"][data-fret="1"] text`);
    expect(label(6)).toHaveTextContent('F##');
    expect(label(6)?.getAttribute('class')).toBeTruthy();
    expect(label(5)?.getAttribute('class')).toBeNull();
    expect(label(4)?.getAttribute('class')).toBeNull();
  });
});
