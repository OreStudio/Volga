/**
 * Drives the real browser against the running stack.
 *
 * This is the gate the unit tests cannot be: it proves the landing page, the
 * connection screens, the sign-in screen, the session cookie and the accounts
 * table all work together in a browser, and it captures screenshots as
 * evidence.
 *
 * Prerequisites, in order:
 *   nats-server -c .runtime/nats/nats.conf
 *   scripts/run-service.sh iam --tenant ffffffff-ffff-ffff-ffff-ffffffffffff
 *   scripts/run-service.sh refdata
 *   npx tsx scripts/seed-connections-store.ts
 *   npx tsx --env-file=.runtime/verify.env packages/bff/src/main.ts
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

/**
 * Follows a navigation link and waits for the screen it opens.
 *
 * Waiting for the network is not enough: the route changes and React renders
 * afterwards, so the heading is what confirms the screen is really there.
 */
async function goTo(page: Page, path: string, expectedTitle: string): Promise<void> {
  // The sign-in link wraps a button, so it has no text of its own. Targeting the
  // destination works for every link and is what the router uses anyway.
  await page.click(`nav a[href="${path}"]`);
  await page.waitForSelector(`h1:text-is("${expectedTitle}")`, { timeout: 15_000 });
}

/**
 * The saved-connection chooser.
 *
 * Anchored to the field whose own label starts with "Connection", because the
 * label filter beside it also contains that word.
 */
const CONNECTION_CHOOSER = 'label:has(> span:text-matches("^Connection")) select';

async function main(): Promise<number> {
  const browser = await chromium
    .launch()
    .catch(() => chromium.launch({ channel: 'chrome' }));
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      consoleErrors.push(message.text());
    }
  });

  console.log('\nthe landing page:');
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('h1', { timeout: 15_000 });
  check('the landing page is the entry point', await page.isVisible('h1:text-is("Trading operations, in the browser.")'));
  check('the store path is shown', ((await page.textContent('body')) ?? '').includes('.db'));
  check('no session is open yet', (await context.cookies()).every((c) => c.name !== 'volga_session'));
  await screenshot(page, '09-landing');

  console.log('\nnavigation:');
  for (const link of ['Connections', 'Import', 'Export']) {
    check(`the ${link} link is offered`, await page.isVisible(`nav a:text-is("${link}")`));
  }
  // The link is an anchor wrapping a button, so its own text is empty. The
  // accessible name is what a person and a screen reader go by.
  check(
    'the sign in link is offered',
    await page.isVisible('nav a[href="/login"]'),
    await page.locator('nav a[href="/login"]').textContent() ?? '',
  );

  console.log('\nthe connections manager:');
  await goTo(page, '/connections', 'Connections');
  await page.waitForSelector('table', { timeout: 15_000 });
  const manager = (await page.textContent('body')) ?? '';
  check('the manager shows the saved environment', manager.includes('festive_dijkstra'));
  check('the manager shows the saved connection', manager.includes('volga_probe'));
  check('the manager shows where the database is', manager.includes('.db'));
  check('the manager reports the store as unlocked', manager.includes('unlocked'));
  await screenshot(page, '11-connections-manager');

  console.log('\nthe Export screen:');
  await goTo(page, '/connections/export', 'Export connections');
  const exporter = (await page.textContent('body')) ?? '';
  check('it explains the database copy', exporter.includes('Copy the database'));
  check(
    'it offers a copy without passwords',
    exporter.includes('Without passwords'),
  );
  await screenshot(page, '12-export');

  console.log('\nthe Import screen:');
  await goTo(page, '/connections/import', 'Import connections');
  const importer = (await page.textContent('body')) ?? '';
  check('it offers a file chooser', await page.isVisible('input[type="file"]'));
  check('it offers a dry run', importer.includes('Check first'));
  // This store has a master password, so the warning must not appear.
  check(
    'it does not warn about a missing master password when there is one',
    !importer.includes('This store has no master password yet'),
  );
  await screenshot(page, '13-import');

  console.log('\nthe sign in screen:');
  await goTo(page, '/login', 'Sign in');
  await page.waitForSelector('input[name="username"]', { timeout: 15_000 });
  check('the username field is present', await page.isVisible('input[name="username"]'));
  check(
    'the password field is masked',
    (await page.getAttribute('input[name="password"]', 'type')) === 'password',
  );
  check('the splash banner is gone', (await page.isVisible('.signin__banner')) === false);
  check('a connection chooser is offered', await page.isVisible(CONNECTION_CHOOSER));
  check('the server is behind a disclosure', await page.isVisible('details'));

  // Show password is a toggle acting on the field rather than a checkbox.
  await page.click('button:has-text("Show")');
  check(
    'show password reveals the field',
    (await page.getAttribute('input[name="password"]', 'type')) === 'text',
  );
  await page.click('button:has-text("Hide")');

  const options = await page.locator(`${CONNECTION_CHOOSER} option`).allTextContents();
  check(
    'the chooser offers the saved environment and connection',
    options.some((text) => text.includes('festive_dijkstra')),
    options.slice(1, 4).join(' | '),
  );
  await screenshot(page, '14-login');

  console.log('\nrejected credentials:');
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', 'definitely-the-wrong-password');
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="alert"]', { timeout: 20_000 });
  const alertText = (await page.textContent('[role="alert"]'))?.trim() ?? '';
  check('the server message is shown', alertText.length > 0, alertText);
  check('no session was established', (await context.cookies()).every((c) => c.name !== 'volga_session'));

  console.log('\nchoosing a saved connection fills the form:');
  // Clear the deliberate wrong password first, so what is asserted is that the
  // saved credential is used rather than anything typed.
  await page.fill('input[name="password"]', '');
  const connectionValue = await page
    .locator(`${CONNECTION_CHOOSER} option`)
    .evaluateAll((options) => {
      const match = options.find((option) => option.text.startsWith('festive_dijkstra: volga_probe'));
      return match?.value ?? '';
    });
  check('the saved connection has a choosable value', connectionValue.length > 0, connectionValue);
  await page.selectOption(CONNECTION_CHOOSER, connectionValue);
  const filledUsername = await page.inputValue('input[name="username"]');
  check('the username is filled from the saved connection', filledUsername === USERNAME, filledUsername);
  check('a previously typed password is cleared', (await page.inputValue('input[name="password"]')) === '');
  await screenshot(page, '14-login-filled');

  console.log('\nsigning in with the saved credential:');
  await page.click('button[type="submit"]');
  // The table element mounts while the query is still in flight, so wait for a
  // row rather than for the table.
  await page.waitForSelector('tbody tr', { timeout: 25_000 });
  check('the accounts table rendered', await page.isVisible('table'));
  const cookie = (await context.cookies()).find((c) => c.name === 'volga_session');
  check('a session cookie was set', cookie !== undefined);
  check('the session cookie is HttpOnly', cookie?.httpOnly === true);

  const rowCount = await page.locator('tbody tr').count();
  check('accounts were loaded', rowCount > 0, `${rowCount} rows`);
  const accounts = (await page.textContent('body')) ?? '';
  check('the signed-in user is shown', accounts.includes(USERNAME));
  check('no credential field leaked into the page', !accounts.toLowerCase().includes('password_hash'));
  await screenshot(page, '15-accounts');

  console.log('\nsigning out:');
  await page.click('button:has-text("Sign out")');
  await page.waitForSelector('nav a[href="/login"]', { timeout: 15_000 });
  check('navigation remains available', await page.isVisible('nav a:text-is("Connections")'));
  const after = (await context.cookies()).find((c) => c.name === 'volga_session');
  check('the session cookie was cleared', after === undefined || after.value === '');

  console.log('\nbrowser console:');
  check('no uncaught exception was thrown', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('no unexpected console error was logged', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

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
