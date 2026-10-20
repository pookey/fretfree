import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { DpbAnswer, PentaPrompt } from './logic';
import type * as views from './views';
import { DPB_ID, DPB_SCOPE, dpbCanTest, dpbConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d-pentatonic-box', (l: typeof logic) => ({
  makePrompt: l.pentaMakePrompt,
  check: l.pentaCheck,
  describeAnswer: l.dpbDescribeAnswer,
  gradedResponseMs: l.pentaGradedResponseMs,
  sounds: l.pentaSounds,
  feedbackPositions: l.pentaFeedbackPositions,
}));
const parts = lazyParts<typeof views>('d-pentatonic-box', lazy);

const pentatonicBox: DrillType<PentaPrompt, DpbAnswer> = {
  id: DPB_ID,
  title: 'Build the box or scale position on the neck',
  skills: [
    'C7.minor-boxes',
    'C7.major-boxes',
    'C7.relative',
    'I7.positions',
    'I7.root-runs',
    'I7.degree-runs',
  ],
  inputModes: ['tap'],
  scope: DPB_SCOPE,
  canTest: dpbCanTest,
  conceptOf: dpbConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default pentatonicBox;
