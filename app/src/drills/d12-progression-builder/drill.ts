import { SKILLS } from '../../engine/skills';
import { lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as views from './views';
import {
  D12_ID,
  D12_SCOPE,
  d12CanTest,
  d12Check,
  d12ConceptOf,
  d12DescribeAnswer,
  d12GradedResponseMs,
  d12MakePrompt,
  d12Sounds,
  type D12Answer,
  type D12Prompt,
} from './logic';

// Lazy: the views stay out of first-load JS (design §10).
const parts = lazyParts<typeof views>('d12-progression-builder');

const progressionBuilder: DrillType<D12Prompt, D12Answer> = {
  id: D12_ID,
  title: 'Progression builder',
  // Every skill that names this drill: C9 now, and C10's transposition
  // skills if they list `progression-builder`, without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D12_ID)).map((s) => s.id),
  inputModes: ['tap', 'keyboard'],
  scope: D12_SCOPE,
  canTest: d12CanTest,
  makePrompt: d12MakePrompt,
  check: d12Check,
  describeAnswer: d12DescribeAnswer,
  sounds: d12Sounds,
  gradedResponseMs: d12GradedResponseMs,
  conceptOf: d12ConceptOf,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default progressionBuilder;
