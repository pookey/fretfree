import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAppStore } from '../../app-store';
import {
  ENGINE_CONFIG,
  SKILLS,
  createScheduler,
  deriveStatus,
  isFrontier,
  sessionLength,
  type CardRecord,
  type Scheduler,
  type Skill,
  type SkillStatus,
} from '../../engine';
import { startWithSoundSkills } from '../../engine/start-with-sound';
import { DRILLS } from '../../drills/registry';
import type { AnyDrillType } from '../../drills/types';
import { createDrillPicker } from '../../session/drill-picker';
import { focusHref, type SessionFocus } from '../../session/focus';
import type { SessionOptions } from '../../session/options';
import { allCards, getDb, getSkillStates } from '../../storage';
import screens from '../screens.module.css';
import styles from './cards/quick-drills.module.css';

/**
 * "Ear only (no guitar)" (design §7 Today), the second quick drill: a short
 * session of the ear track alone, for when the guitar isn't to hand
 * (research/02 rule 14). It serves the ear skills' own cards (D14's sounds,
 * D15's `ear-find:` cards), never C2's named finds, which D15 also serves but
 * which aren't ear practice. Like the warm-up, it reviews what is due, and
 * with nothing due runs the ear frontier.
 *
 * A focus whose skills are all unknown is no focus, and the session would run
 * every skill (`session/focus.ts`). So the plan lists only real ear skills,
 * and offers no link at all until one of them is open or has a card due.
 */

export type EarOnlyPlan =
  | {
      kind: 'ready';
      /** Due ear reviews a drill can serve. */
      due: number;
      /** The ear skills, as a session focus (the link's URL). Never empty. */
      focus: SessionFocus;
      /** Route state for `/session`. */
      options: SessionOptions;
    }
  /** No ear skill is open yet, and none has a card due. */
  | { kind: 'not-yet' };

/**
 * The ear-only drill's plan, or null when there is no ear skill to serve.
 * Skills that list a mic drill are left out: this drill needs no guitar.
 * Gating is the runner's, "start with sound" included, over every skill.
 */
export function earOnlyPlan(
  skills: readonly Skill[],
  drills: readonly AnyDrillType[],
  cards: readonly CardRecord[],
  stored: ReadonlyMap<string, SkillStatus>,
  scheduler: Scheduler,
  now: Date,
  startWithSound: boolean,
  cfg = ENGINE_CONFIG.quickDrills,
): EarOnlyPlan | null {
  const topics: readonly string[] = cfg.earOnlyTopics;
  const needsMic = new Set(drills.filter((d) => d.requiresMic).map((d) => d.id));
  const picker = createDrillPicker(skills, drills);
  const ear = skills.filter(
    (s) =>
      topics.includes(s.topic) &&
      !s.drillTypes.some((id) => needsMic.has(id)) &&
      s.items().some(picker.canServe),
  );
  if (ear.length === 0) return null;

  const statuses = new Map(stored);
  for (const skill of startWithSoundSkills(skills, startWithSound))
    statuses.set(skill.id, deriveStatus(skill, statuses, stored.get(skill.id)));
  const ids = new Set(ear.map((s) => s.id));
  const due = cards.filter((c) => {
    const item = { id: c.itemId, skillId: c.skillId };
    return ids.has(c.skillId) && picker.canServe(item) && scheduler.isDue(c, now);
  }).length;
  const open = ear.some((s) => isFrontier(statuses.get(s.id) ?? 'locked'));
  if (!open && due === 0) return { kind: 'not-yet' };

  return {
    kind: 'ready',
    due,
    focus: { skillIds: [...ids], itemIds: [] },
    options: {
      minutes: cfg.earOnlyMinutes,
      maxItems: sessionLength(cfg.earOnlyMinutes),
      ...(due > 0 ? { reviewOnly: true } : {}),
    },
  };
}

const scheduler = createScheduler();

function earOnlyCopy(due: number): string {
  if (due === 0) return 'No ear cards are due, so it practises the sounds you are learning next.';
  return `Reviews ${due} ear ${due === 1 ? 'card' : 'cards'} due now.`;
}

const LABEL = 'Ear only (no guitar)';

/** The ear-only row of Today's quick-drills card. */
export function EarOnlyDrill() {
  const soundOn = useAppStore((s) => s.settings.soundOn);
  const startWithSound = useAppStore((s) => s.settings.startWithSound);
  const update = useAppStore((s) => s.update);
  const [plan, setPlan] = useState<EarOnlyPlan | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const db = getDb();
    void Promise.all([allCards(db), getSkillStates(db)]).then(([cards, states]) => {
      if (!live) return;
      const stored = new Map([...states.values()].map((s) => [s.skillId, s.status]));
      setPlan(earOnlyPlan(SKILLS, DRILLS, cards, stored, scheduler, new Date(), startWithSound));
    });
    return () => {
      live = false;
    };
  }, [startWithSound]);

  if (!plan) return null;
  if (plan.kind === 'not-yet') {
    return (
      <div className={styles.row} data-testid="ear-only">
        <p data-testid="ear-only-copy">
          <strong>{LABEL}</strong> opens after your first session.
        </p>
      </div>
    );
  }
  if (!soundOn) {
    // Every ear prompt is a sound: with sound off there is nothing to answer.
    return (
      <div className={styles.row} data-testid="ear-only">
        <button
          type="button"
          className={screens.secondaryButton}
          onClick={() => void update({ soundOn: true })}
        >
          Turn sound on
        </button>
        <p data-testid="ear-only-copy">
          <strong>{LABEL}</strong> needs sound.
        </p>
      </div>
    );
  }
  return (
    <div className={styles.row} data-testid="ear-only">
      <Link to={focusHref(plan.focus)} state={plan.options} className={screens.secondaryButton}>
        {LABEL}
      </Link>
      <p data-testid="ear-only-copy">{earOnlyCopy(plan.due)}</p>
    </div>
  );
}
