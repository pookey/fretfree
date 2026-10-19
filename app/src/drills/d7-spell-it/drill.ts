import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D7Answer, D7Prompt } from './logic';
import type * as views from './views';
import { D7_ID, D7_SCOPE, d7CanTest, d7ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d7-spell-it', (l: typeof logic) => ({
  makePrompt: l.d7MakePrompt,
  check: l.d7Check,
  describeAnswer: l.d7DescribeAnswer,
  sounds: l.d7Sounds,
  gradedResponseMs: l.d7GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d7-spell-it', lazy);

const spellIt: DrillType<D7Prompt, D7Answer> = {
  id: D7_ID,
  title: 'Spell the key or chord',
  // Every skill that names this drill: C4 now, and C5's chord skills when
  // they list `spell-it` with `spell-chord:` items, without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D7_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D7_SCOPE,
  canTest: d7CanTest,
  conceptOf: d7ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default spellIt;
