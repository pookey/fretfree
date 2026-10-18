import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SKILLS, noteItemId, type Skill } from '../../../engine';
import { focusHref, noteSkillIds } from '../../../session/focus';
import { DROP_D_TUNING, chromaOf, midiAt, type IntervalName } from '../../../theory';
import {
  CHORD_TONES_DRILL,
  View,
  explorerContent,
  explorerMarkers,
  intervalSkillIds,
  quizFocus,
} from './fretboard-explorer';

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
    const chord = quizFocus(explorerContent(0, 'chord:7'), 'intervals').skillIds;
    expect(chord).toEqual(['C3.thirds', 'C3.fourths-fifths', 'C3.sevenths']);
    const scale = quizFocus(explorerContent(0, 'scale:major'), 'degrees').skillIds;
    expect(scale).toEqual(expect.arrayContaining(['C3.seconds', 'C3.sixths', 'C3.thirds']));
  });

  it('falls back to the notes when no interval skill fits', () => {
    const notes = [skill('N', [noteItemId({ string: 6, fret: 1 })], ['name-the-note'])];
    expect(quizFocus(explorerContent(0, 'chord:7'), 'degrees', notes)).toEqual({
      skillIds: ['N'],
    });
  });

  it('opens D37 on that chord, in any spelling, once a skill offers it', () => {
    const d37 = skill(
      'C5.tones',
      ['chord-tones:C7', 'chord-tones:3@Db7', 'chord-tones:C#7', 'chord-tones:Cmaj7'],
      [CHORD_TONES_DRILL],
    );
    const skills = [...SKILLS, d37];
    expect(quizFocus(explorerContent(1, 'chord:7'), 'names', skills)).toEqual({
      itemIds: ['chord-tones:3@Db7', 'chord-tones:C#7'],
    });
    // No item names the chord: the whole D37 skill.
    expect(quizFocus(explorerContent(4, 'chord:m7b5'), 'degrees', skills)).toEqual({
      skillIds: ['C5.tones'],
    });
    // Scales don't open D37.
    expect(quizFocus(explorerContent(0, 'scale:major'), 'names', skills)).toEqual({
      skillIds: noteSkillIds(SKILLS),
    });
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
    expect(quiz()).toHaveAttribute(
      'href',
      focusHref({ skillIds: ['C3.thirds', 'C3.fourths-fifths', 'C3.sevenths'] }),
    );
  });
});
