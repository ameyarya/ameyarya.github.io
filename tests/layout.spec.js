const { test, expect } = require('@playwright/test');
const { load, findTileOverflow, findClippedText } = require('./helpers');

// Smallest common phone through large desktop, plus the grid breakpoints (560, 900) on both sides.
const WIDTHS = [320, 360, 375, 390, 414, 559, 561, 768, 899, 901, 1024, 1280, 1440, 1920];

for (const width of WIDTHS) {
  test.describe(`at ${width}px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await load(page);
    });

    test('page never scrolls sideways', async ({ page }) => {
      const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      expect(scroll).toBeLessThanOrEqual(inner);
    });

    test('nothing spills out of its tile', async ({ page }) => {
      expect(await page.evaluate(findTileOverflow)).toEqual([]);
    });

    test('no text is clipped', async ({ page }) => {
      expect(await page.evaluate(findClippedText)).toEqual([]);
    });

    test('tiles keep a side gutter of at least 16px', async ({ page }) => {
      const bad = await page.evaluate(() => [...document.querySelectorAll('.tile')]
        .map(t => t.getBoundingClientRect())
        .filter(r => r.left < 15.5 || window.innerWidth - r.right < 15.5).length);
      expect(bad).toBe(0);
    });

    test('header logo and controls share a center line', async ({ page }) => {
      const centers = await page.evaluate(() => [...document.querySelectorAll('.logo, .top nav > *')]
        .filter(e => getComputedStyle(e).display !== 'none')
        .map(e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; }));
      for (const c of centers) expect(Math.abs(c - centers[0])).toBeLessThanOrEqual(2);
    });

    test('project footers never overlap their stack label and buttons', async ({ page }) => {
      const overlaps = await page.evaluate(() => [...document.querySelectorAll('.proj .foot')].filter(f => {
        const s = f.querySelector('.stack')?.getBoundingClientRect();
        const a = f.querySelector('.actions')?.getBoundingClientRect();
        if (!s || !a) return false;
        return !(s.right <= a.left || a.right <= s.left || s.bottom <= a.top || a.bottom <= s.top);
      }).length);
      expect(overlaps).toBe(0);
    });

    test('no text renders below 11px', async ({ page }) => {
      const tiny = await page.evaluate(() => [...document.querySelectorAll('body *')]
        .filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()))
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 11)
        .map(e => e.textContent.trim().slice(0, 20)));
      expect(tiny).toEqual([]);
    });
  });
}

test.describe('grid columns', () => {
  const cases = [[375, 1], [700, 2], [1200, 4]];
  for (const [width, cols] of cases) {
    test(`${width}px lays out ${cols} column(s)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await load(page);
      const n = await page.evaluate(() => getComputedStyle(document.querySelector('.bento')).gridTemplateColumns.split(' ').length);
      expect(n).toBe(cols);
    });
  }

  test('single-column tiles all share the same left edge and width', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await load(page);
    const rects = await page.evaluate(() => [...document.querySelectorAll('.tile')].map(t => {
      const r = t.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.width)];
    }));
    for (const r of rects) expect(r).toEqual(rects[0]);
  });
});

test.describe('touch targets on phones', () => {
  test('every button and link pill is at least 36px tall', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await load(page);
    const small = await page.evaluate(() => [...document.querySelectorAll('a.pill, button')]
      .filter(e => getComputedStyle(e).display !== 'none' && !e.closest('.hidden'))
      .filter(e => e.getBoundingClientRect().height < 36)
      .map(e => `${e.textContent.trim()} ${Math.round(e.getBoundingClientRect().height)}px`));
    expect(small).toEqual([]);
  });

  for (const width of [320, 375, 414]) {
    test(`filter chips sit on one row spanning the content width at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await load(page);
      const { tops, left, right, gridLeft, gridRight } = await page.evaluate(() => {
        const pills = [...document.querySelectorAll('.filters .pill')].map(e => e.getBoundingClientRect());
        const grid = document.querySelector('.bento').getBoundingClientRect();
        return { tops: pills.map(r => Math.round(r.top)), left: pills[0].left, right: pills.at(-1).right, gridLeft: grid.left, gridRight: grid.right };
      });
      expect(new Set(tops).size).toBe(1);
      expect(Math.abs(left - gridLeft)).toBeLessThanOrEqual(6);
      expect(Math.abs(gridRight - right)).toBeLessThanOrEqual(6);
    });
  }

  test('filter chips never overlap each other', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 812 });
    await load(page);
    const boxes = await page.locator('.filters .pill').evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON()));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const overlap = !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
        expect(overlap).toBe(false);
      }
    }
  });
});
