import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { STARTER_SPEC, catalogueItem, type Category, type GuitarSpec } from '../../engine/garage';
import { resolveLook } from './model';
import { ACHIEVEMENTS_LINK, PartPicker, type PartPickerProps } from './PartPicker';

const BLUE_PRICE = catalogueItem('finish.blue')!.price!;

function renderPicker(
  over: Partial<PartPickerProps> & { spec?: GuitarSpec; category?: Category } = {},
) {
  const spec = over.spec ?? STARTER_SPEC;
  const props: PartPickerProps = {
    category: 'finish',
    onCategory: vi.fn(),
    spec,
    look: resolveLook(spec),
    owned: new Set(Object.values(STARTER_SPEC)),
    balance: 0,
    busy: false,
    onTap: vi.fn(),
    onBuy: vi.fn(),
    ...over,
  };
  render(
    <MemoryRouter>
      <PartPicker {...props} />
    </MemoryRouter>,
  );
  return props;
}

const selected = () => screen.getByTestId('selected-part');
const swatch = (name: RegExp) => screen.getByRole('button', { name });

describe('PartPicker', () => {
  it('shows the six categories as tabs, with the current one selected', () => {
    const props = renderPicker({ category: 'inlay' });
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.textContent)).toEqual([
      'Body',
      'Finish',
      'Pickguard',
      'Hardware',
      'Fretboard',
      'Inlays',
    ]);
    expect(screen.getByRole('tab', { name: 'Inlays' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Body' }));
    expect(props.onCategory).toHaveBeenCalledWith('body');
  });

  it('moves between tabs with the arrow keys, wrapping round', () => {
    const props = renderPicker({ category: 'body' });
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Body' }), { key: 'ArrowLeft' });
    expect(props.onCategory).toHaveBeenLastCalledWith('inlay');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Body' }), { key: 'ArrowRight' });
    expect(props.onCategory).toHaveBeenLastCalledWith('finish');
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Body' }), { key: 'Enter' });
    expect(props.onCategory).toHaveBeenCalledTimes(2);
  });

  it('marks the selected swatch, and each swatch with text as well as a shape', () => {
    renderPicker();
    expect(swatch(/^Red/)).toHaveAttribute('aria-pressed', 'true');
    expect(swatch(/^Red/)).toHaveTextContent('✓ Owned');
    expect(swatch(/^Blue/)).toHaveAttribute('aria-pressed', 'false');
    expect(swatch(/^Blue/)).toHaveTextContent(`${BLUE_PRICE} XP`);
    expect(swatch(/^Gold leaf/)).toHaveTextContent('◆ Badge');
  });

  it('says "Owned" for an owned selected part', () => {
    renderPicker();
    expect(within(selected()).getByText('Red')).toBeInTheDocument();
    expect(within(selected()).getByText('Owned')).toBeInTheDocument();
    expect(within(selected()).queryByRole('button')).toBeNull();
  });

  it('offers "Buy · N XP" for a part the balance covers, with no confirm step', () => {
    const spec = { ...STARTER_SPEC, finish: 'finish.blue' };
    const props = renderPicker({ spec, balance: BLUE_PRICE });
    const buy = within(selected()).getByRole('button', { name: `Buy · ${BLUE_PRICE} XP` });
    expect(buy).toBeEnabled();
    fireEvent.click(buy);
    expect(props.onBuy).toHaveBeenCalledWith('finish.blue');
  });

  it('disables Buy, with no "can’t afford" wording, when the balance falls short', () => {
    const spec = { ...STARTER_SPEC, finish: 'finish.blue' };
    renderPicker({ spec, balance: BLUE_PRICE - 1 });
    const buy = within(selected()).getByRole('button', { name: `Buy · ${BLUE_PRICE} XP` });
    expect(buy).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/afford|not enough|more XP|need/i);
  });

  it('disables Buy while a purchase is saving', () => {
    const spec = { ...STARTER_SPEC, finish: 'finish.blue' };
    renderPicker({ spec, balance: 1e6, busy: true });
    expect(within(selected()).getByRole('button', { name: /^Buy/ })).toBeDisabled();
  });

  it('names the badge that unlocks a mastery finish and links to the achievements', () => {
    const spec = { ...STARTER_SPEC, finish: 'finish.gold-leaf' };
    renderPicker({ spec, balance: 1e6 });
    const link = within(selected()).getByRole('link', {
      name: 'Unlocked by the Whole neck badge',
    });
    expect(link).toHaveAttribute('href', ACHIEVEMENTS_LINK);
    expect(within(selected()).queryByRole('button')).toBeNull();
  });

  it('reports a tapped swatch', () => {
    const props = renderPicker();
    fireEvent.click(swatch(/^Cherry sunburst/));
    expect(props.onTap).toHaveBeenCalledWith('finish.cherry-sunburst');
  });

  it('draws a chip for every category', () => {
    for (const category of ['body', 'pickguard', 'hardware', 'board', 'inlay'] as const) {
      const { unmount } = render(
        <MemoryRouter>
          <PartPicker
            category={category}
            onCategory={() => {}}
            spec={STARTER_SPEC}
            look={resolveLook(STARTER_SPEC)}
            owned={new Set()}
            balance={0}
            busy={false}
            onTap={() => {}}
            onBuy={() => {}}
          />
        </MemoryRouter>,
      );
      expect(screen.getAllByRole('listitem').length).toBeGreaterThan(1);
      unmount();
    }
  });
});
