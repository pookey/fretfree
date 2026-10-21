import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SKILLS, type SkillStatus } from '../../../engine';
import { DRILLS } from '../../../drills/registry';
import { getDb } from '../../../storage';
import { Card } from './stats';

/** The items of `skillId` a registered drill can test. */
const servable = (skillId: string) => {
  const s = SKILLS.find((k) => k.id === skillId)!;
  return s.items().filter((i) => DRILLS.some((d) => s.drillTypes.includes(d.id) && d.canTest(i)))
    .length;
};

/** Every skill mastered but `open`, which gets the given statuses (or none). */
async function seed(open: Record<string, SkillStatus | null>): Promise<void> {
  const states = SKILLS.filter((s) => open[s.id] !== null).map((s) => ({
    skillId: s.id,
    status: open[s.id] ?? ('mastered' as const),
    guideLevel: 0 as const,
    rollingAccuracy: 1,
  }));
  await getDb().skillStates.bulkPut(states);
}

async function newCount(): Promise<number> {
  render(<Card />);
  await waitFor(() => expect(screen.getByTestId('new-count')).toHaveTextContent(/^\d+$/));
  return Number(screen.getByTestId('new-count').textContent);
}

describe('Today stats', () => {
  beforeEach(async () => {
    await getDb().skillStates.clear();
  });

  it('counts a skill opened by a soft gate (M10-02)', async () => {
    // C5.triads is hard on C3.thirds (mastered) and soft on C4.sharp-keys.
    await seed({ 'C4.sharp-keys': 'practising', 'C5.triads': null });
    expect(servable('C5.triads')).toBeGreaterThan(0);
    expect(await newCount()).toBe(servable('C4.sharp-keys') + servable('C5.triads'));
  });

  it('leaves out a skill whose soft gate is not met yet', async () => {
    // The sharp keys are open but not practised, so triads stay locked.
    await seed({ 'C4.sharp-keys': null, 'C5.triads': null });
    expect(await newCount()).toBe(servable('C4.sharp-keys'));
  });
});
