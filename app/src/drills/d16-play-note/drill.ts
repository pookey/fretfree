import { SKILLS } from '../../engine/skills';
import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D16_ID,
  D16_SCOPE,
  d16CanTest,
  d16Check,
  d16ConceptOf,
  d16DescribeAnswer,
  d16FeedbackPositions,
  d16GradedResponseMs,
  d16MakePrompt,
  d16Sounds,
  type D16Answer,
  type D16Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d16-play-note');

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
  makePrompt: d16MakePrompt,
  check: d16Check,
  describeAnswer: d16DescribeAnswer,
  sounds: d16Sounds,
  feedbackPositions: d16FeedbackPositions,
  gradedResponseMs: d16GradedResponseMs,
  conceptOf: d16ConceptOf,
  render: parts.render,
};

export default playTheNote;
