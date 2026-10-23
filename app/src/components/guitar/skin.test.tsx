import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useAppStore } from '../../app-store';
import { itemsIn } from '../../engine/garage';
import { STARTER_SPEC } from '../../engine/garage/starter';
import { DEFAULT_SETTINGS } from '../../engine/model';
import { SettingsGroups } from '../../screens/settings/SettingsGroups';
import { getDb, getSettings } from '../../storage';
import { Fretboard } from '../fretboard/Fretboard';
import {
  DEFAULT_SKIN,
  INLAY_SHAPES,
  NECK_BOARDS,
  NeckSkinProvider,
  applyBoard,
  neckSkin,
} from './skin';

vi.mock('../../audio/audio', () => ({
  unlockAudio: vi.fn(() => Promise.resolve()),
  playNotes: vi.fn(() => Promise.resolve()),
}));

const db = getDb();
const root = document.documentElement;

beforeEach(() => useAppStore.setState({ loaded: true }));

afterEach(async () => {
  await Promise.all([db.garage.clear(), db.settings.clear()]);
  useAppStore.setState({ settings: DEFAULT_SETTINGS, loaded: false });
  applyBoard(null);
});

describe('neckSkin', () => {
  it('knows every board and inlay shape in the catalogue', () => {
    expect(itemsIn('board').map((b) => b.id)).toEqual(NECK_BOARDS.map((b) => `board.${b}`));
    expect(itemsIn('inlay').map((i) => i.render.shape)).toEqual(INLAY_SHAPES);
  });

  it('takes the equipped board and inlay shape', () => {
    expect(neckSkin({ board: 'board.maple', inlay: 'inlay.blocks' }, true)).toEqual({
      board: 'maple',
      inlay: 'blocks',
    });
  });

  it('falls back to the starter parts for a missing or unknown part', () => {
    expect(neckSkin(undefined, true)).toEqual({ board: 'rosewood', inlay: 'dots' });
    expect(neckSkin({ board: 'board.oak', inlay: 'blocks' }, true)).toEqual({
      board: 'rosewood',
      inlay: 'dots',
    });
    expect(neckSkin(STARTER_SPEC, true)).toEqual({ board: 'rosewood', inlay: 'dots' });
  });

  it('gives the default neck when the setting is off', () => {
    expect(neckSkin({ board: 'board.maple', inlay: 'inlay.trapezoids' }, false)).toBe(DEFAULT_SKIN);
    expect(DEFAULT_SKIN).toEqual({ board: null, inlay: 'dots' });
  });
});

describe('applyBoard', () => {
  it('sets and clears data-board on the root element', () => {
    applyBoard('ebony');
    expect(root.dataset.board).toBe('ebony');
    applyBoard(null);
    expect(root).not.toHaveAttribute('data-board');
  });
});

describe('<NeckSkinProvider>', () => {
  const equip = (board: string, inlay: string) =>
    db.garage.put({ key: 'singleton', spec: { ...STARTER_SPEC, board, inlay }, name: 'Mine' });
  const neck = () => screen.getByRole('group', { name: 'Fretboard' });

  function renderNeck() {
    return render(
      <NeckSkinProvider>
        <Fretboard fretRange={{ from: 0, to: 12 }} guideLevel={1} />
      </NeckSkinProvider>,
    );
  }

  it('keeps the default neck until settings have loaded', async () => {
    await equip('board.maple', 'inlay.blocks');
    useAppStore.setState({ loaded: false });
    renderNeck();
    await act(() => new Promise((r) => setTimeout(r, 50)));
    expect(root).not.toHaveAttribute('data-board');
    act(() => useAppStore.setState({ loaded: true }));
    expect(root.dataset.board).toBe('maple');
  });

  it('puts the starter neck on a fresh install', async () => {
    renderNeck();
    await waitFor(() => expect(root.dataset.board).toBe('rosewood'));
    expect(neck()).toHaveAttribute('data-inlay-style', 'dots');
  });

  it('follows the equipped build as it changes', async () => {
    await equip('board.maple', 'inlay.blocks');
    renderNeck();
    await waitFor(() => expect(root.dataset.board).toBe('maple'));
    expect(neck()).toHaveAttribute('data-inlay-style', 'blocks');

    await act(() => equip('board.ebony', 'inlay.trapezoids'));
    await waitFor(() => expect(root.dataset.board).toBe('ebony'));
    expect(neck()).toHaveAttribute('data-inlay-style', 'trapezoids');
  });

  it('lets a neck ask for its own inlay shape', async () => {
    await equip('board.maple', 'inlay.blocks');
    render(
      <NeckSkinProvider>
        <Fretboard fretRange={{ from: 0, to: 12 }} inlayStyle="dots" />
      </NeckSkinProvider>,
    );
    await waitFor(() => expect(root.dataset.board).toBe('maple'));
    expect(neck()).toHaveAttribute('data-inlay-style', 'dots');
  });

  it('draws today’s neck when the setting is off, and clears the board on unmount', async () => {
    await equip('board.maple', 'inlay.blocks');
    const { unmount } = renderNeck();
    await waitFor(() => expect(root.dataset.board).toBe('maple'));

    act(() => useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, neckSkin: false } }));
    expect(root).not.toHaveAttribute('data-board');
    expect(neck()).toHaveAttribute('data-inlay-style', 'dots');

    act(() => useAppStore.setState({ settings: DEFAULT_SETTINGS }));
    expect(root.dataset.board).toBe('maple');
    unmount();
    expect(root).not.toHaveAttribute('data-board');
  });
});

describe('the Settings toggle', () => {
  it('is on by default, and turning it off restores the default neck', async () => {
    await db.garage.put({
      key: 'singleton',
      spec: { ...STARTER_SPEC, board: 'board.maple' },
      name: 'Mine',
    });
    render(
      <NeckSkinProvider>
        <MemoryRouter>
          <SettingsGroups />
        </MemoryRouter>
      </NeckSkinProvider>,
    );
    const toggle = screen.getByRole('checkbox', { name: "Use my guitar's neck in drills" });
    expect(toggle).toBeChecked();
    expect(toggle).toHaveAccessibleDescription(/fretboard wood and inlays/);
    await waitFor(() => expect(root.dataset.board).toBe('maple'));

    await userEvent.click(toggle);
    await waitFor(() => expect(toggle).not.toBeChecked());
    expect((await getSettings(db)).neckSkin).toBe(false);
    expect(root).not.toHaveAttribute('data-board');
  });
});
