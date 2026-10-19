import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { LandmarksContextPanel } from './ContextPanel';
import fretLandmarks from './drill';
import { d39MakePrompt } from './logic';

const prompt = d39MakePrompt(
  { id: 'marker:f3', skillId: 'F3.markers' },
  { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
);

const panel = (guideLevel: GuideLevel, guided = false) =>
  render(
    <LandmarksContextPanel
      prompt={prompt}
      guideLevel={guideLevel}
      guided={guided}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={null}
    />,
  ).container;

describe('<LandmarksContextPanel>', () => {
  it('is the D39 plugin’s context panel', () => {
    expect(fretLandmarks.contextPanel).toBe(LandmarksContextPanel);
  });

  it('lists the markers, with the 12th-fret repeat from level 2', () => {
    const two = panel(2);
    expect(two).toHaveTextContent('Fret markers');
    expect(two).toHaveTextContent('Single dots at 3, 5, 7 and 9. A double dot at 12.');
    expect(two).toHaveTextContent(/pattern starts again/);
  });

  it('fades the repeat rule at level 1, but not in the worked example', () => {
    expect(panel(1)).not.toHaveTextContent(/pattern starts again/);
    expect(panel(1, true)).toHaveTextContent(/pattern starts again/);
  });
});
