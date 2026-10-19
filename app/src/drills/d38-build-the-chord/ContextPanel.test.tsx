import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { buildChordItemId, type GuideLevel } from '../../engine/model';
import { STANDARD_TUNING, type ChordKind } from '../../theory';
import { resolveView } from '../lazy-view';
import { BuildChordPanel } from './ContextPanel';
import buildTheChord from './drill';
import { d38Check, d38PromptAt, type D38Prompt } from './logic';

const prompt = (kind: ChordKind = 'm7') =>
  d38PromptAt(
    buildChordItemId(kind, 5),
    kind,
    'A',
    { string: 5, fret: 0 },
    'naturals',
    STANDARD_TUNING,
    'sharp',
  );

function panel(
  p: D38Prompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answered?: boolean } = {},
) {
  return render(
    <BuildChordPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answered ? { answer: [], result: d38Check(p, []) } : null}
    />,
  );
}

const tones = () =>
  within(screen.getByRole('list', { name: 'Chord tones of Am7' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('<BuildChordPanel>', () => {
  it('is the D38 plugin’s context panel, loaded on first use', async () => {
    expect(await resolveView(buildTheChord.contextPanel!)).toBe(BuildChordPanel);
  });

  it('leaves the spelling to recall at guide level 1 (rule 4)', () => {
    panel(prompt(), 1);
    expect(screen.getByRole('heading', { name: 'Build Am7' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Chord tones of Am7' })).toBeNull();
    expect(screen.getByText(/Spell Am7 from its root/)).toBeInTheDocument();
    expect(screen.getByText('Within 4 frets, 4 fingers')).toBeInTheDocument();
  });

  it('shows the formula from level 2, the notes from level 3, and the optional 5th', () => {
    const { unmount } = panel(prompt(), 2);
    expect(tones()).toEqual(['R', '♭3', '5optional', '♭7']);
    expect(screen.getByText('Every chord tone (the 5th may go)')).toBeInTheDocument();
    unmount();
    panel(prompt(), 3);
    expect(tones()).toEqual(['RA', '♭3C', '5Eoptional', '♭7G']);
  });

  it('shows everything once answered or in a worked example', () => {
    const { unmount } = panel(prompt('minor'), 0, { answered: true });
    expect(
      within(screen.getByRole('list', { name: 'Chord tones of Am' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['RA', '♭3C', '5E']);
    expect(screen.getByText('Every chord tone')).toBeInTheDocument();
    unmount();
    panel(prompt(), 0, { guided: true });
    expect(tones()).toHaveLength(4);
  });
});
