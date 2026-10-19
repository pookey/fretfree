import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { SpellingContextPanel } from './ContextPanel';
import spellIt from './drill';
import { d7Hint, d7MakePrompt, type D7Prompt } from './logic';

const prompt = (id = 'spell-key:F#') =>
  d7MakePrompt(
    { id, skillId: 'C4.sharp-keys' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function panel(
  p: D7Prompt,
  over: { guideLevel?: GuideLevel; guided?: boolean; answered?: boolean } = {},
) {
  return render(
    <SpellingContextPanel
      prompt={p}
      guideLevel={over.guideLevel ?? 3}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={
        over.answered
          ? { answer: { notes: [] }, result: { correct: false, expected: p.subject } }
          : null
      }
    />,
  );
}

const chords = () => screen.queryByTestId('diatonic-chords');

describe('<SpellingContextPanel>', () => {
  it('is the D7 plugin’s context panel, loaded on first use', async () => {
    const Panel = spellIt.contextPanel!;
    render(
      <Panel
        prompt={prompt()}
        guideLevel={2}
        guided={false}
        handedness="right"
        tuning={STANDARD_TUNING}
        feedback={null}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Major scale' })).toBeInTheDocument();
    expect(screen.getByTestId('diatonic-chords')).toBeInTheDocument();
  });

  it('shows the major-scale steps and the hint, without the half-step rule at level 1', () => {
    const p = prompt();
    const { container } = panel(p, { guideLevel: 1 });
    expect(screen.getByRole('heading', { name: 'Major scale' })).toBeInTheDocument();
    expect(container).toHaveTextContent('W W H W W W H');
    expect(container).toHaveTextContent(d7Hint(p));
    expect(container).not.toHaveTextContent('B–C');
  });

  it('shows a chord’s formula, with the half-step rule from level 2', () => {
    const { container } = panel(prompt('spell-chord:m7@B'), { guideLevel: 2 });
    expect(screen.getByRole('heading', { name: 'Chord formula' })).toBeInTheDocument();
    expect(container).toHaveTextContent('Bm7 = 1 b3 5 b7');
    expect(container).toHaveTextContent('B–C');
  });

  it('shows full guides in the worked example', () => {
    const { container } = panel(prompt(), { guideLevel: 1, guided: true });
    expect(container).toHaveTextContent('B–C');
  });

  it('leaves the key’s chords out at level 1 until answered', () => {
    panel(prompt(), { guideLevel: 1 });
    expect(chords()).toBeNull();
  });

  it('shows the numerals unnamed from level 2 while the key is being spelled', async () => {
    panel(prompt(), { guideLevel: 2 });
    const list = await screen.findByRole('list', { name: 'Chords in a major key' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
    // The chords' roots are the scale: naming them would answer the prompt.
    expect(list).not.toHaveTextContent(/[A-G]/);
  });

  it('names the key’s chords once answered, at any level', async () => {
    panel(prompt(), { guideLevel: 1, answered: true });
    expect(await screen.findByRole('list', { name: 'Chords in F♯ major' })).toHaveTextContent(
      'G♯m',
    );
  });

  it('names them in the worked example, which shows the answer anyway', async () => {
    panel(prompt('degree:6@Eb'), { guideLevel: 0, guided: true });
    expect(await screen.findByRole('list', { name: 'Chords in E♭ major' })).toHaveTextContent('Cm');
  });

  it('leaves the key’s chords out of a chord’s panel', () => {
    panel(prompt('spell-chord:m7@B'), { guideLevel: 3, answered: true });
    expect(chords()).toBeNull();
  });
});
