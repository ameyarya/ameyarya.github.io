// Checks that every external link is live. Hits the network, so it only runs
// when LINKCHECK=1 (and on the weekly CI schedule).
const { test, expect } = require('@playwright/test');

// Sites that block automated requests even when the page is fine.
const BOT_WALLED = ['linkedin.com', 'play.google.com'];

test.skip(!process.env.LINKCHECK, 'set LINKCHECK=1 to check external links');

test('every external link resolves', async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const hrefs = [...new Set(await page.locator('a[href^="http"]').evaluateAll(els => els.map(a => a.href)))]
    .filter(h => !BOT_WALLED.some(d => h.includes(d)));

  const dead = [];
  for (const href of hrefs) {
    const res = await request.get(href, { maxRedirects: 5, timeout: 20_000 }).catch(e => ({ status: () => e.message }));
    const status = res.status();
    if (typeof status !== 'number' || status >= 400) dead.push(`${href} → ${status}`);
  }
  expect(dead).toEqual([]);
});
