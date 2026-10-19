import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import { SKILLS } from '../../engine/skills';
import {
  D36_ID,
  D36_SCOPE,
  d36CanTest,
  d36Check,
  d36ConceptOf,
  d36DescribeAnswer,
  d36GradedResponseMs,
  d36MakePrompt,
  d36Sounds,
  type D36Answer,
  type D36Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d36-name-the-chord');

const nameTheChord: DrillType<D36Prompt, D36Answer> = {
  id: D36_ID,
  title: 'What chord is this?',
  skills: SKILLS.filter((s) => s.drillTypes.includes(D36_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D36_SCOPE,
  canTest: d36CanTest,
  makePrompt: d36MakePrompt,
  check: d36Check,
  describeAnswer: d36DescribeAnswer,
  sounds: d36Sounds,
  gradedResponseMs: d36GradedResponseMs,
  conceptOf: d36ConceptOf,
  render: parts.render,
};

export default nameTheChord;
