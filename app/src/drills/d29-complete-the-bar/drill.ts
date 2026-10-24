import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D29Answer, D29Prompt } from './logic';
import type * as views from './views';
import { D29_ID, D29_SCOPE, d29CanTest, d29ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d29-complete-the-bar', (l: typeof logic) => ({
  makePrompt: l.d29MakePrompt,
  check: l.d29Check,
  describeAnswer: l.d29DescribeAnswer,
  sounds: l.d29Sounds,
  gradedResponseMs: l.d29GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d29-complete-the-bar', lazy);

const completeTheBar: DrillType<D29Prompt, D29Answer> = {
  id: D29_ID,
  title: 'Complete the bar',
  // Every skill that names this drill (T1, T2), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D29_ID)).map((s) => s.id),
  inputModes: ['tap', 'keyboard'],
  scope: D29_SCOPE,
  canTest: d29CanTest,
  conceptOf: d29ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default completeTheBar;
