import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  DPB_ID,
  DPB_SCOPE,
  dpbCanTest,
  dpbCheck,
  dpbConceptOf,
  dpbDescribeAnswer,
  dpbFeedbackPositions,
  dpbGradedResponseMs,
  dpbMakePrompt,
  dpbSounds,
  type DpbAnswer,
  type DpbPrompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d-pentatonic-box');

const pentatonicBox: DrillType<DpbPrompt, DpbAnswer> = {
  id: DPB_ID,
  title: 'Overlay the pentatonic box on its shape',
  skills: ['C7.minor-boxes', 'C7.major-boxes', 'C7.relative'],
  inputModes: ['tap'],
  scope: DPB_SCOPE,
  canTest: dpbCanTest,
  makePrompt: dpbMakePrompt,
  check: dpbCheck,
  describeAnswer: dpbDescribeAnswer,
  gradedResponseMs: dpbGradedResponseMs,
  sounds: dpbSounds,
  feedbackPositions: dpbFeedbackPositions,
  conceptOf: dpbConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default pentatonicBox;
