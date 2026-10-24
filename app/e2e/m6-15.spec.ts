import { expect, test } from '@playwright/test';
import { freshStart } from './helpers';

// M6-15: chord roots are spelled from the chord's key, as D21 spells them,
// not from the note-name setting alone (research/02 rule 4: a label must
// never mislead). A learner who prefers sharps still sees "B♭", never "A♯",
// in the CAGED view and the shape drills; the setting only breaks the F♯/G♭
// tie.

test.describe('M6-15 chord roots spelled from their key', () => {
  test('a learner set to sharps sees the A shape of B♭, not A♯ @smoke', async ({ page }) => {
    await freshStart(page, '/settings');
    const names = page.getByRole('combobox', { name: 'Note names' });
    await names.selectOption({ label: 'Sharps (C♯, F♯)' });
    await expect(names).toHaveValue('sharp');

    await page.goto('/explore?view=caged');
    const view = page.getByRole('region', { name: 'CAGED visualiser' });
    await view.getByRole('combobox', { name: 'Root' }).selectOption({ label: 'A# / Bb' });
    // B♭ major's lowest shape is the A shape, barred at fret 1.
    await expect(page.getByTestId('caged-name')).toHaveText('Bb: A shape');
    await expect(view.getByRole('list', { name: 'CAGED chain of Bb' })).toBeVisible();

    // Its notes too: B♭, D and F on the neck, with no A♯ anywhere.
    await view.getByRole('radio', { name: 'Note names' }).check({ force: true });
    const neck = view.getByRole('group', { name: /^A shape of Bb/ });
    await expect(neck.getByTestId('marker-root').first()).toHaveText('B♭');
    await expect(neck).not.toContainText(/A[#♯]/);

    // F♯/G♭ has no key of its own: there the setting decides.
    await view.getByRole('combobox', { name: 'Root' }).selectOption({ label: 'F# / Gb' });
    await expect(page.getByTestId('caged-name')).toHaveText(/^F#: /);
  });
});
