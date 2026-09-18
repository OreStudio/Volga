/**
 * Drives the real browser against the running stack.
 *
 * This is the gate that the unit tests cannot be: it proves the sign-in
 * screen, the session cookie, the BFF routes, and the accounts table all work
 * together in a browser, and it captures a screenshot as evidence.
 *
 * Prerequisites, in order:
 *   nats-server -c .runtime/nats/nats.conf
 *   scripts/run-service.sh iam --tenant ffffffff-ffff-ffff-ffff-ffffffffffff
 *   scripts/run-service.sh refdata
 *   npm run dev:bff
 *   npm run dev:web
 *
 * Run:
 *   npx tsx scripts/verify-browser.ts
 */

import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const APP_URL = process.env['VOLGA_APP_URL'] ?? 'http://127.0.0.1:5173/';
const USERNAME = process.env['ORES_PRINCIPAL'] ?? 'volga_probe';
const PASSWORD = process.env['ORES_PASSWORD'] ?? 'Secure-Password-123';
const SHOT_DIR = '.runtime/screenshots';

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (!condition) {
    failures += 1;
  }
  console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${label}${detail.length > 0 ? ` (${detail})` : ''}`);
}

async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: true });
}

async function main(): Promise<number> {
  // Prefer the browser Playwright manages; fall back to a system Chrome when
  // the bundled download is not present.
  const browser = await chromium
    .launch()
    .catch(() => chromium.launch({ channel: 'chrome' }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // An uncaught exception is always a bug. A console error is not: the app
  // probes for a session on load and the rejected-login case is exercised
  // deliberately, so both answer 401 by design.
  const pageErrors: string[] = [];
  const ignoredConsole: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      ignoredConsole.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  console.log('\nsign-in screen:');
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[name="username"]', { timeout: 15_000 });
  check('the sign-in form rendered', await page.isVisible('input[name="username"]'));
  check('the password field is masked', (await page.getAttribute('input[name="password"]', 'type')) === 'password');
  await screenshot(page, '01-signin');

  console.log('\nrejected credentials:');
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', 'definitely-the-wrong-password');
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="alert"]', { timeout: 15_000 });
  const alertText = (await page.textContent('[role="alert"]'))?.trim() ?? '';
  check('the server message is shown', alertText.length > 0, alertText);
  check('no session was established', (await context.cookies()).every((c) => c.name !== 'volga_session'));

  console.log('\nvalid credentials:');
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // The table element mounts while the query is still in flight, so wait for
  // a row rather than for the table. An empty table is itself a valid screen
  // and would otherwise race the assertion below.
  await page.waitForSelector('tbody tr', { timeout: 20_000 });
  check('the accounts table rendered', await page.isVisible('table'));

  const cookie = (await context.cookies()).find((c) => c.name === 'volga_session');
  check('a session cookie was set', cookie !== undefined);
  check('the session cookie is HttpOnly', cookie?.httpOnly === true);

  const rowCount = await page.locator('tbody tr').count();
  check('rows were loaded', rowCount > 0, `${rowCount} rows`);

  const body = (await page.textContent('body')) ?? '';
  check('the signed-in user is shown', body.includes(USERNAME));
  check('the party is shown', body.includes('System Party'));
  check('no credential field leaked into the page', !body.toLowerCase().includes('password_hash'));

  console.log('\nsearch filter:');
  await page.fill('input[type="search"]', 'sysadmin');
  // Filtering is synchronous over the loaded rows, so wait for the row count
  // to actually fall rather than for a fixed delay.
  await page
    .waitForFunction(
      (previous) => document.querySelectorAll('tbody tr').length < previous,
      rowCount,
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  const filtered = await page.locator('tbody tr').count();
  check('the search narrowed the table', filtered < rowCount, `${filtered} of ${rowCount}`);
  await screenshot(page, '02-accounts-filtered');

  console.log('\nrow detail:');
  await page.locator('tbody tr').first().click();
  await page.waitForSelector('aside[aria-label]', { timeout: 5_000 });
  check('the detail panel opened', await page.isVisible('aside[aria-label]'));
  const detail = (await page.textContent('aside[aria-label]')) ?? '';
  check('the detail panel shows the account id', /[0-9a-f]{8}-[0-9a-f]{4}/.test(detail));
  await screenshot(page, '03-account-detail');

  await page.fill('input[type="search"]', '');
  await page.waitForFunction(
    (expected) => document.querySelectorAll('tbody tr').length === expected,
    rowCount,
    { timeout: 10_000 },
  );
  await screenshot(page, '04-accounts');

  console.log('\nsign out:');
  await page.click('button:has-text("Sign out")');
  await page.waitForSelector('input[name="username"]', { timeout: 15_000 });
  check('the sign-in screen is back', await page.isVisible('input[name="username"]'));
  const afterSignOut = (await context.cookies()).find((c) => c.name === 'volga_session');
  check('the session cookie was cleared', afterSignOut === undefined || afterSignOut.value === '');

  console.log('\nbrowser console:');
  check('no uncaught exception was thrown', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check(
    'no unexpected console error was logged',
    ignoredConsole.length === 0,
    ignoredConsole.slice(0, 3).join(' | '),
  );

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  console.log(`screenshots: ${SHOT_DIR}/`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error('\nverification aborted:', error);
    process.exit(1);
  },
);
