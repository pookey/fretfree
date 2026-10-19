import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D3Answer, D3Prompt } from './logic';
import type * as views from './views';
import { D3_ID, D3_SCOPE, d3CanTest, d3ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d3-note-wheel', (l: typeof logic) => ({
  makePrompt: l.d3MakePrompt,
  check: l.d3Check,
  describeAnswer: l.d3DescribeAnswer,
  sounds: l.d3Sounds,
  feedbackPositions: l.d3FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d3-note-wheel', lazy);

const noteWheel: DrillType<D3Prompt, D3Answer> = {
  id: D3_ID,
  title: 'Note-wheel steps',
  skills: ['F1.alphabet', 'F1.b-c-e-f', 'F1.half-steps', 'F1.whole-steps'],
  inputModes: ['choice', 'tap', 'keyboard'],
  scope: D3_SCOPE,
  canTest: d3CanTest,
  conceptOf: d3ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default noteWheel;
