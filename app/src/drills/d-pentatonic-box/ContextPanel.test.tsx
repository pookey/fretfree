import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { STANDARD_TUNING } from '../../theory';
import { BoxChainPanel } from './ContextPanel';
import pentatonicBox from './drill';
import { dpbCheck, dpbMakePrompt, type DpbPrompt } from './logic';

const prompt = (id = 'penta-box:1@minor') =>
  dpbMakePrompt(
    { id, skillId: 'C7.minor-boxes' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng: () => 0 },
  );

function panel(
  p: DpbPrompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answered?: boolean } = {},
) {
  return render(
    <BoxChainPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answered ? { answer: [], result: dpbCheck(p, []) } : null}
    />,
  );
}

const current = () =>
  [...document.querySelectorAll('td[aria-current="true"]')].map((td) => td.textContent);

describe('<BoxChainPanel>', () => {
  it('is the plugin’s context panel, loaded on first use', async () => {
    const Panel = pentatonicBox.contextPanel!;
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
    expect(await screen.findByRole('heading', { name: 'Cm pentatonic boxes' })).toBeVisible();
  });

  it('marks the asked box, and keeps the shapes back below guide level 2', () => {
    panel(prompt(), 1);
    expect(current()).toEqual(['1']);
    expect(screen.queryByRole('rowheader', { name: 'Shape' })).not.toBeInTheDocument();
    expect(screen.queryByText(/chain starts again/)).not.toBeInTheDocument();
  });

  it('pairs each box with its shape once the hint shows or the box is answered', () => {
    const { unmount } = panel(prompt(), 2);
    expect(screen.getByRole('rowheader', { name: 'Shape' })).toBeVisible();
    expect(current()).toEqual(['1', 'E']);
    unmount();
    panel(prompt(), 0, { answered: true });
    expect(screen.getByRole('row', { name: /Shape/ })).toHaveTextContent('ShapeEDCAG');
  });

  it('says how the boxes chain at full guides', () => {
    panel(prompt(), 0, { guided: true });
    expect(screen.getByText(/After box 5 the chain starts again at box 1/)).toBeVisible();
  });

  it('names the relative box only once answered', () => {
    const p = prompt('penta-relative:1@minor');
    const { unmount } = panel(p, 3);
    expect(screen.queryByTestId('dpb-relative')).not.toBeInTheDocument();
    unmount();
    panel(p, 1, { answered: true });
    expect(screen.getByTestId('dpb-relative')).toHaveTextContent(
      'Cm box 1 is D♯ major box 5: the same notes at the same frets.',
    );
  });
});
