import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D21Answer, D21Prompt } from './logic';
import type * as views from './views';
import { D21_ID, D21_SCOPE, d21CanTest, d21ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d21-visualise', (l: typeof logic) => ({
  makePrompt: l.d21MakePrompt,
  check: l.d21Check,
  describeAnswer: l.d21DescribeAnswer,
  gradedResponseMs: l.d21GradedResponseMs,
  sounds: l.d21Sounds,
  feedbackPositions: l.d21FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d21-visualise', lazy);

const visualise: DrillType<D21Prompt, D21Answer> = {
  id: D21_ID,
  title: 'Visualise it',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D21_ID)).map((s) => s.id),
  inputModes: ['tap'],
  mental: true,
  scope: D21_SCOPE,
  canTest: d21CanTest,
  conceptOf: d21ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default visualise;
