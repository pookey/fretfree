import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { DROP_D_TUNING, STANDARD_TUNING, type Tuning } from '../../theory';
import { CagedChainPanel } from './ContextPanel';
import buildCaged from './drill';
import { d9Check, d9MakePrompt, type D9Prompt } from './logic';

const prompt = (id = 'caged:A-shape@major', rng = () => 0) =>
  d9MakePrompt(
    { id, skillId: 'C6.major-shapes' },
    { tuning: STANDARD_TUNING, accidentalPref: 'sharp', scopeLevel: 0, rng },
  );

function panel(
  p: D9Prompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answered?: boolean; tuning?: Tuning } = {},
) {
  return render(
    <CagedChainPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={over.tuning ?? STANDARD_TUNING}
      feedback={over.answered ? { answer: [], result: d9Check(p, []) } : null}
    />,
  );
}

const map = () => screen.queryByTestId('caged-chain-map');

describe('<CagedChainPanel>', () => {
  it('is the D9 plugin’s context panel', () => {
    expect(buildCaged.contextPanel).toBe(CagedChainPanel);
  });

  it('shows the chain order with the asked shape marked, and no positions, before an answer', async () => {
    panel(prompt(), 3);
    expect(screen.getByRole('heading', { name: 'CAGED chain' })).toBeInTheDocument();
    const order = screen.getByRole('list', { name: 'CAGED order' });
    expect(
      within(order)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['C', 'A', 'G', 'E', 'D']);
    expect(within(order).getByRole('listitem', { current: true })).toHaveTextContent('A');
    // Where the shape sits is the answer (rule 4): no mini-map yet.
    await Promise.resolve();
    expect(map()).toBeNull();
    expect(screen.getByText(/After D, the chain starts again at C/)).toBeInTheDocument();
  });

  it('drops the level-3 tip at lower levels', () => {
    panel(prompt(), 1);
    expect(screen.queryByText(/After D/)).toBeNull();
  });

  it('places the built shape among its neighbours once answered, from level 2', async () => {
    const p = prompt();
    panel(p, 2, { answered: true });
    expect(await screen.findByTestId('caged-chain-map')).toHaveAccessibleName(
      new RegExp(`^CAGED chain of ${p.chord}: .* The A shape is marked\\.$`),
    );
    expect(screen.getByText(`The five shapes of ${p.chord} up the neck.`)).toBeInTheDocument();
  });

  it('keeps the mini-map back at level 1 even once answered (rule 9)', async () => {
    panel(prompt(), 1, { answered: true });
    await Promise.resolve();
    expect(map()).toBeNull();
  });

  it('shows the mini-map in the worked example, which shows the shape anyway', async () => {
    panel(prompt('caged-core:E-shape@minor'), 0, { guided: true });
    expect(await screen.findByTestId('caged-chain-map')).toHaveAccessibleName(
      /The E shape is marked/,
    );
  });

  it('says the mini-map is in standard tuning when the neck is not', async () => {
    panel(prompt(), 3, { answered: true, tuning: DROP_D_TUNING });
    await screen.findByTestId('caged-chain-map');
    expect(screen.getByText(/up the neck, in standard tuning\./)).toBeInTheDocument();
  });
});
