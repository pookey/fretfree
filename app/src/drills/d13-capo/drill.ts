import { SKILLS } from '../../engine/skills';
import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D13_ID,
  D13_SCOPE,
  d13CanTest,
  d13Check,
  d13ConceptOf,
  d13DescribeAnswer,
  d13MakePrompt,
  d13Sounds,
  type D13Answer,
  type D13Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d13-capo');

const capo: DrillType<D13Prompt, D13Answer> = {
  id: D13_ID,
  title: 'Capo calculator',
  // Every skill that names this drill: C10's capo stages.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D13_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D13_SCOPE,
  canTest: d13CanTest,
  makePrompt: d13MakePrompt,
  check: d13Check,
  describeAnswer: d13DescribeAnswer,
  sounds: d13Sounds,
  conceptOf: d13ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default capo;
