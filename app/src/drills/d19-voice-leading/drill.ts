import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D19Answer, D19Prompt } from './logic';
import type * as views from './views';
import { D19_ID, D19_SCOPE, d19CanTest, d19ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d19-voice-leading', (l: typeof logic) => ({
  makePrompt: l.d19MakePrompt,
  check: l.d19Check,
  describeAnswer: l.d19DescribeAnswer,
  gradedResponseMs: l.d19GradedResponseMs,
  sounds: l.d19Sounds,
  feedbackPositions: l.d19FeedbackPositions,
}));
const parts = lazyParts<typeof views>('d19-voice-leading', lazy);

const voiceLeading: DrillType<D19Prompt, D19Answer> = {
  id: D19_ID,
  title: 'Voice-leading puzzle',
  skills: ['I1.voice-leading-top-sets', 'I1.voice-leading-low-sets'],
  inputModes: ['tap'],
  scope: D19_SCOPE,
  canTest: d19CanTest,
  conceptOf: d19ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default voiceLeading;
