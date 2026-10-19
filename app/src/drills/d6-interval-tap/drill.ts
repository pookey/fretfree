import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D6Answer, D6Prompt } from './logic';
import type * as views from './views';
import { D6_ID, D6_SCOPE, d6CanTest, d6ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d6-interval-tap', (l: typeof logic) => ({
  makePrompt: l.d6MakePrompt,
  check: l.d6Check,
  describeAnswer: l.d6DescribeAnswer,
  sounds: l.d6Sounds,
  feedbackPositions: l.d6FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d6-interval-tap', lazy);

const intervalTap: DrillType<D6Prompt, D6Answer> = {
  id: D6_ID,
  title: 'Tap the interval',
  skills: ['C3.thirds', 'C3.fourths-fifths', 'C3.sevenths', 'C3.sixths', 'C3.seconds'],
  inputModes: ['tap', 'keyboard'],
  scope: D6_SCOPE,
  canTest: d6CanTest,
  conceptOf: d6ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default intervalTap;
