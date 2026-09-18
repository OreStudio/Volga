/**
 * Drives the real browser against the running stack.
 *
 * This is the gate the unit tests cannot be: it proves the menu shell, the
 * connections screens, the sign-in screen, the session cookie and the accounts
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
 * Opens a menu by its label and clicks one of its items.
 *
 * The item is matched exactly, because a substring match would let "Import from
 * a file" satisfy a search for a shorter label.
 */
async function useMenu(page: Page, menu: string, item: string, expectedTitle: string): Promise<void> {
  await page.click(`.menu__button:text-is("${menu}")`);
  await page.waitForSelector('.menu__dropdown');
  await page.click(`.menu__item-label:text-is("${item}")`);
  // Waiting for the network is not enough: the route changes and React renders
  // afterwards, so the heading is what confirms the screen is really there.
  await page.waitForSelector(`h1:text-is("${expectedTitle}")`, { timeout: 15_000 });
}

/** The chooser on the sign-in screen, which is not the only select on it. */
const QUICK_CONNECT = 'label:has-text("Quick connect") select';

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

  console.log('\nmenus before sign-in:');
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.menubar', { timeout: 15_000 });
  check('the menu bar is present', await page.isVisible('.menubar'));
  check('the Connections menu is offered', await page.isVisible('.menu__button:text-is("Connections")'));
  check('the Login menu is offered', await page.isVisible('.menu__button:text-is("Login")'));
  check('no session is open yet', (await context.cookies()).every((c) => c.name !== 'volga_session'));

  console.log('\nthe Connections menu:');
  await page.click('.menu__button:text-is("Connections")');
  await page.waitForSelector('.menu__dropdown');
  check('the menu opens', await page.isVisible('.menu__dropdown'));
  check(
    'it offers to manage connections',
    await page.isVisible('.menu__item-label:text-is("Manage connections")'),
  );
  check(
    'it offers to import',
    await page.isVisible('.menu__item-label:text-is("Import from a file")'),
  );
  check(
    'it offers to export',
    await page.isVisible('.menu__item-label:text-is("Export to a file")'),
  );
  await screenshot(page, '10-menu-open');

  await page.click('.menu__item-label:text-is("Manage connections")');
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('table', { timeout: 15_000 });
  const manager = (await page.textContent('body')) ?? '';
  check('the manager shows the saved environment', manager.includes('festive_dijkstra'));
  check('the manager shows the saved connection', manager.includes('volga_probe'));
  check('the manager shows where the database is', manager.includes('.db'));
  check('the manager reports the store as unlocked', manager.includes('unlocked'));
  await screenshot(page, '11-connections-manager');

  console.log('\nthe Export screen:');
  await useMenu(page, 'Connections', 'Export to a file', 'Export connections');
  const exporter = (await page.textContent('body')) ?? '';
  check('it explains the database copy', exporter.includes('Copy the database'));
  check('it offers a copy without passwords', exporter.includes('without passwords'));
  await screenshot(page, '12-export');

  console.log('\nthe Import screen:');
  await useMenu(page, 'Connections', 'Import from a file', 'Import connections');
  const importer = (await page.textContent('body')) ?? '';
  check('it offers a file chooser', await page.isVisible('input[type="file"]'));
  check('it offers a dry run', importer.includes('Check first'));
  // This store has a master password, so the warning must not appear.
  check(
    'it does not warn about a missing master password when there is one',
    !importer.includes('This store has no master password yet'),
  );
  await screenshot(page, '13-import');

  console.log('\nthe Login screen:');
  await useMenu(page, 'Login', 'Sign in', 'Sign in');
  await page.waitForSelector('input[name="username"]', { timeout: 15_000 });
  check('the banner artwork is shown', await page.isVisible('.signin__banner'));
  check('the username field is present', await page.isVisible('input[name="username"]'));
  check('the password field is masked', (await page.getAttribute('input[name="password"]', 'type')) === 'password');
  check('a quick connect chooser is offered', await page.isVisible(QUICK_CONNECT));
  check('the server field is present', await page.isVisible('.field__input[placeholder="localhost"]'));

  // The chooser is the point of the screen: picking a saved connection should
  // fill in who to sign in as and where to connect.
  const options = await page.locator(`${QUICK_CONNECT} option`).allTextContents();
  check(
    'the chooser offers the saved environment and connection',
    options.some((text) => text.includes('festive_dijkstra')),
    options.slice(1, 4).join(' | '),
  );

  console.log('\nrejected credentials:');
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', 'definitely-the-wrong-password');
  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="alert"]', { timeout: 20_000 });
  const alertText = (await page.textContent('[role="alert"]'))?.trim() ?? '';
  check('the server message is shown', alertText.length > 0, alertText);
  check('no session was established', (await context.cookies()).every((c) => c.name !== 'volga_session'));

  console.log('\nquick connect fills the form:');
  // Clear the deliberate wrong password first, so what is asserted is that the
  // saved credential is used rather than anything typed.
  await page.fill('input[name="password"]', '');
  const connectionValue = await page
    .locator(`${QUICK_CONNECT} option`)
    .evaluateAll((options) => {
      const match = options.find((option) => option.text.startsWith('festive_dijkstra: volga_probe'));
      return match?.value ?? '';
    });
  check('the saved connection has a choosable value', connectionValue.length > 0, connectionValue);
  await page.selectOption(QUICK_CONNECT, connectionValue);
  const filledUsername = await page.inputValue('input[name="username"]');
  check('the username is filled from the saved connection', filledUsername === USERNAME, filledUsername);
  check('a previously typed password is cleared', (await page.inputValue('input[name="password"]')) === '');
  await screenshot(page, '14-login-filled');

  console.log('\nsigning in with the saved credential:');
  await page.click('button[type="submit"]');
  await page.waitForSelector('table', { timeout: 25_000 });
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
  await page.waitForSelector('.menubar', { timeout: 15_000 });
  check('the menus remain available', await page.isVisible('.menu__button:text-is("Connections")'));
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
