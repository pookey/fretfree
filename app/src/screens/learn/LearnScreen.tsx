import { useEffect, useState } from 'react';
import { SKILLS, type SkillStatus } from '../../engine';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { getDb, getSkillStates } from '../../storage';
import styles from '../screens.module.css';

const STATUS_LABEL: Record<SkillStatus, string> = {
  locked: 'Preview',
  unlocked: 'Ready',
  practising: 'Practising',
  mastered: 'Mastered',
};

export function LearnScreen() {
  const [statuses, setStatuses] = useState<Map<string, SkillStatus>>(new Map());
  useEffect(() => {
    void getSkillStates(getDb()).then((m) =>
      setStatuses(new Map([...m.values()].map((s) => [s.skillId, s.status]))),
    );
  }, []);
  return (
    <ScreenLayout title="Learn">
      <ul className={styles.cards}>
        {SKILLS.map((skill) => {
          const status =
            statuses.get(skill.id) ?? (skill.prerequisites.length ? 'locked' : 'unlocked');
          return (
            <li key={skill.id} className={styles.card} data-status={status}>
              <span className={styles.topic}>{skill.topic}</span>
              <h2>{skill.title}</h2>
              <p>
                {skill.items().length} items · {STATUS_LABEL[status]}
              </p>
            </li>
          );
        })}
      </ul>
    </ScreenLayout>
  );
}
