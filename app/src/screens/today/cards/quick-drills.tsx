import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ENGINE_CONFIG,
  SKILLS,
  createScheduler,
  sessionLength,
  type CardRecord,
  type Scheduler,
  type Skill,
} from '../../../engine';
import { DRILLS } from '../../../drills/registry';
import type { AnyDrillType } from '../../../drills/types';
import { createDrillPicker } from '../../../session/drill-picker';
import type { SessionOptions } from '../../../session/options';
import { allCards, getDb } from '../../../storage';
import screens from '../../screens.module.css';
import styles from './quick-drills.module.css';

export const id = 'quick-drills';
export const order = 30;

export interface WarmupPlan {
  /** Due fretboard reviews a drill can serve. */
  due: number;
  /** Route state for `/session`. */
  options: SessionOptions;
}

/**
 * The 2-minute fretboard warm-up (design §7 Today): a short, fixed-length
 * session on the fretboard skills. It reviews what is due; with nothing due,
 * it runs the frontier as a normal session would, new blocks and all.
 */
export function warmupPlan(
  skills: readonly Skill[],
  drills: readonly AnyDrillType[],
  cards: readonly CardRecord[],
  scheduler: Scheduler,
  now: Date,
  cfg = ENGINE_CONFIG.quickDrills,
): WarmupPlan {
  const topics: readonly string[] = cfg.warmupTopics;
  const fretboard = skills.filter((s) => topics.includes(s.topic));
  const ids = new Set(fretboard.map((s) => s.id));
  const picker = createDrillPicker(fretboard, drills);
  const due = cards.filter(
    (c) =>
      ids.has(c.skillId) &&
      picker.canServe({ id: c.itemId, skillId: c.skillId }) &&
      scheduler.isDue(c, now),
  ).length;
  return {
    due,
    options: {
      minutes: cfg.warmupMinutes,
      maxItems: sessionLength(cfg.warmupMinutes),
      skillIds: [...ids],
      ...(due > 0 ? { reviewOnly: true } : {}),
    },
  };
}

const scheduler = createScheduler();

function warmupCopy(due: number): string {
  if (due === 0) return 'Nothing is due, so it practises what you are learning next.';
  return `Reviews ${due} fretboard ${due === 1 ? 'item' : 'items'} due now.`;
}

/** Quick drills (design §7 Today): short sessions that sit beside the daily one. */
export function Card() {
  const [plan, setPlan] = useState<WarmupPlan | null>(null);

  useEffect(() => {
    let live = true;
    void allCards(getDb()).then(
      (cards) => live && setPlan(warmupPlan(SKILLS, DRILLS, cards, scheduler, new Date())),
    );
    return () => {
      live = false;
    };
  }, []);

  const minutes = ENGINE_CONFIG.quickDrills.warmupMinutes;
  return (
    <section className={screens.card} aria-labelledby="quick-drills-title">
      <h2 id="quick-drills-title">Quick drills</h2>
      {plan && (
        <div className={styles.row}>
          <Link
            to="/session"
            state={plan.options}
            className={screens.secondaryButton}
            data-testid="warmup"
          >
            {minutes}-minute fretboard warm-up
          </Link>
          <p data-testid="warmup-copy">{warmupCopy(plan.due)}</p>
        </div>
      )}
    </section>
  );
}
