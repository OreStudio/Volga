/**
 * The country entity, driven in a real browser.
 *
 * Split into a read path and a write path, because they depend on different
 * things. Reading needs the services up. Writing needs those, plus an account
 * that was properly provisioned with roles: a hand-seeded account has no role
 * claims in its token, and the service refuses every write as though the token
 * had expired, which is a misleading thing to debug.
 *
 * The write half therefore only runs when asked for, with --write, so that the
 * read half stays useful on a system that is not bootstrapped.
 *
 *   npx tsx scripts/verify-country.ts
 *   npx tsx scripts/verify-country.ts --write
 */
import { mkdirSync } from 'node:fs';
import { chromium, type Page } from 'playwright';

const APP = process.env['VOLGA_APP_URL'] ?? 'http://127.0.0.1:5173/';
const USERNAME = process.env['VOLGA_USER'] ?? 'volga_probe';
const PASSWORD = process.env['VOLGA_PASSWORD'] ?? 'Secure-Password-123';
const SHOTS = '.runtime/screenshots';
const WRITE = process.argv.includes('--write');

let passed = 0;
let failed = 0;

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1;
    console.log(`  [PASS] ${label}`);
  } else {
    failed += 1;
    console.log(`  [FAIL] ${label}${detail === undefined ? '' : ` — ${detail}`}`);
  }
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${APP}login`, { waitUntil: 'networkidle' });
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector('h1', { timeout: 25_000 });
}

/** Switches the interface language through the control a person would use. */
async function language(page: Page, englishName: string): Promise<void> {
  await page.locator('header button[aria-haspopup="listbox"]').click();
  await page.waitForTimeout(300);
  await page.locator('ul[role="listbox"] button', { hasText: englishName }).click();
  await page.waitForTimeout(800);
}

const browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
const page = await context.newPage();
mkdirSync(SHOTS, { recursive: true });

const consoleErrors: string[] = [];
page.on('pageerror', (error) => consoleErrors.push(String(error)));

/*
 * A refused request is only an error if it was not expected.
 *
 * Reading the console text is not enough, because the text of a failed resource
 * carries no URL. So the expected refusal is recognised where the URL is known —
 * the session probe before sign-in — and everything else that fails is reported
 * with its URL, which is what makes a failure actionable.
 */
const expectedRefusals = ['/api/session'];
const failedRequests: string[] = [];
page.on('response', (response) => {
  if (response.status() < 400) return;
  const url = response.url();
  if (expectedRefusals.some((path) => url.includes(path))) return;
  failedRequests.push(`${response.status()} ${url}`);
});
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  // Resource failures are reported from the response listener, with the URL.
  if (text.includes('Failed to load resource')) return;
  consoleErrors.push(text);
});

try {
  await signIn(page);
  await page.waitForTimeout(600);
  await shot(page, '70-home');

  console.log('\nthe shell:');
  check('the sidebar lists the components', (await page.locator('aside nav > div').count()) >= 8);

  console.log('\nthe country list:');
  await page.goto(`${APP}refdata/country`, { waitUntil: 'networkidle' });
  await page.waitForSelector('tbody tr', { timeout: 25_000 });
  await page.waitForTimeout(600);

  const rows = await page.locator('tbody tr').count();
  check('records are listed', rows > 0, `${rows} rows`);
  check('the default page size is 25', rows <= 25, `${rows} rows`);

  const heading = ((await page.textContent('h1')) ?? '').trim();
  check('the heading names the collection', heading === 'Countries', heading);

  // Flags are images reached through the BFF, so a broken one is a broken route
  // rather than a missing field.
  const flags = page.locator('tbody img[src^="/api/images/"]');
  const flagCount = await flags.count();
  check('flags are rendered', flagCount > 0, `${flagCount} on this page`);
  if (flagCount > 0) {
    const loaded = await flags.first().evaluate(
      (image) => (image as HTMLImageElement).naturalWidth > 0,
    );
    check('a flag actually loads', loaded);
  }
  await shot(page, '71-country-list');

  console.log('\nsearch and paging:');
  const search = page.locator('input[type="search"]');
  check('there is a search box', (await search.count()) === 1);
  await search.fill('Brazil');
  await page.waitForTimeout(400);
  const filtered = await page.locator('tbody tr').count();
  check('search narrows the list', filtered > 0 && filtered < rows, `${filtered} of ${rows}`);
  await search.fill('');
  await page.waitForTimeout(300);

  console.log('\nthe country detail:');
  await page.locator('tbody tr').first().click();
  await page.waitForSelector('h1', { timeout: 15_000 });
  await page.waitForTimeout(500);
  const detail = ((await page.textContent('h1')) ?? '').trim();
  check('the record opens', detail.length > 0, detail);
  // A field showing its placeholder for a record that has loaded is the bug that
  // is easiest to ship, so it is asserted rather than eyeballed.
  const alpha2 = await page.locator('input#alpha2_code').inputValue();
  check('the form is filled in, not showing placeholders', alpha2.length > 0, `alpha2="${alpha2}"`);

  await page.locator('button[role="tab"]', { hasText: /Provenance/i }).click();
  await page.waitForTimeout(300);
  const provenance = (await page.textContent('body')) ?? '';
  check('provenance shows the record\u2019s audit fields', /v|1/.test(provenance) && provenance.includes('system.'));
  await shot(page, '72-country-detail');

  console.log('\nthe history:\n');
  await page.goto(`${APP}refdata/country/AR/history`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const history = (await page.textContent('body')) ?? '';
  check('the history screen opens', history.length > 0);
  check('it names the record', history.includes('AR') || history.includes('country'));
  await shot(page, '73-country-history');

  console.log('\nthe three languages:');
  for (const [englishName, expected] of [
    ['Portuguese', 'Países'],
    ['French', 'Pays'],
    ['English', 'Countries'],
  ] as const) {
    await language(page, englishName);
    await page.goto(`${APP}refdata/country`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody tr', { timeout: 20_000 });
    const localized = ((await page.textContent('h1')) ?? '').trim();
    check(`${englishName} renders the collection name`, localized === expected, localized);
  }
  await shot(page, '74-country-english');

  if (WRITE) {
    console.log('\nthe write path:');
    // Deliberately last, and gated, because it changes records and because it is
    // the half that needs a provisioned account.
    await page.goto(`${APP}refdata/country/new`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const createHeading = ((await page.textContent('h1')) ?? '').trim();
    check('the create screen opens', createHeading.length > 0, createHeading);
    await page.fill('input#alpha2_code', 'XQ');
    await page.fill('input#alpha3_code', 'XQZ');
    await page.fill('input#numeric_code', '998');
    await page.fill('input#name', 'Verification Land');
    await page.fill('input#official_name', 'The Verification Republic');
    await page.locator('button', { hasText: /^Save$/ }).first().click();
    await page.waitForTimeout(800);

    // The audit prompt, and the commit button whose label follows the operation.
    const reasons = page.locator('[role="listbox"] button[role="option"]');
    check('saving prompts for a reason', (await reasons.count()) > 0, `${await reasons.count()} reasons`);
    await shot(page, '75-country-create-reason');

    await reasons.first().click();
    await page.locator('[role="dialog"] button', { hasText: /^Create$/ }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    // The record should now exist and the screen should be showing it.
    const created = ((await page.textContent('h1')) ?? '').trim();
    check('the record is created', created.includes('Verification Land'), created);
    await shot(page, '76-country-created');

    // Amend it, which is a different write path and a different reason set.
    await page.locator('button', { hasText: /^Edit$/ }).first().click();
    await page.waitForTimeout(600);
    await page.fill('input#name', 'Verification Land amended');
    await page.locator('button', { hasText: /^Save$/ }).first().click();
    await page.waitForTimeout(800);
    const amendReasons = page.locator('[role="listbox"] button[role="option"]');
    check('amending prompts for a reason', (await amendReasons.count()) > 0);
    await amendReasons.first().click();
    await page.locator('[role="dialog"] button', { hasText: /^Save$/ }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await page
      .locator('h1', { hasText: 'amended' })
      .waitFor({ timeout: 15_000 })
      .catch(() => undefined);
    const amended = ((await page.textContent('h1')) ?? '').trim();
    check('the amendment is saved', amended.includes('amended'), amended);

    // The history should hold both versions.
    await page.goto(`${APP}refdata/country/XQ/history`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    const versions = await page.locator('ol li').count();
    check('the history holds both versions', versions >= 2, `${versions} versions`);
    await shot(page, '77-country-history-written');

    // Delete it, so the verification leaves the system as it found it.
    await page.goto(`${APP}refdata/country/XQ/edit`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.locator('button[title="Delete"]').first().click();
    await page.waitForTimeout(600);
    await page.locator('[role="dialog"] button', { hasText: /^Delete$/ }).click();
    await page.waitForTimeout(1200);
    await shot(page, '78-delete-reason');
    const deleteReasons = page.locator('[role="listbox"] button[role="option"]');
    const dialogLabel = await page.locator('[role="dialog"]').first().getAttribute('aria-label').catch(() => null);
    check('deleting prompts for a reason', (await deleteReasons.count()) > 0, `dialog="${dialogLabel}"`);
    await deleteReasons.first().click();
    await page.locator('[role="dialog"] button', { hasText: /^Confirm Delete$/ }).click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);

    await page.goto(`${APP}refdata/country`, { waitUntil: 'networkidle' });
    await page.waitForSelector('tbody tr', { timeout: 20_000 });
    const body = (await page.textContent('body')) ?? '';
    check('the record is gone, leaving the system as found', !body.includes('Verification Land'));
    await shot(page, '78-country-deleted');
  } else {
    console.log('\nthe write path: skipped (pass --write to exercise it, which needs a provisioned account)');
  }

  console.log('\nbrowser console:');
  check('no uncaught exception was thrown', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
  check('every request succeeded', failedRequests.length === 0, failedRequests.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
console.log(`screenshots: ${SHOTS}/`);
process.exitCode = failed === 0 ? 0 : 1;
