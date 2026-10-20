import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D16Answer, D16Prompt } from './logic';
import type * as views from './views';
import { D16_ID, D16_SCOPE, d16CanTest, d16ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d16-play-note', (l: typeof logic) => ({
  makePrompt: l.d16MakePrompt,
  check: l.d16Check,
  describeAnswer: l.d16DescribeAnswer,
  sounds: l.d16Sounds,
  feedbackPositions: l.d16FeedbackPositions,
  gradedResponseMs: l.d16GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d16-play-note', lazy);

const playTheNote: DrillType<D16Prompt, D16Answer> = {
  id: D16_ID,
  title: 'Play the note',
  // Every skill that names this drill (F2 and C2 notes, C1 octave shapes).
  skills: SKILLS.filter((s) => s.drillTypes.includes(D16_ID)).map((s) => s.id),
  inputModes: ['mic'],
  // Served only in mic mode (design §9): the picker skips it otherwise.
  requiresMic: true,
  scope: D16_SCOPE,
  canTest: d16CanTest,
  conceptOf: d16ConceptOf,
  logic: lazy,
  render: parts.render,
};

export default playTheNote;
