import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { Guitar, guitarLabel } from '../../components/guitar';
import {
  balance as balanceOf,
  catalogueItem,
  owned as ownedOf,
  type Category,
  type GarageBuild,
  type WalletState,
} from '../../engine/garage';
import { ScreenLayout } from '../../shell/ScreenLayout';
import { useSizeClass } from '../../shell/size-class';
import { getDb } from '../../storage';
import { getGarage, getWalletState, purchase, saveGarage } from '../../storage/garage-repo';
import { GuitarName } from './GuitarName';
import {
  pendingTryOn,
  previewHeightRem,
  previewSpec,
  resolveLook,
  tapPart,
  tryOnSummary,
  withoutCategory,
  type TryOn,
} from './model';
import { PartPicker } from './PartPicker';
import styles from './Garage.module.css';

interface GarageData {
  build: GarageBuild;
  wallet: WalletState;
}

async function loadGarage(): Promise<GarageData> {
  const db = getDb();
  return { build: await getGarage(db), wallet: await getWalletState(db) };
}

/**
 * The Garage (design §3.8, §7 Garage): the guitar preview fills the main
 * pane and the part picker is the context panel (a sheet on a phone).
 * Tapping a part tries it on for free; Buy spends the garage balance and
 * equips the part. Purely cosmetic: nothing here touches practice.
 */
export function GarageScreen({ now = () => new Date() }: { now?: () => Date }) {
  const [data, setData] = useState<GarageData | null>(null);
  const [tryOn, setTryOn] = useState<TryOn>({});
  const [category, setCategory] = useState<Category>('finish');
  const [busy, setBusy] = useState(false);
  const sizeClass = useSizeClass();
  const viewportHeight = useViewportHeight();

  useEffect(() => {
    const sub = liveQuery(loadGarage).subscribe({
      next: setData,
      error: (e: unknown) => console.error('Loading the Garage failed', e),
    });
    return () => sub.unsubscribe();
  }, []);

  const owned = useMemo(
    () => (data ? ownedOf(data.wallet.purchases, data.wallet.achievements) : new Set<string>()),
    [data],
  );

  if (!data) {
    return (
      <ScreenLayout title="Garage">
        <p role="status">Loading your guitar…</p>
      </ScreenLayout>
    );
  }

  const { build, wallet } = data;
  const trying = pendingTryOn(build.spec, tryOn);
  const spec = previewSpec(build.spec, trying);
  const look = resolveLook(spec);
  const toSpend = balanceOf(wallet.xpTotal, wallet.purchases);

  const onTap = (itemId: string) => {
    const item = catalogueItem(itemId);
    if (!item) return;
    const next = tapPart(item, owned, trying);
    setTryOn(next.tryOn);
    // Saved even when the build already has it: a purchase may have landed
    // in the database before `build` caught up.
    if (next.equip) {
      saveGarage(getDb(), { spec: { [item.category]: item.id } }).catch((e: unknown) =>
        console.error('Equipping a part failed', e),
      );
    }
  };

  const onBuy = (itemId: string) => {
    const item = catalogueItem(itemId);
    if (!item) return;
    setBusy(true);
    purchase(getDb(), itemId, now(), { equip: true })
      .then((result) => {
        // Bought and equipped: it's part of the build now, not a try-on.
        if (result.ok) setTryOn((t) => withoutCategory(t, item.category));
        else console.warn(`Buying ${itemId} was refused: ${result.reason}`);
      })
      .catch((e: unknown) => console.error('Buying a part failed', e))
      .finally(() => setBusy(false));
  };

  const picker = (
    <PartPicker
      category={category}
      onCategory={setCategory}
      spec={spec}
      look={look}
      owned={owned}
      balance={toSpend}
      busy={busy}
      onTap={onTap}
      onBuy={onBuy}
    />
  );
  const tryingOn = Object.keys(trying).length > 0;

  return (
    <ScreenLayout title="Garage" context={picker} contextTitle="Parts">
      <div className={styles.main} data-size-class={sizeClass}>
        {/* On a phone the tab bar's Progress tab does this, and the room goes to the guitar. */}
        {sizeClass !== 'compact' && (
          <Link to="/progress" className={styles.back}>
            ← Progress
          </Link>
        )}
        <div className={styles.stage}>
          <div className={styles.spot}>
            {/* On regular-wide the frame's CSS sizes the guitar to the window. */}
            <div className={styles.frame}>
              <Guitar
                spec={look}
                size={
                  sizeClass === 'regular-wide'
                    ? 'fill'
                    : previewHeightRem(sizeClass, viewportHeight)
                }
                label={`${build.name}: ${guitarLabel(look)}`}
                className={styles.preview}
              />
            </div>
          </div>
          <div className={styles.info}>
            <GuitarName name={build.name} />
            <p className={styles.balance} data-testid="garage-wallet">
              <strong>{toSpend.toLocaleString('en')}</strong> to spend
            </p>
            <p className={styles.tryOnNote} aria-live="polite">
              {tryingOn ? `Trying on: ${tryOnSummary(trying)}. Nothing is spent.` : 'Your build.'}
            </p>
            <button
              type="button"
              className={styles.reset}
              disabled={!tryingOn}
              onClick={() => setTryOn({})}
            >
              Reset to my build
            </button>
          </div>
        </div>
      </div>
    </ScreenLayout>
  );
}

function subscribeResize(cb: () => void): () => void {
  window.addEventListener('resize', cb);
  return () => window.removeEventListener('resize', cb);
}

function useViewportHeight(): number {
  return useSyncExternalStore(
    subscribeResize,
    () => window.innerHeight,
    () => 800,
  );
}
