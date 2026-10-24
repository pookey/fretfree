import { ENGINE_CONFIG } from '../../engine/config';
import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D27Answer, D27Prompt } from './logic';
import type * as views from './views';
import { D27_ID, D27_SCOPE, d27CanTest, d27ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d27-rhythm-reading', (l: typeof logic) => ({
  makePrompt: l.d27MakePrompt,
  check: l.d27Check,
  describeAnswer: l.d27DescribeAnswer,
  sounds: l.d27Sounds,
  gradedResponseMs: l.d27GradedResponseMs,
  rating: l.d27Rating,
}));
const parts = lazyParts<typeof views>('d27-rhythm-reading', lazy);

const rhythmReading: DrillType<D27Prompt, D27Answer> = {
  id: D27_ID,
  title: 'Rhythm reading',
  // Every R4 skill names this drill.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D27_ID)).map((s) => s.id),
  // The pad (pointer, Space or Enter), or a real guitar in mic mode.
  inputModes: ['tap', 'keyboard', 'mic'],
  // The click is the prompt, and a cell is heard before it is read: with sound off nothing can be timed.
  requiresSound: true,
  scope: D27_SCOPE,
  // The note-by-note marks are the feedback: keep a right answer's on screen.
  feedbackHoldMs: ENGINE_CONFIG.rhythmReading.feedbackHoldMs,
  canTest: d27CanTest,
  conceptOf: d27ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default rhythmReading;
