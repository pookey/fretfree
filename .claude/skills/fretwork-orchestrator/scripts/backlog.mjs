#!/usr/bin/env node
// Backlog parser and planner for docs/backlog.md (no dependencies).
//
//   backlog.mjs list [--status todo]      table of WPs
//   backlog.mjs show <WP>                 one WP as JSON
//   backlog.mjs ready [--busy WP,WP]      todo WPs whose deps are done and whose
//                                         Owns don't overlap in-flight WPs (JSON)
//   backlog.mjs plan --slots N [--busy …] greedy conflict-free selection of N ready WPs
//   backlog.mjs set-status <WP> <status>  rewrite the WP's Status line in place
//   backlog.mjs check                     validate format, deps and IDs
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const STATUSES = ['todo', 'in-progress', 'review', 'done', 'blocked'];
const root = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
// Always read the backlog on the main checkout, even when called from a worktree.
const commonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
  encoding: 'utf8',
}).trim();
const mainRoot = commonDir.endsWith('/.git') ? commonDir.slice(0, -5) : root;
const file = process.env.BACKLOG_FILE ?? join(mainRoot, 'docs/backlog.md');

export function parse(text) {
  const lines = text.split('\n');
  const wps = [];
  let cur = null;
  lines.forEach((line, i) => {
    const h = /^### (M\d+-\d+) · (.+)$/.exec(line);
    if (h) {
      cur = { id: h[1], title: h[2].trim(), line: i, status: null, deps: [], owns: [], design: '' };
      wps.push(cur);
      return;
    }
    if (/^#{1,3} /.test(line)) cur = null;
    if (!cur) return;
    const f = /^- \*\*(Status|Deps|Owns|Design):\*\* (.*)$/.exec(line);
    if (!f) return;
    const [, key, value] = f;
    if (key === 'Status') {
      cur.status = value.trim();
      cur.statusLine = i;
    } else if (key === 'Deps') {
      cur.deps = value.match(/M\d+-\d+/g) ?? [];
    } else if (key === 'Owns') {
      cur.owns = [...value.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    } else cur.design = value.trim();
  });
  return wps;
}

function globToRe(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .split('**')
    .map((part) => part.replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${re}$`);
}

/** Conservative overlap test between two Owns patterns. */
export function overlaps(a, b) {
  if (a === b) return true;
  if (globToRe(a).test(b) || globToRe(b).test(a)) return true;
  const base = (p) => p.split(/[*]/)[0];
  const da = a.includes('**') ? base(a) : null;
  const db = b.includes('**') ? base(b) : null;
  if (da && (b.startsWith(da) || (db && da.startsWith(db)))) return true;
  if (db && a.startsWith(db)) return true;
  return false;
}

export function conflicts(wpA, wpB) {
  return wpA.owns.some((a) => wpB.owns.some((b) => overlaps(a, b)));
}

function readyList(wps, busyIds) {
  const byId = new Map(wps.map((w) => [w.id, w]));
  const busy = wps.filter(
    (w) => busyIds.has(w.id) || w.status === 'in-progress' || w.status === 'review',
  );
  return wps.filter(
    (w) =>
      w.status === 'todo' &&
      !busyIds.has(w.id) &&
      w.deps.every((d) => byId.get(d)?.status === 'done') &&
      !busy.some((b) => conflicts(w, b)),
  );
}

function plan(wps, busyIds, slots) {
  const chosen = [];
  const busy = wps.filter(
    (w) => busyIds.has(w.id) || w.status === 'in-progress' || w.status === 'review',
  );
  // Contracts first, then lower milestone, then file order.
  const ready = readyList(wps, busyIds).sort((a, b) => {
    const c = Number(b.title.includes('[contract]')) - Number(a.title.includes('[contract]'));
    return c || a.line - b.line;
  });
  for (const w of ready) {
    if (chosen.length >= slots) break;
    if ([...busy, ...chosen].some((b) => conflicts(w, b))) continue;
    chosen.push(w);
  }
  return chosen;
}

function check(wps) {
  const errors = [];
  const ids = new Set();
  for (const w of wps) {
    if (ids.has(w.id)) errors.push(`${w.id}: duplicate ID`);
    ids.add(w.id);
    if (!STATUSES.includes(w.status)) errors.push(`${w.id}: bad status "${w.status}"`);
    if (w.owns.length === 0) errors.push(`${w.id}: no Owns`);
  }
  for (const w of wps)
    for (const d of w.deps) if (!ids.has(d)) errors.push(`${w.id}: unknown dep ${d}`);
  // Cycle check.
  const byId = new Map(wps.map((w) => [w.id, w]));
  const state = new Map();
  const visit = (id, stack) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) return errors.push(`dependency cycle: ${[...stack, id].join(' → ')}`);
    state.set(id, 1);
    for (const d of byId.get(id)?.deps ?? []) visit(d, [...stack, id]);
    state.set(id, 2);
  };
  for (const w of wps) visit(w.id, []);
  return errors;
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const [cmd, a1, a2] = process.argv.slice(2);
  const text = readFileSync(file, 'utf8');
  const wps = parse(text);
  const busyIds = new Set((arg('--busy') ?? '').split(',').filter(Boolean));
  const brief = (w) => ({
    id: w.id,
    title: w.title,
    status: w.status,
    deps: w.deps,
    owns: w.owns,
    design: w.design,
  });
  switch (cmd) {
    case 'list': {
      const status = arg('--status');
      for (const w of wps.filter((x) => !status || x.status === status)) {
        console.log(`${w.id.padEnd(6)} ${w.status.padEnd(11)} ${w.title}`);
      }
      break;
    }
    case 'show': {
      const w = wps.find((x) => x.id === a1);
      if (!w) throw new Error(`No WP ${a1}`);
      const end = wps.find((x) => x.line > w.line)?.line ?? text.split('\n').length;
      console.log(
        JSON.stringify(
          { ...brief(w), body: text.split('\n').slice(w.line, end).join('\n').trim() },
          null,
          2,
        ),
      );
      break;
    }
    case 'ready':
      console.log(JSON.stringify(readyList(wps, busyIds).map(brief), null, 2));
      break;
    case 'plan':
      console.log(JSON.stringify(plan(wps, busyIds, Number(arg('--slots') ?? 1)).map((w) => w.id)));
      break;
    case 'set-status': {
      if (!STATUSES.includes(a2)) throw new Error(`Status must be one of ${STATUSES.join(', ')}`);
      const w = wps.find((x) => x.id === a1);
      if (!w) throw new Error(`No WP ${a1}`);
      const lines = text.split('\n');
      lines[w.statusLine] = `- **Status:** ${a2}`;
      writeFileSync(file, lines.join('\n'));
      console.log(`${a1}: ${w.status} → ${a2}`);
      break;
    }
    case 'check': {
      const errors = check(wps);
      if (errors.length) {
        console.error(errors.join('\n'));
        process.exit(1);
      }
      const counts = Object.fromEntries(
        STATUSES.map((s) => [s, wps.filter((w) => w.status === s).length]),
      );
      console.log(`backlog OK: ${wps.length} WPs`, JSON.stringify(counts));
      break;
    }
    default:
      console.error('usage: backlog.mjs list|show|ready|plan|set-status|check');
      process.exit(2);
  }
}
