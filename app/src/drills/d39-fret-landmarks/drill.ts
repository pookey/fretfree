import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D39Answer, D39Prompt } from './logic';
import type * as views from './views';
import { D39_ID, D39_SCOPE, d39CanTest, d39ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d39-fret-landmarks', (l: typeof logic) => ({
  makePrompt: l.d39MakePrompt,
  check: l.d39Check,
  describeAnswer: l.d39DescribeAnswer,
  sounds: l.d39Sounds,
  feedbackPositions: l.d39FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d39-fret-landmarks', lazy);

const fretLandmarks: DrillType<D39Prompt, D39Answer> = {
  id: D39_ID,
  title: 'Fret landmarks',
  skills: ['F3.markers', 'F3.repeat-12'],
  inputModes: ['choice', 'tap', 'keyboard'],
  scope: D39_SCOPE,
  canTest: d39CanTest,
  conceptOf: d39ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default fretLandmarks;
