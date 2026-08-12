// tests/e2e/helpers/console.ts
// Console-error / unhandled-rejection collection, shared across specs (A7).

import type { Page } from '@playwright/test';

export interface ConsoleCollector {
  errors: string[];
  pageErrors: string[];
}

/** Attaches collectors. Call before page.goto() so nothing is missed. */
export function collectConsole(page: Page): ConsoleCollector {
  const collector: ConsoleCollector = { errors: [], pageErrors: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') collector.errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    collector.pageErrors.push(err.message);
  });
  return collector;
}
