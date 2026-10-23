import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hasTag, isPhoneTest, layoutReasons, parseSpec, type SpecTest } from './tags';

const E2E = new URL('../', import.meta.url);
const specs: { file: string; tests: SpecTest[] }[] = readdirSync(E2E)
  .filter((f) => f.endsWith('.spec.ts'))
  .sort()
  .map((file) => ({ file, tests: parseSpec(readFileSync(new URL(file, E2E), 'utf8'), file) }));
const all = specs.flatMap(({ file, tests }) => tests.map((t) => ({ file, ...t })));
const where = (t: { file: string; line: number; title: string }) =>
  `${t.file}:${t.line} ${t.title}`;

describe('the e2e specs', () => {
  it('are all read', () => {
    expect(specs.length).toBeGreaterThan(100);
    expect(all.length).toBeGreaterThan(400);
    expect(
      all.some((t) => t.file === 'smoke.spec.ts' && /answer a drill prompt/.test(t.title)),
    ).toBe(true);
  });

  // Only @layout tests run on ipad-portrait and ipad-mini-landscape
  // (playwright.config.ts), so a viewport-dependent test without the tag
  // would quietly stop running at those sizes.
  it('tag every viewport-dependent test @layout', () => {
    const missing = all
      .filter((t) => layoutReasons(t).length > 0 && !hasTag(t, '@layout'))
      .map((t) => `${where(t)} (${layoutReasons(t).join(', ')})`);
    expect(missing).toEqual([]);
  });

  // @phone tests run only on iphone-smoke, which runs only @smoke tests.
  it('tag every phone-only test @smoke too, so it runs somewhere', () => {
    expect(all.filter((t) => hasTag(t, '@phone') && !hasTag(t, '@smoke')).map(where)).toEqual([]);
  });

  it('keep phone tests off the iPads', () => {
    const untagged = all.filter(
      (t) => isPhoneTest(t) && hasTag(t, '@smoke') && !hasTag(t, '@phone'),
    );
    expect(untagged.map(where)).toEqual([]);
  });
});

describe('layoutReasons', () => {
  const test = (body: string, fullTitle = 'a test') => ({ body, fullTitle });

  it('flags measuring, the viewport, screenshots and project branches', () => {
    expect(layoutReasons(test('const box = await cell.boundingBox();'))).toEqual(['boundingBox']);
    expect(layoutReasons(test('page.viewportSize()!.width >= 1024'))).toEqual(['viewport']);
    expect(layoutReasons(test("await page.screenshot({ path: 'x.png' })"))).toEqual(['screenshot']);
    expect(layoutReasons(test("const wide = info.project.name.includes('landscape');"))).toEqual([
      'project branch',
    ]);
    expect(layoutReasons(test("if (project === 'ipad-mini-landscape') {}"))).toEqual([
      'project branch',
    ]);
    expect(layoutReasons(test('await expect(done).toBeInViewport();'))).toEqual(['in view']);
    expect(layoutReasons(test("page.getByTestId('context-panel')"))).toEqual(['context panel']);
    expect(layoutReasons(test('', 'the summary fits on screen'))).toEqual(['title']);
  });

  it('ignores the overflow helper, the nav and gates that say nothing about iPad sizes', () => {
    const body = `
      test.skip(info.project.name === 'iphone-smoke', 'iPad flow');
      test.skip(info.project.name !== 'ipad-landscape', 'one file check is enough');
      const project = info.project.name;
      test.skip(project !== 'iphone-smoke', 'phone happy path');
      await page.getByRole('navigation', { name: 'Sections' }).click();
      await expectNoHorizontalOverflow(page);`;
    expect(layoutReasons(test(body))).toEqual([]);
  });
});

describe('parseSpec', () => {
  it('reads titles inside describes, template titles and tag positions', () => {
    const src = [
      "test.describe('Group @smoke', () => {",
      "  test('first', async ({ page }) => { await page.goto('/'); });",
      '  for (const n of [1, 2]) test(`loop ${n}`, async () => {});',
      '});',
    ].join('\n');
    const tests = parseSpec(src);
    expect(tests.map((t) => [t.fullTitle, t.line])).toEqual([
      ['Group @smoke first', 2],
      ['Group @smoke loop ${n}', 3],
    ]);
    expect(hasTag(tests[0] as SpecTest, '@smoke')).toBe(true);
    const first = tests[0] as SpecTest;
    expect(src.slice(first.titleStart, first.titleEnd)).toBe('first');
  });

  it('knows a phone test unless it sizes its own viewport', () => {
    expect(isPhoneTest({ fullTitle: 'D7 on a phone @smoke', body: '' })).toBe(true);
    expect(isPhoneTest({ fullTitle: 'D7 on a phone', body: 'page.setViewportSize(x)' })).toBe(
      false,
    );
    expect(isPhoneTest({ fullTitle: 'asks for the microphone', body: '' })).toBe(false);
  });
});
