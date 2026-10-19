import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D38Answer, D38Prompt } from './logic';
import type * as views from './views';
import { SKILLS } from '../../engine/skills';
import { D38_ID, D38_SCOPE, d38CanTest, d38ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d38-build-the-chord', (l: typeof logic) => ({
  makePrompt: l.d38MakePrompt,
  check: l.d38Check,
  describeAnswer: l.d38DescribeAnswer,
  gradedResponseMs: l.d38GradedResponseMs,
  sounds: l.d38Sounds,
  feedbackPositions: l.d38FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d38-build-the-chord', lazy);

const buildTheChord: DrillType<D38Prompt, D38Answer> = {
  id: D38_ID,
  title: 'Build the chord',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D38_ID)).map((s) => s.id),
  inputModes: ['tap'],
  scope: D38_SCOPE,
  canTest: d38CanTest,
  conceptOf: d38ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default buildTheChord;
