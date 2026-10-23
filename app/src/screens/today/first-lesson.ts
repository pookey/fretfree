import {
  buildSession,
  createScheduler,
  deriveStatus,
  isFrontier,
  type Item,
  type SessionLane,
  type Settings,
  type Skill,
  type SkillStatus,
} from '../../engine';
import { frontierLanes, orderFrontier } from '../../engine/frontier';
import { keepLeadLane, leadWithSound, startWithSoundSkills } from '../../engine/start-with-sound';
import { overlayStatus, type StatusOverlay } from '../../engine/overlay';
import type { AnyDrillType } from '../../drills/types';
import { createDrillPicker } from '../../session/drill-picker';

type LessonSettings = Pick<
  Settings,
  'goal' | 'startWithSound' | 'micEnabled' | 'soundOn' | 'sessionMinutes'
>;

/**
 * The skill a learner's very first session (no cards yet) opens with
 * (M10-15), so Today can say what to expect before the first tap. It builds
 * the lanes as `SessionRunner.start` does (frontier skills under the gates
 * and "start with sound", in goal order, led by the ear track while that
 * leads and sound is on, only items a drill can serve) and plans the session the same way,
 * so the lane quotas decide which comes first. `overlay` is the development
 * build's status overlay, applied as the runner applies it. `null` when
 * nothing is open.
 */
export function firstLessonSkill(
  skills: readonly Skill[],
  drills: readonly AnyDrillType[],
  settings: LessonSettings,
  stored: ReadonlyMap<string, SkillStatus>,
  now: Date,
  overlay?: StatusOverlay | null,
): Skill | null {
  const picker = createDrillPicker(skills, drills, {
    micEnabled: settings.micEnabled,
    soundOn: settings.soundOn,
  });
  const statuses = new Map(stored);
  const frontier: Skill[] = [];
  for (const skill of startWithSoundSkills(skills, settings.startWithSound)) {
    const status = deriveStatus(skill, statuses, statuses.get(skill.id));
    statuses.set(skill.id, status);
    if (isFrontier(overlayStatus(status, overlay))) frontier.push(skill);
  }
  const itemsOf = (ss: readonly Skill[]): Item[] =>
    ss.flatMap((skill) => skill.items().filter((item) => picker.canServe(item)));
  const ordered = orderFrontier(frontier, settings.goal);
  const led = leadWithSound(ordered, settings.startWithSound && settings.soundOn, statuses);
  const lanes: SessionLane[] = led.some((skill, i) => skill !== ordered[i])
    ? [{ id: 'lead', share: 1, items: itemsOf(led) }]
    : keepLeadLane(
        frontierLanes(frontier, settings.goal, { firstSession: true }),
        settings.startWithSound,
      ).map((lane) => ({
        id: lane.id,
        share: lane.share,
        items: itemsOf(lane.skills),
        ...(lane.group !== undefined ? { group: lane.group } : {}),
      }));
  const [first] = buildSession({
    now,
    minutes: settings.sessionMinutes,
    cards: [],
    lanes,
    scheduler: createScheduler(),
  });
  return skills.find((s) => s.id === first?.skillId) ?? null;
}
