import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
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

function panel(p: D7Prompt, over: { guideLevel?: GuideLevel; guided?: boolean } = {}) {
  return render(
    <SpellingContextPanel
      prompt={p}
      guideLevel={over.guideLevel ?? 3}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={null}
    />,
  );
}

describe('<SpellingContextPanel>', () => {
  it('is the D7 plugin’s context panel', () => {
    expect(spellIt.contextPanel).toBe(SpellingContextPanel);
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
});
