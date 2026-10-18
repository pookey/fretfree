#!/usr/bin/env node
// Orchestrator state in .orchestrator/state.json (git-ignored), so a fresh
// orchestrator session can resume after a crash or context reset.
//
//   state.mjs show                         print state
//   state.mjs init                         create if missing
//   state.mjs set <key> <json>             set a top-level key (phase, ceiling, paused…)
//   state.mjs worker <WP> <json-patch>     merge a patch into workers[WP] (creates it)
//   state.mjs drop <WP>                    remove a worker entry (after cleanup)
//   state.mjs tab-add <tab_id> <label>     record a tab the orchestrator created
//   state.mjs tab-drop <tab_id>
//   state.mjs alloc-port <WP>              allocate a unique dev-port base for a worker
//   state.mjs event <type> [detail]        append an event (usage-limit, ship-failed, …)
//   state.mjs sample                       record active workers vs ceiling (parallelism log)
//   state.mjs active                       comma-separated WPs currently in flight
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const commonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
  encoding: 'utf8',
}).trim();
const mainRoot = commonDir.replace(/\/\.git$/, '');
const file = join(mainRoot, '.orchestrator/state.json');

const EMPTY = {
  version: 1,
  phase: 'serial', // 'serial' until the M1 contracts land, then 'fanout'
  ceiling: 2,
  paused: null, // { since, reason } while backing off usage limits
  workers: {},
  tabs: [],
  events: [],
  parallelism: [],
};

const IN_FLIGHT = ['starting', 'working', 'reviewing', 'fixing', 'integrating'];

function load() {
  if (!existsSync(file)) return structuredClone(EMPTY);
  return { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(file, 'utf8')) };
}

function save(s) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
  renameSync(tmp, file); // atomic replace
}

const now = () => new Date().toISOString();
const [cmd, a1, a2] = process.argv.slice(2);
const s = load();

switch (cmd) {
  case 'show':
    console.log(JSON.stringify(s, null, 2));
    break;
  case 'init':
    save(s);
    console.log(file);
    break;
  case 'set':
    s[a1] = JSON.parse(a2);
    save(s);
    break;
  case 'worker': {
    const patch = JSON.parse(a2 ?? '{}');
    const prev = s.workers[a1] ?? { wp: a1, attempts: 0, startedAt: now() };
    s.workers[a1] = { ...prev, ...patch, updatedAt: now() };
    save(s);
    console.log(JSON.stringify(s.workers[a1]));
    break;
  }
  case 'drop':
    delete s.workers[a1];
    save(s);
    break;
  case 'tab-add':
    s.tabs.push({ tab_id: a1, label: a2, createdAt: now() });
    save(s);
    break;
  case 'tab-drop':
    s.tabs = s.tabs.filter((t) => t.tab_id !== a1);
    save(s);
    break;
  case 'alloc-port': {
    // Each worker gets a block of 10 ports from 5200 (dev server = base).
    const used = new Set(
      Object.values(s.workers)
        .map((w) => w.port)
        .filter(Boolean),
    );
    let port = 5200;
    while (used.has(port)) port += 10;
    s.workers[a1] = {
      ...(s.workers[a1] ?? { wp: a1, attempts: 0, startedAt: now() }),
      port,
      updatedAt: now(),
    };
    save(s);
    console.log(port);
    break;
  }
  case 'event':
    s.events.push({ at: now(), type: a1, detail: a2 ?? null });
    s.events = s.events.slice(-500);
    save(s);
    break;
  case 'sample': {
    const active = Object.values(s.workers).filter((w) => IN_FLIGHT.includes(w.status)).length;
    s.parallelism.push({
      at: now(),
      active,
      ceiling: s.ceiling,
      idle: Math.max(0, s.ceiling - active),
    });
    s.parallelism = s.parallelism.slice(-2000);
    save(s);
    console.log(JSON.stringify(s.parallelism.at(-1)));
    break;
  }
  case 'active':
    console.log(
      Object.values(s.workers)
        .filter((w) => IN_FLIGHT.includes(w.status))
        .map((w) => w.wp)
        .join(','),
    );
    break;
  default:
    console.error(
      'usage: state.mjs show|init|set|worker|drop|tab-add|tab-drop|alloc-port|event|sample|active',
    );
    process.exit(2);
}
