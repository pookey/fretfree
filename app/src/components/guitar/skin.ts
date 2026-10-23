import { liveQuery } from 'dexie';
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAppStore } from '../../app-store';
import type { GuitarSpec, InlayShape } from '../../engine/garage/types';
import { getDb, type FretworkDB } from '../../storage';

/**
 * The neck skin (design §3.8): drills draw the neck in the equipped board
 * wood and inlay shape, unless "Use my guitar's neck in drills" is off.
 *
 * The wood is applied as `data-board` on the root element, and
 * `styles/boards.css` maps it to the neck tokens, so every renderer that uses
 * them follows. Only board and inlay names are needed here, never the
 * catalogue, so the skin costs next to nothing at first load.
 */

/** The boards `styles/boards.css` knows, by the name after `board.` (catalogue IDs). */
export const NECK_BOARDS = ['rosewood', 'maple', 'ebony'] as const;
export type NeckBoard = (typeof NECK_BOARDS)[number];

export const INLAY_SHAPES: readonly InlayShape[] = ['dots', 'blocks', 'trapezoids'];

export interface NeckSkin {
  /** The `data-board` value, or `null` for the default neck (skin off). */
  board: NeckBoard | null;
  inlay: InlayShape;
}

export const DEFAULT_SKIN: NeckSkin = { board: null, inlay: 'dots' };

function named<T extends string>(id: string | undefined, prefix: string, names: readonly T[]) {
  const name = id?.startsWith(prefix) ? id.slice(prefix.length) : undefined;
  return names.find((n) => n === name);
}

/**
 * The skin a stored build gives the neck. An unknown part falls back to the
 * starter's (rosewood, dots), as `getGarage` does.
 */
export function neckSkin(
  spec: Partial<Pick<GuitarSpec, 'board' | 'inlay'>> | undefined,
  enabled: boolean,
): NeckSkin {
  if (!enabled) return DEFAULT_SKIN;
  return {
    board: named(spec?.board, 'board.', NECK_BOARDS) ?? 'rosewood',
    inlay: named(spec?.inlay, 'inlay.', INLAY_SHAPES) ?? 'dots',
  };
}

/** The equipped board and inlay IDs, read without the catalogue. */
async function equipped(db: FretworkDB): Promise<Partial<GuitarSpec> | undefined> {
  return (await db.garage.get('singleton'))?.spec;
}

/** Set (or, for the default neck, clear) `data-board` on the root element. */
export function applyBoard(board: NeckBoard | null, root: HTMLElement = document.documentElement) {
  if (board) root.dataset.board = board;
  else delete root.dataset.board;
}

/** The live skin: the equipped build, kept current with `liveQuery`, and the setting. */
export function useNeckSkin(): NeckSkin {
  // Until settings load, keep the default neck: it may be switched off.
  const enabled = useAppStore((s) => s.loaded && s.settings.neckSkin);
  const [spec, setSpec] = useState<Partial<GuitarSpec> | undefined>();
  useEffect(() => {
    const sub = liveQuery(() => equipped(getDb())).subscribe({
      next: setSpec,
      error: () => setSpec(undefined),
    });
    return () => sub.unsubscribe();
  }, []);
  const skin = neckSkin(spec, enabled);
  useEffect(() => {
    applyBoard(skin.board);
    return () => applyBoard(null);
  }, [skin.board]);
  return skin;
}

const InlayStyleContext = createContext<InlayShape>('dots');

/** The inlay shape the neck draws: dots unless a skin provider says otherwise. */
export function useInlayStyle(): InlayShape {
  return useContext(InlayStyleContext);
}

/** Applies the live skin: `data-board` on the root, and the inlay shape for every `<Fretboard>`. */
export function NeckSkinProvider({ children }: { children: ReactNode }) {
  const { inlay } = useNeckSkin();
  return createElement(InlayStyleContext.Provider, { value: inlay }, children);
}
