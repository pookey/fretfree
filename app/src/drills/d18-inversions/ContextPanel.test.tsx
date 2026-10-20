import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { GuideLevel } from '../../engine/model';
import { DROP_D_TUNING, STANDARD_TUNING, type Tuning } from '../../theory';
import { resolveView } from '../lazy-view';
import { InversionsPanel } from './ContextPanel';
import triadInversions from './drill';
import { d18Check, d18MakePrompt, type D18Prompt } from './logic';

const prompt = (id: string, over: { tuning?: Tuning; rng?: () => number } = {}) =>
  d18MakePrompt(
    { id, skillId: 'I1.major-top-sets' },
    {
      tuning: over.tuning ?? STANDARD_TUNING,
      accidentalPref: 'sharp',
      scopeLevel: 0,
      rng: over.rng ?? (() => 0),
    },
  );

function panel(
  p: D18Prompt,
  guideLevel: GuideLevel,
  over: { guided?: boolean; answered?: boolean } = {},
) {
  const answer = { kind: 'inversion', inversion: p.inversion } as const;
  return render(
    <InversionsPanel
      prompt={p}
      guideLevel={guideLevel}
      guided={over.guided ?? false}
      handedness="right"
      tuning={STANDARD_TUNING}
      feedback={over.answered ? { answer, result: d18Check(p, answer) } : null}
    />,
  );
}

const rows = () =>
  within(screen.getByRole('list', { name: 'Inversions' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent);
const current = () =>
  within(screen.getByRole('list', { name: 'Inversions' })).queryByRole('listitem', {
    current: true,
  });

describe('<InversionsPanel>', () => {
  // The first use imports every drill's views (one shared chunk), which can
  // take several seconds cold on a loaded machine.
  it('is the D18 plugin’s context panel, loaded on first use', async () => {
    expect(await resolveView(triadInversions.contextPanel!)).toBe(InversionsPanel);
  }, 30_000);

  it('lists the inversions with their degrees from guide level 2, the asked one marked', () => {
    panel(prompt('inversion:1@s3/minor'), 2);
    expect(rows()).toEqual(['Root positionR ♭3 5', '1st inversion♭3 5 R', '2nd inversion5 R ♭3']);
    expect(current()).toHaveTextContent('1st inversion');
    expect(screen.queryByTestId('d18-core')).toBeNull();
  });

  it('drops the degrees at guide level 1 (rule 9)', () => {
    panel(prompt('inversion:1@s3/major'), 1);
    expect(rows()).toEqual(['Root position', '1st inversion', '2nd inversion']);
  });

  it('keeps a name card’s answer unmarked until it is answered (rule 4)', () => {
    const p = prompt('inversion-name:2@s3/major');
    const { unmount } = panel(p, 3);
    expect(current()).toBeNull();
    expect(screen.getByText(/moves the lowest note up/)).toBeInTheDocument();
    unmount();
    panel(p, 1, { answered: true });
    expect(current()).toHaveTextContent('2nd inversion');
    expect(rows()[2]).toBe('2nd inversion5 R 3');
    expect(screen.getByTestId('d18-core')).toHaveTextContent(
      'This triad sits inside the C shape of C.',
    );
  });

  it('names every CAGED shape the triad sits in, on a guided rep too', () => {
    const xs = [0, 0.99];
    let i = 0;
    const high = prompt('inversion:2@s3/major', { rng: () => xs[i++] ?? 0 });
    panel(high, 1, { guided: true });
    expect(screen.getByTestId('d18-core')).toHaveTextContent(
      'This triad sits inside the C and D shapes of C.',
    );
  });

  it('names no shape when the set is tuned away from standard', () => {
    panel(prompt('inversion:0@s6/major', { tuning: DROP_D_TUNING }), 1, { answered: true });
    expect(screen.queryByTestId('d18-core')).toBeNull();
  });
});
