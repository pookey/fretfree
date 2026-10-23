import type { Page } from '@playwright/test';

/**
 * The links to each section in the Sections nav. The sidebar also links the learner's guitar
 * to the Garage (M11-07); that isn't a section, and it loads lazily, so counting every link in
 * the nav races it.
 */
export const sectionLinks = (page: Page) =>
  page
    .getByRole('navigation', { name: 'Sections' })
    .getByRole('link')
    .and(page.locator(':not([data-testid="sidebar-guitar"])'));
