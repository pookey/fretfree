import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING, type Position } from '../../theory';
import { IntervalTapContextPanel } from './ContextPanel';
import intervalTap from './drill';
import { d6Check, d6MakePrompt, type D6Prompt } from './logic';

const prompt = (id: string) =>
  d6MakePrompt(
    { id, skillId: 'C3.thirds' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 4.5 / 12 },
  );

function panel(
  p: D6Prompt,
  over: { guideLevel?: GuideLevel; guided?: boolean; answer?: Position } = {},
) {
  return render(
    <IntervalTapContextPanel
      prompt={p}
      guideLevel={over.guideLevel ?? 3}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answer ? { answer: over.answer, result: d6Check(p, over.answer) } : null}
    />,
  );
}

describe('<IntervalTapContextPanel>', () => {
  it('is the D6 plugin’s context panel', () => {
    expect(intervalTap.contextPanel).toBe(IntervalTapContextPanel);
  });

  it('names the interval and its size, with the G–B rule from level 2', () => {
    const { container } = panel(prompt('interval:m7@s6→s4'), { guideLevel: 2 });
    expect(screen.getByRole('heading')).toHaveTextContent('Minor 7th');
    expect(container).toHaveTextContent('10 half steps: 10 frets along one string.');
    expect(container).toHaveTextContent('G and B');
  });

  it('drops the G–B rule at level 1, but not in the worked example', () => {
    const one = panel(prompt('interval:m7@s6→s4'), { guideLevel: 1 });
    expect(one.container).not.toHaveTextContent('G and B');
    one.unmount();
    const guided = panel(prompt('interval:m7@s6→s4'), { guideLevel: 1, guided: true });
    expect(guided.container).toHaveTextContent('G and B');
  });

  it('never says where the answer lands, even once answered', () => {
    const p = prompt('interval:M3@s6→s5');
    const { container } = panel(p, { answer: p.shapeTarget });
    expect(container).toHaveTextContent('Major 3rd');
    expect(container).not.toHaveTextContent(/fret \d+ on string/);
  });
});
