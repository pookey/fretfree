import { SKILLS } from '../../engine/skills';
import { lazyView } from '../lazy-view';
import type { DrillType } from '../types';
import {
  D7_ID,
  D7_SCOPE,
  d7CanTest,
  d7Check,
  d7ConceptOf,
  d7DescribeAnswer,
  d7GradedResponseMs,
  d7MakePrompt,
  d7Sounds,
  type D7Answer,
  type D7Prompt,
} from './logic';

const spellIt: DrillType<D7Prompt, D7Answer> = {
  id: D7_ID,
  title: 'Spell the key or chord',
  // Every skill that names this drill: C4 now, and C5's chord skills when
  // they list `spell-it` with `spell-chord:` items, without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D7_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: D7_SCOPE,
  canTest: d7CanTest,
  makePrompt: d7MakePrompt,
  check: d7Check,
  describeAnswer: d7DescribeAnswer,
  sounds: d7Sounds,
  gradedResponseMs: d7GradedResponseMs,
  conceptOf: d7ConceptOf,
  render: lazyView(() => import('./D7View').then((m) => m.D7View)),
  contextPanel: lazyView(() => import('./ContextPanel').then((m) => m.SpellingContextPanel)),
};

export default spellIt;
