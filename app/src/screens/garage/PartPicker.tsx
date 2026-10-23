import { useId, useRef, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import type { GuitarLook } from '../../components/guitar';
import { CATEGORIES, catalogueItem, type Category, type GuitarSpec } from '../../engine/garage';
import { CATEGORY_LABELS, partState, pickerItems, type PartState } from './model';
import { PartChip } from './PartChip';
import styles from './Garage.module.css';

/** Where a badge-only part's link goes: the achievements panel on Progress. */
export const ACHIEVEMENTS_LINK = '/progress#achievements';

export interface PartPickerProps {
  category: Category;
  onCategory(category: Category): void;
  /** The build on the preview, try-ons included: its part in `category` is selected. */
  spec: GuitarSpec;
  look: GuitarLook;
  owned: ReadonlySet<string>;
  balance: number;
  /** Disables Buy while a purchase is being saved. */
  busy: boolean;
  onTap(itemId: string): void;
  onBuy(itemId: string): void;
}

/**
 * The part picker (design §7 Garage): category tabs, then the selected part
 * and what it takes, then a swatch per part. Tapping a swatch tries the part
 * on (or equips it, if owned); only the Buy button spends anything.
 */
export function PartPicker(props: PartPickerProps) {
  const { category, spec, look, owned, balance } = props;
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = catalogueItem(spec[category]);
  const items = pickerItems(category);

  const onTabKey = (e: KeyboardEvent, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = (index + step + CATEGORIES.length) % CATEGORIES.length;
    props.onCategory(CATEGORIES[next]!);
    tabs.current[next]?.focus();
  };

  return (
    <div className={styles.picker}>
      <div role="tablist" aria-label="Part categories" className={styles.tabs}>
        {CATEGORIES.map((c, i) => (
          <button
            key={c}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${c}`}
            aria-selected={c === category}
            aria-controls={`${id}-panel`}
            tabIndex={c === category ? 0 : -1}
            className={styles.tab}
            onClick={() => props.onCategory(c)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${category}`}>
        {selected && (
          <div className={styles.selected} data-testid="selected-part">
            <p className={styles.selectedName}>{selected.name}</p>
            <SelectedState
              state={partState(selected, owned, balance)}
              busy={props.busy}
              onBuy={() => props.onBuy(selected.id)}
            />
          </div>
        )}
        <ul className={styles.swatches} aria-label={`${CATEGORY_LABELS[category]} parts`}>
          {items.map((item) => {
            const state = partState(item, owned, balance);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.swatch}
                  aria-pressed={item.id === spec[category]}
                  data-state={state.kind}
                  data-item={item.id}
                  onClick={() => props.onTap(item.id)}
                >
                  <PartChip item={item} look={look} />
                  <span className={styles.swatchName}>{item.name}</span>
                  <SwatchTag state={state} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/** The small line under a swatch: owned, its price or that a badge unlocks it. */
function SwatchTag({ state }: { state: PartState }) {
  switch (state.kind) {
    case 'owned':
      return (
        <span className={styles.tag}>
          <span aria-hidden>✓ </span>Owned
        </span>
      );
    case 'buy':
      return <span className={styles.tag}>{state.price.toLocaleString('en')} XP</span>;
    case 'badge':
      return (
        <span className={styles.tag}>
          <span aria-hidden>◆ </span>Badge
        </span>
      );
  }
}

/**
 * The selected part's state: "Owned", a Buy button with its price (enabled
 * only when the balance covers it, and never with a confirm step), or the
 * badge that unlocks it, linking to the achievements panel.
 */
function SelectedState({ state, busy, onBuy }: { state: PartState; busy: boolean; onBuy(): void }) {
  switch (state.kind) {
    case 'owned':
      return (
        <p className={styles.owned} data-state="owned">
          <span aria-hidden>✓</span>Owned
        </p>
      );
    case 'buy':
      return (
        <button
          type="button"
          className={styles.buy}
          data-state="buy"
          disabled={!state.affordable || busy}
          onClick={onBuy}
        >
          Buy · {state.price.toLocaleString('en')} XP
        </button>
      );
    case 'badge':
      return (
        <Link to={ACHIEVEMENTS_LINK} className={styles.badgeLink} data-state="badge">
          <span aria-hidden>◆</span>
          <span>
            Unlocked by the <em>{state.badgeTitle}</em> badge
          </span>
        </Link>
      );
  }
}
