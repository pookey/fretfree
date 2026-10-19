import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D17Answer, D17Prompt } from './logic';
import type * as views from './views';
import { D17_ID, D17_SCOPE, d17CanTest, d17ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d17-play-sequence', (l: typeof logic) => ({
  makePrompt: l.d17MakePrompt,
  check: l.d17Check,
  describeAnswer: l.d17DescribeAnswer,
  sounds: l.d17Sounds,
  feedbackPositions: l.d17FeedbackPositions,
  gradedResponseMs: l.d17GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d17-play-sequence', lazy);

const playSequence: DrillType<D17Prompt, D17Answer> = {
  id: D17_ID,
  title: 'Play it on your guitar',
  // Every skill that names this drill (C3 intervals, C4 keys, C5 chords).
  skills: SKILLS.filter((s) => s.drillTypes.includes(D17_ID)).map((s) => s.id),
  inputModes: ['mic'],
  // Served only in mic mode (design §9): the picker skips it otherwise.
  requiresMic: true,
  scope: D17_SCOPE,
  canTest: d17CanTest,
  conceptOf: d17ConceptOf,
  logic: lazy,
  render: parts.render,
};

export default playSequence;
