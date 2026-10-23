import ts from 'typescript';

/**
 * Reads Playwright specs as source, so the test-tag rules can be checked
 * without a browser (`tags.test.ts`).
 *
 * The iPad projects differ only in viewport (all four profiles are WebKit),
 * so only tests whose outcome depends on the viewport run on ipad-portrait
 * and ipad-mini-landscape: those tagged `@layout` (playwright.config.ts).
 * Everything runs on ipad-landscape. A test needs `@layout` when it asserts
 * on sizes or positions, reads the viewport, branches on the project, or
 * takes a screenshot. A plain `expectNoHorizontalOverflow` doesn't count:
 * `layout-sweep.spec.ts` checks overflow on every screen at every size.
 */

export interface SpecTest {
  /** The test's own title, as written (a template literal keeps its `${…}`). */
  title: string;
  /** Describe titles and the test title, joined as Playwright greps them. */
  fullTitle: string;
  /** 1-based line of the `test(` call. */
  line: number;
  /** The test function's source. */
  body: string;
  /** Offsets of the title's text, inside its quotes, for editing tags. */
  titleStart: number;
  titleEnd: number;
  /** The test function, for edits to its parameters. */
  fn: ts.ArrowFunction | ts.FunctionExpression | null;
}

/** Project gates that say nothing about iPad layout: phone-only, iPad-only and landscape-only. */
const NEUTRAL_GATES = [
  /test\.skip\(\s*(?:\(\)\s*=>\s*)?(?:\w+|test\.info\(\))\.project\.name\s*[!=]==\s*'(?:iphone-smoke|ipad-landscape)'[^;]*\);?/g,
  /\b(?:const|let)\s+\w+\s*=\s*(?:\w+|test\.info\(\))\.project\.name\s*(?:;|$)/gm,
  /\w+\s*[!=]==\s*'iphone-smoke'/g,
];

const LAYOUT_MARKERS: readonly { name: string; re: RegExp }[] = [
  { name: 'boundingBox', re: /\.boundingBox\(/ },
  { name: 'viewport', re: /viewportSize\(|setViewportSize\(/ },
  { name: 'screenshot', re: /\.screenshot\(|toHaveScreenshot\(/ },
  {
    name: 'scroll geometry',
    re: /\b(?:scrollWidth|scrollLeft|scrollHeight|clientHeight|offsetWidth|getBoundingClientRect)\b/,
  },
  { name: 'neck window', re: /data-fret-to/ },
  {
    name: 'project branch',
    re: /project\.name|\bPORTRAIT\b|\bMINI\b|'ipad-(?:portrait|mini-landscape|landscape)'/,
  },
  { name: 'size class', re: /size-?class|regular-wide|sizeClass/i },
  { name: 'in view', re: /toBeInViewport\(|scrollIntoView/ },
  // The context panel sits beside the page at regular-wide and is a sheet
  // below it. The nav and the sidebar streak exist at every iPad size.
  { name: 'context panel', re: /context-?panel/i },
  { name: 'pointer geometry', re: /\.mouse\.(?:move|down|up|wheel)\(|\.dragTo\(|\.touchscreen\./ },
];

/** Titles that say the test is about layout, e.g. "fits the screen", "screenshot pass". */
const LAYOUT_TITLE =
  /\b(?:fits?|in view|on screen|overflow|layout|screenshot pass|portrait|mini|compact|regular-wide|one pane)\b|@screens\b/i;

/** Why a test depends on the viewport, or an empty list if it doesn't. */
export function layoutReasons(test: Pick<SpecTest, 'body' | 'fullTitle'>): string[] {
  let rest = test.body;
  for (const re of NEUTRAL_GATES) rest = rest.replace(re, '');
  const reasons = LAYOUT_MARKERS.filter((m) => m.re.test(rest)).map((m) => m.name);
  if (LAYOUT_TITLE.test(test.fullTitle)) reasons.push('title');
  return reasons;
}

/** A phone-only test: its title is about a phone and it doesn't size its own viewport. */
export function isPhoneTest(test: Pick<SpecTest, 'body' | 'fullTitle'>): boolean {
  return /\bphones?\b/i.test(test.fullTitle) && !/setViewportSize\(/.test(test.body);
}

export function hasTag(test: Pick<SpecTest, 'fullTitle'>, tag: string): boolean {
  return new RegExp(`${tag}\\b`).test(test.fullTitle);
}

function titleText(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.getText().slice(1, -1);
  return null;
}

/** `test(...)`, `test.only(...)`, `test.fixme(...)`, or `test.describe(...)` variants. */
function callKind(call: ts.CallExpression): 'test' | 'describe' | null {
  const e = call.expression;
  if (ts.isIdentifier(e) && e.text === 'test') return 'test';
  if (!ts.isPropertyAccessExpression(e)) return null;
  const chain = e.getText();
  if (/^test\.describe(\.\w+)?$/.test(chain)) return 'describe';
  if (/^test\.(only|fixme|fail|slow)$/.test(chain)) return 'test';
  return null;
}

export function parseSpec(source: string, fileName = 'spec.ts'): SpecTest[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const out: SpecTest[] = [];
  const visit = (node: ts.Node, describes: string[]) => {
    if (ts.isCallExpression(node)) {
      const kind = callKind(node);
      const [first] = node.arguments;
      const title = first ? titleText(first) : null;
      const fn = node.arguments.find(
        (a): a is ts.ArrowFunction | ts.FunctionExpression =>
          ts.isArrowFunction(a) || ts.isFunctionExpression(a),
      );
      if (kind && first && title !== null && fn) {
        if (kind === 'describe') {
          ts.forEachChild(fn.body, (c) => visit(c, [...describes, title]));
          return;
        }
        out.push({
          title,
          fullTitle: [...describes, title].join(' '),
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          body: fn.getText(),
          titleStart: first.getStart() + 1,
          titleEnd: first.getEnd() - 1,
          fn,
        });
        return;
      }
    }
    ts.forEachChild(node, (c) => visit(c, describes));
  };
  visit(sf, []);
  return out;
}
