## Claude Code Web execution policy

When `CLAUDE_CODE_REMOTE=true`, treat the environment as a small,
ephemeral CI runner with limited CPU, memory, disk, and no reliable
hardware GPU.

### Verification order

Always run checks in this order:

1. lint for changed files
2. targeted type check
3. targeted unit tests
4. the currently failing test or spec
5. Chromium smoke E2E

Do not run the full E2E suite inside an edit-fix loop.
The full suite belongs in CI.

### Playwright cloud profile

When running in Claude Code on the web:

- Chromium only
- workers=1
- retries=1
- maxFailures=1
- video=off
- screenshot=only-on-failure
- trace=on-first-retry
- use the smallest practical viewport
- reuse authentication state
- mock external third-party services

### WebGL policy

When `E2E_FAST=1`:

- use devicePixelRatio 1
- reduce canvas resolution
- disable nonessential shadows, bloom, post-processing, and particles
- use a fixed random seed
- expose deterministic game state to tests
- allow tests to advance logical simulation time directly

Never judge FPS, animation smoothness, or final visual quality under
SwiftShader. Run GPU, visual-regression, and performance tests on a
verified hardware-accelerated local or CI runner.

### Process ownership

The parent session owns long-lived processes such as:

- development servers
- databases
- Docker Compose
- file watchers

Subagents must not start persistent servers or own full E2E runs.
A subagent may diagnose one failing spec and perform at most two
patch-and-retest cycles.

### Bounded execution

Any command expected to take longer than 8 minutes must be wrapped in
a timeout or moved to CI or Remote Control.

If a command produces no output for 90 seconds:

1. inspect the process
2. inspect CPU, RAM, and disk
3. inspect network or service readiness
4. do not simply continue waiting

After two repetitions of the same failure, stop retrying and report:

- the exact failing command
- exit code
- relevant final log lines
- likely root cause
- recommended next execution environment

### Checkpointing

Commit or otherwise checkpoint completed work before starting a long
build, browser test, Docker operation, or migration.
