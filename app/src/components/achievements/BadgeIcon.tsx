import type { AchievementCategory } from '../../engine/gamification/types';
import styles from './Achievements.module.css';

/**
 * A badge glyph. Each category has its own shape as well as its own
 * Okabe–Ito colour (mastery: circle, speed: triangle, streak: diamond), and
 * locked badges are drawn as outlines, so nothing relies on colour alone.
 */
export function BadgeIcon({
  category,
  unlocked,
}: {
  category: AchievementCategory;
  unlocked: boolean;
}) {
  return (
    <svg
      className={styles.icon}
      viewBox="0 0 40 40"
      aria-hidden
      data-category={category}
      data-unlocked={unlocked}
    >
      {category === 'mastery' && <circle cx="20" cy="20" r="16" />}
      {category === 'speed' && <polygon points="20,4 36,34 4,34" />}
      {category === 'streak' && <polygon points="20,3 37,20 20,37 3,20" />}
    </svg>
  );
}
