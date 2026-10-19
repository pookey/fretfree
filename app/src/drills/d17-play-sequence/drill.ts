import { SKILLS } from '../../engine/skills';
import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D17_ID,
  D17_SCOPE,
  d17CanTest,
  d17Check,
  d17ConceptOf,
  d17DescribeAnswer,
  d17FeedbackPositions,
  d17GradedResponseMs,
  d17MakePrompt,
  d17Sounds,
  type D17Answer,
  type D17Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d17-play-sequence');

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
  makePrompt: d17MakePrompt,
  check: d17Check,
  describeAnswer: d17DescribeAnswer,
  sounds: d17Sounds,
  feedbackPositions: d17FeedbackPositions,
  gradedResponseMs: d17GradedResponseMs,
  conceptOf: d17ConceptOf,
  render: parts.render,
};

export default playSequence;
