import { SKILLS } from '../../engine/skills';
import { lazyLogic, lazyParts } from '../lazy-view';
import type { DrillType } from '../types';
import type * as logic from './logic';
import type { SIAnswer, SIPrompt } from './logic';
import type * as views from './views';
import {
  STAFF_INTERVAL_ID,
  STAFF_INTERVAL_SCOPE,
  staffIntervalCanTest,
  staffIntervalConceptOf,
} from './meta';

// Lazy: the logic and views stay out of first-load JS (design §10).
const lazy = lazyLogic('d-staff-intervals', (l: typeof logic) => ({
  makePrompt: l.siMakePrompt,
  check: l.siCheck,
  describeAnswer: l.siDescribeAnswer,
  sounds: l.siSounds,
  feedbackPositions: l.siFeedbackPositions,
}));
const parts = lazyParts<typeof views>('d-staff-intervals', lazy);

const staffInterval: DrillType<SIPrompt, SIAnswer> = {
  id: STAFF_INTERVAL_ID,
  title: 'Name the step or skip',
  // Every skill that names this drill (R5), without editing this file.
  skills: SKILLS.filter((s) => s.drillTypes.includes(STAFF_INTERVAL_ID)).map((s) => s.id),
  inputModes: ['choice', 'tap', 'keyboard'],
  scope: STAFF_INTERVAL_SCOPE,
  canTest: staffIntervalCanTest,
  conceptOf: staffIntervalConceptOf,
  logic: lazy,
  render: parts.render,
  contextPanel: parts.contextPanel,
};

export default staffInterval;
