import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { resolveView } from '../lazy-view';
import { PicturePanel } from './ContextPanel';
import { D21View } from './D21View';
import visualise from './drill';
import { d21Check, d21MakePrompt, type D21Prompt } from './logic';

// rng 0 at scope 0: the A shape of C at fret 3.
const prompt = (id = 'caged:A-shape@major', rng = () => 0) =>
  d21MakePrompt(
    { id, skillId: 'C6.major-shapes' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

function panel(
  p: D21Prompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answered?: boolean } = {},
) {
  return render(
    <PicturePanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answered ? { answer: [], result: d21Check(p, []) } : null}
    />,
  );
}

const steps = () => screen.getAllByRole('listitem').map((li) => li.textContent);
const diagram = () => screen.queryByRole('img');

describe('<PicturePanel>', () => {
  // The first use imports every drill's views (one shared chunk), which can
  // take several seconds cold on a loaded machine.
  it('is the D21 plugin’s view and context panel, loaded on first use', async () => {
    expect(await resolveView(visualise.render)).toBe(D21View);
    expect(await resolveView(visualise.contextPanel!)).toBe(PicturePanel);
  }, 30_000);

  it('gives the method without saying where the notes are', () => {
    panel(prompt(), 2);
    expect(steps()).toEqual([
      'See the open A chord shape.',
      'Slide it up until its lowest fret is fret 3.',
      'Find every root in it, then tap them.',
    ]);
    expect(diagram()).toBeNull();
  });

  it('skips the slide in open position, and names the quality', () => {
    let rng = 0;
    let p = prompt('caged:E-shape@minor', () => rng);
    while (p.position !== 0) {
      rng += 0.01;
      p = prompt('caged:E-shape@minor', () => rng);
    }
    panel(p, 1);
    expect(steps()).toEqual([
      'See the open Em chord shape.',
      'Find every root in it, then tap them.',
    ]);
  });

  it('draws the open shape in plain dots at level 3, the picture to slide', () => {
    panel(prompt(), 3);
    const img = diagram();
    expect(img).toHaveAccessibleName(
      'The A shape in open position: x-0-2-2-2-0. Picture the A shape at fret 3.',
    );
    // No root is singled out: finding them is the question.
    expect(img!.querySelectorAll('[data-style="root"]')).toHaveLength(0);
  });

  it('draws the answer by degree once answered, from level 2', () => {
    panel(prompt(), 2, { answered: true });
    expect(diagram()).toHaveAccessibleName('the A shape of C at fret 3: x-3-5-5-5-3');
  });

  it('draws nothing more below level 2 after an answer, and the shape in a worked example', () => {
    const below = panel(prompt(), 1, { answered: true });
    expect(diagram()).toBeNull();
    below.unmount();
    panel(prompt(), 0, { guided: true });
    expect(diagram()).toHaveAccessibleName('the A shape of C at fret 3: x-3-5-5-5-3');
  });
});
