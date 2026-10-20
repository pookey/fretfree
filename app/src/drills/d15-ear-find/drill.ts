import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D15Answer, D15Prompt } from './logic';
import type * as views from './views';
import { D15_ID, D15_SCOPE, d15CanTest, d15ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d15-ear-find', (l: typeof logic) => ({
  makePrompt: l.d15MakePrompt,
  check: l.d15Check,
  describeAnswer: l.d15DescribeAnswer,
  sounds: l.d15Sounds,
  feedbackPositions: l.d15FeedbackPositions,
  gradedResponseMs: l.d15GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d15-ear-find', lazy);

const hearItFindIt: DrillType<D15Prompt, D15Answer> = {
  id: D15_ID,
  title: 'Hear it, find it',
  // Every skill that names this drill (C2's find cards).
  skills: SKILLS.filter((s) => s.drillTypes.includes(D15_ID)).map((s) => s.id),
  inputModes: ['tap', 'keyboard'],
  scope: D15_SCOPE,
  canTest: d15CanTest,
  conceptOf: d15ConceptOf,
  logic: lazy,
  render: parts.render,
};

export default hearItFindIt;
