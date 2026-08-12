#!/usr/bin/env node
/**
 * verify = typecheck && lint && test:unit && build && test:e2e && test:e2e:full
 * Runs each gate in order with clear pass/fail banners; stops at the first
 * failure (matching `&&` chaining semantics) and exits non-zero.
 *
 * tests/e2e/full-loop.spec.ts does not exist until the Wave 4 Integrator
 * adds it — `npm run test:e2e:full` passes `--pass-with-no-tests` so its
 * absence never fails verify before then.
 */
import { spawnSync } from 'node:child_process';

const steps = [
  ['typecheck', 'npm', ['run', 'typecheck']],
  ['lint', 'npm', ['run', 'lint']],
  ['test:unit', 'npm', ['run', 'test:unit']],
  ['build', 'npm', ['run', 'build']],
  ['test:e2e', 'npm', ['run', 'test:e2e']],
  ['test:e2e:full', 'npm', ['run', 'test:e2e:full']],
];

const started = Date.now();

for (const [name, cmd, args] of steps) {
  const label = `▶ ${name}`;
  console.log(`\n${'='.repeat(60)}\n${label}\n${'='.repeat(60)}`);
  const stepStarted = Date.now();
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  const ms = Date.now() - stepStarted;
  if (result.status !== 0) {
    console.error(`\n✗ ${name} FAILED (exit ${String(result.status)}) after ${String(ms)}ms`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${name} passed (${String(ms)}ms)`);
}

console.log(`\n${'='.repeat(60)}\nALL GATES PASSED in ${String(Date.now() - started)}ms\n${'='.repeat(60)}`);
process.exit(0);
