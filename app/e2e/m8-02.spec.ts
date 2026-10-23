import { expect, test, type Locator, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, freshStart } from './helpers';

const PHRASE = 'Two bars in G major';
const FINDER = 'Find a line or space';

async function openViewer(page: Page) {
  await freshStart(page, '/explore?view=notation-viewer');
  const phrase = page.getByRole('group', { name: PHRASE });
  const finder = page.getByRole('group', { name: FINDER });
  // VexFlow loads on demand; the staff says when it has engraved.
  await expect(phrase).toHaveAttribute('data-ready', 'true');
  await expect(finder).toHaveAttribute('data-ready', 'true');
  return { phrase, finder };
}

/** The colour VexFlow's staff lines are painted in. */
const lineColour = (staff: Locator) =>
  staff
    .locator('.vf-stave path')
    .first()
    .evaluate((p) => getComputedStyle(p).stroke);

const centreY = async (l: Locator) => {
  const box = (await l.boundingBox())!;
  return box.y + box.height / 2;
};

test.describe('M8-02 <Staff>', () => {
  test('engraves the phrase with clef, signatures, notes and VoiceOver names @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    const { phrase } = await openViewer(page);

    await expect(phrase.locator('.vf-clef').first()).toHaveText(''); // treble 8vb
    await expect(phrase.locator('.vf-keysignature')).toHaveCount(1);
    await expect(phrase.locator('.vf-timesignature')).toHaveCount(1);
    await expect(phrase.locator('.vf-stavenote')).toHaveCount(12);
    await expect(phrase.locator('.vf-beam').first()).toBeAttached();
    await expect(phrase.locator('.vf-tuplet')).toHaveCount(1);
    await expect(phrase.locator('.vf-stavetie')).toHaveCount(1);

    const notes = phrase.getByRole('img');
    await expect(notes).toHaveCount(12);
    await expect(notes.nth(0)).toHaveAccessibleName('E 2, quarter note, string 6, fret 0');
    await expect(notes.nth(1)).toHaveAccessibleName(
      'F sharp 2, dotted eighth note, string 6, fret 2',
    );
    await expect(notes.nth(3)).toHaveAccessibleName('quarter rest');
    await expect(notes.nth(7)).toHaveAccessibleName('C 3, eighth note, triplet, string 5, fret 3');

    // Notes run left to right; open low E sits well below the staff.
    const first = (await notes.nth(0).boundingBox())!;
    const last = (await notes.nth(11).boundingBox())!;
    expect(first.x).toBeLessThan(last.x);
    expect(first.y).toBeGreaterThan(last.y);

    await expectNoHorizontalOverflow(page);
  });

  test('the tab under the staff fades with the guide level @layout', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    const { phrase } = await openViewer(page);
    const tab = phrase.locator('.vf-tab');
    const select = page.getByRole('combobox', { name: 'Tab under the staff' });

    await expect(phrase).toHaveAttribute('data-tab', 'full');
    await expect(tab.locator('.vf-tabnote')).toHaveCount(11);
    await expect(tab).toHaveCSS('opacity', '1');

    // Each fret number sits under its note (the rest at index 3 has none),
    // within VexFlow's usual offset from the notehead's centre.
    // getBoundingClientRect, as Playwright's boundingBox() misreads SVG text.
    const centreX = (l: Locator) =>
      l.evaluate((e) => {
        const b = e.getBoundingClientRect();
        return b.x + b.width / 2;
      });
    const notes = phrase.getByRole('img');
    const frets = tab.locator('.vf-tabnote text');
    for (const [fret, note] of [
      [0, 0],
      [3, 4],
      [10, 11],
    ] as const) {
      expect(
        Math.abs((await centreX(frets.nth(fret))) - (await centreX(notes.nth(note)))),
      ).toBeLessThan(16);
    }

    await select.selectOption('Faint');
    await expect(phrase).toHaveAttribute('data-tab', 'faint');
    await expect(tab).toHaveCSS('opacity', '0.35');

    await select.selectOption('Off');
    await expect(phrase).toHaveAttribute('data-tab', 'none');
    await expect(tab).toHaveCount(0);
    await expect(phrase.getByRole('img').first()).toHaveAccessibleName('E 2, quarter note');
  });

  test('a tap picks the line or space under it, with 44pt between lines @layout', async ({
    page,
  }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    const { finder } = await openViewer(page);
    const readout = page.getByTestId('staff-readout');

    const bands = finder.getByRole('button');
    await expect(bands).toHaveCount(19);
    const line1 = finder.getByRole('button', { name: 'line 1', exact: true });
    const line2 = finder.getByRole('button', { name: 'line 2', exact: true });
    expect((await line1.boundingBox())!.height).toBeGreaterThanOrEqual(22);
    expect((await centreY(line1)) - (await centreY(line2))).toBeGreaterThanOrEqual(44);

    await line2.click();
    await expect(readout).toHaveText('Line 2: G3');
    const mark = finder.getByTestId('staff-mark');
    await expect(mark).toHaveAttribute('data-position', '2');

    // Press, slide down to the second ledger line, let go.
    const box = (await finder.boundingBox())!;
    const x = box.x + box.width * 0.6;
    const ledger = finder.getByRole('button', { name: '2nd ledger line below' });
    await page.mouse.move(x, await centreY(line1));
    await page.mouse.down();
    await expect(finder.getByTestId('staff-ghost')).toHaveAttribute('data-position', '0');
    await page.mouse.move(x, await centreY(ledger), { steps: 6 });
    await expect(finder.getByTestId('staff-ghost')).toHaveAttribute('data-position', '-4');
    await expect(readout).toHaveText('Line 2: G3');
    await page.mouse.up();
    await expect(readout).toHaveText('2nd ledger line below: A2');
    await expect(finder.getByTestId('staff-ghost')).toHaveCount(0);
    await expect(mark).toHaveAttribute('data-position', '-4');
    await expect(mark.locator('line')).toHaveCount(2);
  });

  test('the keyboard walks lines and spaces and picks one', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    const { finder } = await openViewer(page);
    await finder.getByRole('button', { name: 'line 3' }).focus();
    await page.keyboard.press('ArrowUp');
    await expect(finder.getByRole('button', { name: 'space 3' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('staff-readout')).toHaveText('Space 3: C4');
  });

  test('the staff is painted in the theme’s ink, dark and light', async ({ page }, info) => {
    test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
    const colours: string[] = [];
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme });
      const { phrase } = await openViewer(page);
      const text = await page.evaluate(() => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--text)';
        document.body.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      });
      const ink = await lineColour(phrase);
      expect(ink, colorScheme).toBe(text);
      colours.push(ink);
    }
    expect(colours[0]).not.toBe(colours[1]);
  });

  test('the notation viewer renders on the phone @smoke @phone', async ({ page }) => {
    const { phrase, finder } = await openViewer(page);
    await expect(phrase.getByRole('img')).toHaveCount(12);
    await finder.getByRole('button', { name: 'line 4' }).click();
    await expect(page.getByTestId('staff-readout')).toHaveText('Line 4: D4');
    await expectNoHorizontalOverflow(page);
  });
});
