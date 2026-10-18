import { ScreenLayout } from '../../shell/ScreenLayout';
import { TODAY_CARDS, type TodayCard } from './registry';
import styles from '../screens.module.css';

/** Today (design §7): the registered cards, top to bottom. */
export function TodayScreen({ cards = TODAY_CARDS }: { cards?: readonly TodayCard[] }) {
  return (
    <ScreenLayout
      title="Today"
      contextTitle="Why daily practice"
      context={
        <div className={styles.contextCopy}>
          <h2>Short and often</h2>
          <p>
            A few minutes every day beats one long session a week. Spacing your practice makes it
            feel harder — and that is exactly why it sticks.
          </p>
        </div>
      }
    >
      <div className={styles.stack}>
        {cards.map(({ id, Card }) => (
          <div key={id} data-today-card={id}>
            <Card />
          </div>
        ))}
      </div>
    </ScreenLayout>
  );
}
