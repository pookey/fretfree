import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D9Answer, D9Prompt } from './logic';
import type * as views from './views';
import { D9_ID, D9_SCOPE, d9CanTest, d9ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d9-build-caged', (l: typeof logic) => ({
  makePrompt: l.d9MakePrompt,
  check: l.d9Check,
  describeAnswer: l.d9DescribeAnswer,
  gradedResponseMs: l.d9GradedResponseMs,
  sounds: l.d9Sounds,
  feedbackPositions: l.d9FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d9-build-caged', lazy);

const buildCaged: DrillType<D9Prompt, D9Answer> = {
  id: D9_ID,
  title: 'Build the CAGED shape at a root',
  skills: [
    'C6.triad-cores',
    'C6.major-shapes',
    'C6.minor-cores',
    'C6.minor-shapes',
    'C6.dominant7-shapes',
  ],
  inputModes: ['tap'],
  scope: D9_SCOPE,
  canTest: d9CanTest,
  conceptOf: d9ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default buildCaged;
