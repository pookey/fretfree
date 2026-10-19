import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import { SKILLS } from '../../engine/skills';
import {
  D38_ID,
  D38_SCOPE,
  d38CanTest,
  d38Check,
  d38ConceptOf,
  d38DescribeAnswer,
  d38FeedbackPositions,
  d38GradedResponseMs,
  d38MakePrompt,
  d38Sounds,
  type D38Answer,
  type D38Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d38-build-the-chord');

const buildTheChord: DrillType<D38Prompt, D38Answer> = {
  id: D38_ID,
  title: 'Build the chord',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D38_ID)).map((s) => s.id),
  inputModes: ['tap'],
  scope: D38_SCOPE,
  canTest: d38CanTest,
  makePrompt: d38MakePrompt,
  check: d38Check,
  describeAnswer: d38DescribeAnswer,
  gradedResponseMs: d38GradedResponseMs,
  sounds: d38Sounds,
  feedbackPositions: d38FeedbackPositions,
  conceptOf: d38ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default buildTheChord;
