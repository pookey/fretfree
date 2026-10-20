import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { D12Answer, D12Prompt } from './logic';
import type * as views from './views';
import { D12_ID, D12_SCOPE, d12CanTest, d12ConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d12-progression-builder', (l: typeof logic) => ({
  makePrompt: l.d12MakePrompt,
  check: l.d12Check,
  describeAnswer: l.d12DescribeAnswer,
  sounds: l.d12Sounds,
  gradedResponseMs: l.d12GradedResponseMs,
}));
const parts = lazyParts<typeof views>('d12-progression-builder', lazy);

const progressionBuilder: DrillType<D12Prompt, D12Answer> = {
  id: D12_ID,
  title: 'Progression builder',
  // Every skill that names this drill: C9 now, and C10's transposition
  // skills if they list `progression-builder`, without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(D12_ID)).map((s) => s.id),
  inputModes: ['tap', 'keyboard'],
  scope: D12_SCOPE,
  canTest: d12CanTest,
  conceptOf: d12ConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default progressionBuilder;
