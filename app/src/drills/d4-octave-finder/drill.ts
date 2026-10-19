import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D4Answer, D4Prompt } from './logic';
import type * as views from './views';
import { D4_ID, D4_SCOPE, d4CanTest, d4ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d4-octave-finder', (l: typeof logic) => ({
  makePrompt: l.d4MakePrompt,
  check: l.d4Check,
  describeAnswer: l.d4DescribeAnswer,
  gradedResponseMs: l.d4GradedResponseMs,
  sounds: l.d4Sounds,
  feedbackPositions: l.d4FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d4-octave-finder', lazy);

const octaveFinder: DrillType<D4Prompt, D4Answer> = {
  id: D4_ID,
  title: 'Octave finder',
  skills: ['C1.octaves', 'C1.octaves-gb-shift', 'C1.double-octaves', 'C1.every-octave'],
  inputModes: ['tap'],
  scope: D4_SCOPE,
  canTest: d4CanTest,
  conceptOf: d4ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default octaveFinder;
