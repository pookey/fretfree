import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D18Answer, D18Prompt } from './logic';
import type * as views from './views';
import { D18_ID, D18_SCOPE, d18CanTest, d18ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d18-inversions', (l: typeof logic) => ({
  makePrompt: l.d18MakePrompt,
  check: l.d18Check,
  describeAnswer: l.d18DescribeAnswer,
  gradedResponseMs: l.d18GradedResponseMs,
  sounds: l.d18Sounds,
  feedbackPositions: l.d18FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d18-inversions', lazy);

const triadInversions: DrillType<D18Prompt, D18Answer> = {
  id: D18_ID,
  title: 'Triad inversions on a string set',
  skills: ['I1.major-top-sets', 'I1.major-low-sets', 'I1.minor-top-sets', 'I1.minor-low-sets'],
  // Build cards tap the neck; name cards pick an inversion, by button or key.
  inputModes: ['tap', 'choice', 'keyboard'],
  scope: D18_SCOPE,
  canTest: d18CanTest,
  conceptOf: d18ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default triadInversions;
