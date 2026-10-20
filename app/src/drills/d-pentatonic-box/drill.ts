import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { DpbAnswer, DpbPrompt } from './logic';
import type * as views from './views';
import { DPB_ID, DPB_SCOPE, dpbCanTest, dpbConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d-pentatonic-box', (l: typeof logic) => ({
  makePrompt: l.dpbMakePrompt,
  check: l.dpbCheck,
  describeAnswer: l.dpbDescribeAnswer,
  gradedResponseMs: l.dpbGradedResponseMs,
  sounds: l.dpbSounds,
  feedbackPositions: l.dpbFeedbackPositions,
}));
const parts = lazyParts<typeof views>('d-pentatonic-box', lazy);

const pentatonicBox: DrillType<DpbPrompt, DpbAnswer> = {
  id: DPB_ID,
  title: 'Overlay the pentatonic box on its shape',
  skills: ['C7.minor-boxes', 'C7.major-boxes', 'C7.relative'],
  inputModes: ['tap'],
  scope: DPB_SCOPE,
  canTest: dpbCanTest,
  conceptOf: dpbConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default pentatonicBox;
