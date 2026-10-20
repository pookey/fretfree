import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { DfAnswer, DfPrompt } from './logic';
import type * as views from './views';
import { DF_ID, DF_SCOPE, dfCanTest, dfConceptOf } from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d-function', (l: typeof logic) => ({
  makePrompt: l.dfMakePrompt,
  check: l.dfCheck,
  describeAnswer: l.dfDescribeAnswer,
  sounds: l.dfSounds,
}));
const parts = lazyParts<typeof views>('d-function', lazy);

const fn: DrillType<DfPrompt, DfAnswer> = {
  id: DF_ID,
  title: 'Minor-key harmony and chord function',
  // Every skill that names this drill: I4's harmonic-minor and ii–V–i
  // stages and all of I5.
  skills: SKILLS.filter((s) => s.drillTypes.includes(DF_ID)).map((s) => s.id),
  inputModes: ['choice', 'keyboard'],
  scope: DF_SCOPE,
  canTest: dfCanTest,
  conceptOf: dfConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default fn;
