const { test, expect } = require('@playwright/test');
const { load } = require('./helpers');

const CATEGORIES = ['hardware', 'ai', 'software'];

test.describe('build filters', () => {
  test.beforeEach(async ({ page }) => load(page));

  test('every project belongs to at least one known category', async ({ page }) => {
    const cats = await page.locator('.proj').evaluateAll(els => els.map(e => (e.dataset.cat || '').split(' ').filter(Boolean)));
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) {
      expect(c.length).toBeGreaterThan(0);
      for (const name of c) expect(CATEGORIES).toContain(name);
    }
  });

  test('each filter has a button and none of them empties the grid', async ({ page }) => {
    for (const f of CATEGORIES) {
      await page.click(`.filters [data-f="${f}"]`);
      const visible = page.locator('.proj:not(.hidden)');
      expect(await visible.count()).toBeGreaterThan(0);
      for (const cat of await visible.evaluateAll(els => els.map(e => e.dataset.cat))) {
        expect(cat.split(' ')).toContain(f);
      }
    }
  });

  test('a project in two categories shows under both', async ({ page }) => {
    const multi = page.locator('.proj[data-cat~="hardware"][data-cat~="ai"]').first();
    await page.click('[data-f="hardware"]');
    await expect(multi).toBeVisible();
    await page.click('[data-f="ai"]');
    await expect(multi).toBeVisible();
    await page.click('[data-f="software"]');
    await expect(multi).toBeHidden();
  });

  test('"All" restores every project after filtering', async ({ page }) => {
    const total = await page.locator('.proj').count();
    await page.click('[data-f="hardware"]');
    await page.click('[data-f="all"]');
    await expect(page.locator('.proj:not(.hidden)')).toHaveCount(total);
  });

  test('clicking the active filter again keeps it applied', async ({ page }) => {
    await page.click('[data-f="ai"]');
    const n = await page.locator('.proj:not(.hidden)').count();
    await page.click('[data-f="ai"]');
    await expect(page.locator('.proj:not(.hidden)')).toHaveCount(n);
  });

  test('exactly one filter is pressed at a time', async ({ page }) => {
    for (const f of ['all', ...CATEGORIES]) {
      await page.click(`[data-f="${f}"]`);
      await expect(page.locator('.filters [aria-pressed="true"]')).toHaveCount(1);
      await expect(page.locator(`[data-f="${f}"]`)).toHaveAttribute('aria-pressed', 'true');
    }
  });

  test('filters work from the keyboard', async ({ page }) => {
    await page.focus('[data-f="hardware"]');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-f="hardware"]')).toHaveAttribute('aria-pressed', 'true');
    await page.focus('[data-f="software"]');
    await page.keyboard.press('Space');
    await expect(page.locator('[data-f="software"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('rapid clicking ends on the last filter chosen', async ({ page }) => {
    for (let i = 0; i < 5; i++) for (const f of CATEGORIES) await page.click(`[data-f="${f}"]`);
    await expect(page.locator('[data-f="software"]')).toHaveAttribute('aria-pressed', 'true');
    const cats = await page.locator('.proj:not(.hidden)').evaluateAll(els => els.map(e => e.dataset.cat));
    for (const c of cats) expect(c.split(' ')).toContain('software');
  });
});

test.describe('theme', () => {
  const bg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const LIGHT = 'rgb(245, 245, 244)';
  const DARK = 'rgb(12, 10, 9)';

  test('follows the system light setting', async ({ page }) => {
    await load(page, { colorScheme: 'light' });
    expect(await bg(page)).toBe(LIGHT);
  });

  test('follows the system dark setting', async ({ page }) => {
    await load(page, { colorScheme: 'dark' });
    expect(await bg(page)).toBe(DARK);
  });

  test('toggle flips from the system theme, not from a hard-coded default', async ({ page }) => {
    await load(page, { colorScheme: 'dark' });
    await page.click('#theme');
    expect(await bg(page)).toBe(LIGHT);
    await page.click('#theme');
    expect(await bg(page)).toBe(DARK);
  });

  test('choice survives a reload', async ({ page }) => {
    await load(page, { colorScheme: 'light' });
    await page.click('#theme');
    await page.reload();
    expect(await bg(page)).toBe(DARK);
  });

  test('saved choice beats the system setting', async ({ page }) => {
    await load(page, { colorScheme: 'light' });
    await page.click('#theme');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.reload();
    expect(await bg(page)).toBe(DARK);
  });

  test('works when storage is blocked (private mode, disabled cookies)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { get: boom });
    });
    await load(page, { colorScheme: 'light' });
    await page.click('#theme');
    expect(await bg(page)).toBe(DARK);
    // The rest of the page still works after the theme script.
    await page.click('[data-f="hardware"]');
    await expect(page.locator('[data-f="hardware"]')).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
  });

  test('ignores a garbage value left in storage', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('theme', 'purple'); } catch (e) {} });
    await load(page, { colorScheme: 'light' });
    expect(await bg(page)).toBe(LIGHT);
  });
});

test.describe('page health', () => {
  test('loads without script errors or failed local requests', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('requestfailed', r => { if (r.url().startsWith('http://localhost')) errors.push(`failed: ${r.url()}`); });
    await load(page);
    expect(errors).toEqual([]);
  });

  test('still renders and lays out if Google Fonts is unreachable', async ({ page }) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await page.setViewportSize({ width: 375, height: 812 });
    await load(page);
    await expect(page.locator('h1')).toBeVisible();
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
  });

  test('tiles are fully visible with reduced motion', async ({ page }) => {
    await load(page, { reducedMotion: 'reduce' });
    const faded = await page.locator('.tile').evaluateAll(els => els.filter(e => getComputedStyle(e).opacity !== '1').length);
    expect(faded).toBe(0);
  });

  test('tiles finish their entrance animation fully visible', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.waitForTimeout(2000);
    const faded = await page.locator('.tile').evaluateAll(els => els.filter(e => getComputedStyle(e).opacity !== '1').length);
    expect(faded).toBe(0);
  });

  test('works with JavaScript disabled: content shows, every project visible', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.proj.hidden')).toHaveCount(0);
    await ctx.close();
  });

  test('footer shows the current year', async ({ page }) => {
    await load(page);
    await expect(page.locator('#yr')).toHaveText(String(new Date().getFullYear()));
  });

  test('in-page nav links land on their sections', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await load(page);
    for (const id of ['builds', 'work']) {
      await page.click(`.top nav a[href="#${id}"]`);
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
  });
});
