const { test, expect } = require('@playwright/test');
const { load, findContrastFailures } = require('./helpers');

// Repos that must never be linked from the public site.
const PRIVATE_REPOS = ['smart-dog-collar'];

test.describe('links', () => {
  test.beforeEach(async ({ page }) => load(page));

  test('external links open in a new tab safely', async ({ page }) => {
    const bad = await page.locator('a[href^="http"]').evaluateAll(els => els
      .filter(a => a.target !== '_blank' || !/\bnoopener\b/.test(a.rel))
      .map(a => a.href));
    expect(bad).toEqual([]);
  });

  test('external links use https', async ({ page }) => {
    const hrefs = await page.locator('a[href^="http:"]').evaluateAll(els => els.map(a => a.href));
    expect(hrefs).toEqual([]);
  });

  test('no links to dead free-tier hosts', async ({ page }) => {
    const hrefs = await page.locator('a[href*="herokuapp.com"]').count();
    expect(hrefs).toBe(0);
  });

  test('no links to private repos', async ({ page }) => {
    const hrefs = await page.locator('a').evaluateAll(els => els.map(a => a.href));
    for (const repo of PRIVATE_REPOS) expect(hrefs.join(' ')).not.toContain(repo);
  });

  test('GitHub repo links point at this account', async ({ page }) => {
    const hrefs = await page.locator('a[href*="github.com/"]').evaluateAll(els => els.map(a => a.href));
    for (const h of hrefs) expect(h).toMatch(/^https:\/\/github\.com\/ameyarya(\/[\w.-]+)?\/?$/);
  });

  test('every in-page anchor has a target', async ({ page }) => {
    const missing = await page.locator('a[href^="#"]').evaluateAll(els => els
      .map(a => a.getAttribute('href').slice(1))
      .filter(id => id && !document.getElementById(id)));
    expect(missing).toEqual([]);
  });

  test('no empty or placeholder links', async ({ page }) => {
    const bad = await page.locator('a').evaluateAll(els => els
      .filter(a => !a.getAttribute('href') || /example\.com|TODO|javascript:/i.test(a.getAttribute('href')))
      .map(a => a.outerHTML.slice(0, 80)));
    expect(bad).toEqual([]);
  });

  test('every link and button has a readable name', async ({ page }) => {
    const unnamed = await page.locator('a, button').evaluateAll(els => els
      .filter(e => !(e.textContent.trim() || e.getAttribute('aria-label')))
      .map(e => e.outerHTML.slice(0, 80)));
    expect(unnamed).toEqual([]);
  });
});

test.describe('document', () => {
  test.beforeEach(async ({ page }) => load(page));

  test('has title, description, language, and viewport', async ({ page }) => {
    await expect(page).toHaveTitle(/Amey Arya/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{30,}/);
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  });

  test('has exactly one h1 and no skipped heading levels', async ({ page }) => {
    const levels = await page.locator('h1, h2, h3, h4, h5, h6').evaluateAll(els => els.map(e => Number(e.tagName[1])));
    expect(levels.filter(l => l === 1)).toHaveLength(1);
    expect(levels[0]).toBe(1);
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
  });

  test('ids are unique', async ({ page }) => {
    const ids = await page.locator('[id]').evaluateAll(els => els.map(e => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every project has a title, a description, and a stack label', async ({ page }) => {
    const bad = await page.locator('.proj').evaluateAll(els => els.filter(e =>
      !e.querySelector('h3')?.textContent.trim() ||
      !e.querySelector('.ps .v')?.textContent.trim() ||
      !e.querySelector('.stack')?.textContent.trim()).length);
    expect(bad).toBe(0);
  });

  test('positions the work as stack-agnostic (no iOS-only framing)', async ({ page }) => {
    const text = await page.locator('main').innerText();
    expect(text).not.toMatch(/\biOS (Engineer|Infrastructure)\b/i);
  });
});

for (const scheme of ['light', 'dark']) {
  test(`all text meets WCAG AA contrast in ${scheme} mode`, async ({ page }) => {
    await load(page, { colorScheme: scheme });
    expect(await page.evaluate(findContrastFailures)).toEqual([]);
  });
}
