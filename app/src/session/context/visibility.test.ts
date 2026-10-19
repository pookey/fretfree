import { describe, expect, it } from 'vitest';
import { contextPanelShown } from './visibility';

describe('contextPanelShown', () => {
  it('hides the panel at guide level 0, open or not', () => {
    expect(contextPanelShown(true, 0)).toBe(false);
    expect(contextPanelShown(false, 0)).toBe(false);
  });

  it('shows it at levels 1–3 while help is open', () => {
    for (const level of [1, 2, 3] as const) expect(contextPanelShown(true, level)).toBe(true);
  });

  it('hides it whenever the learner has closed help', () => {
    for (const level of [1, 2, 3] as const) expect(contextPanelShown(false, level)).toBe(false);
  });
});
