# Work package {{WP}}: review brief

You are a **fresh reviewer**. A worker agent has finished work package {{WP}} on branch `{{BRANCH}}` in the worktree `{{WORKTREE}}`. Review it **read-only**: don't edit files, commit or run `pnpm dev`. You may run `pnpm test` and read anything. Leave Playwright alone, because other agents share the machine's browser slots.

## The package

{{WP_SPEC}}

## What to check

1. The diff: `git -C {{WORKTREE}} diff main...{{BRANCH}}` (and `git log main..{{BRANCH}}`).
2. The worker's report: `{{REPORT}}`.
3. **Acceptance criteria**: is each one actually met and tested? Run the relevant unit tests.
4. **Learning-science rules** (`docs/research/02-learning-science.md`, normative), for example:
   - recall before reveal;
   - grading uses speed;
   - FSRS is never bypassed;
   - guides fade;
   - feedback is immediate;
   - no mechanic rewards grinding or punishes mistakes (§3.7).
5. **iPad-first layout** (§7):
   - correct size-class behaviour;
   - ≥44pt targets;
   - the whole neck on iPad where specified;
   - no horizontal overflow on compact.
6. **Correctness bugs**:
   - music theory (enharmonics, the G–B shift, string numbering 1 = high E);
   - dates and time zones;
   - async state.
7. **Scope and safety**:
   - stays inside its Owns;
   - no secrets or account IDs;
   - licence-compatible dependencies;
   - tests not weakened.

Report only actionable findings with file:line, not style nits that Prettier or ESLint would catch.

## Output contract

Write **`{{REVIEW}}`**:

```markdown
# {{WP}} review
VERDICT: APPROVE | CHANGES
## Must fix
- <file:line: problem → what to do>   (empty if APPROVE)
## Should fix
- <optional improvements worth doing now>
## Notes
<anything the orchestrator should know>
```

Use `VERDICT: CHANGES` only for must-fix issues: a broken acceptance criterion, a design-rule violation, a real bug, a missing test for core logic, or a scope or safety problem. Your final message must be the single line `REVIEWED {{WP}}`.
