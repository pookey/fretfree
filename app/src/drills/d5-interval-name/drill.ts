import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D5Answer, D5Prompt } from './logic';
import type * as views from './views';
import { D5_ID, D5_SCOPE, d5CanTest, d5ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d5-interval-name', (l: typeof logic) => ({
  makePrompt: l.d5MakePrompt,
  check: l.d5Check,
  describeAnswer: l.d5DescribeAnswer,
  sounds: l.d5Sounds,
  feedbackPositions: l.d5FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d5-interval-name', lazy);

const intervalName: DrillType<D5Prompt, D5Answer> = {
  id: D5_ID,
  title: 'Name the interval from two dots',
  skills: ['C3.thirds', 'C3.fourths-fifths', 'C3.sevenths', 'C3.sixths', 'C3.seconds'],
  inputModes: ['choice', 'keyboard'],
  scope: D5_SCOPE,
  canTest: d5CanTest,
  conceptOf: d5ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default intervalName;
