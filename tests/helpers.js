// Shared helpers for the portfolio test suite.

/** Load the page with entrance animations finished so geometry is final. */
async function load(page, { colorScheme, reducedMotion = 'reduce' } = {}) {
  if (colorScheme || reducedMotion) {
    await page.emulateMedia({ colorScheme, reducedMotion });
  }
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
}

/** Every visible element whose box pokes outside its tile (1px tolerance). */
function findTileOverflow() {
  const out = [];
  for (const tile of document.querySelectorAll('.tile:not(.hidden)')) {
    const t = tile.getBoundingClientRect();
    for (const el of tile.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.left < t.left - 1 || r.right > t.right + 1 || r.top < t.top - 1 || r.bottom > t.bottom + 1) {
        out.push(`${el.tagName.toLowerCase()}.${el.className} "${el.textContent.trim().slice(0, 30)}" in "${tile.querySelector('h1,h3,.eyebrow')?.textContent.trim().slice(0, 30)}"`);
      }
    }
  }
  return out;
}

/** Text elements whose content is wider than their box (clipped or overflowing). */
function findClippedText() {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!el.childNodes.length || el.closest('.hidden')) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== 'inline') {
      out.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 40)}" ${el.scrollWidth}>${el.clientWidth}`);
    }
  }
  return out;
}

/**
 * WCAG contrast failures for every visible text node.
 * Resolves the effective background by walking ancestors and folds in ancestor opacity.
 */
function findContrastFailures() {
  const parse = c => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const bgOf = el => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a === 1) break; }
    }
    return layers.reverse().reduce((acc, c) => blend(c, acc), { r: 255, g: 255, b: 255, a: 1 });
  };
  const opacityOf = el => {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };

  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    // Decorative glyphs (aria-hidden) are exempt from WCAG text contrast.
    if (el.closest('.hidden, [aria-hidden="true"]')) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    const bg = bgOf(el);
    const fg = parse(cs.color);
    const fgEff = blend({ ...fg, a: fg.a * opacityOf(el) }, bg);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const min = large ? 3 : 4.5;
    const got = ratio(fgEff, bg);
    if (got < min) out.push(`"${el.textContent.trim().slice(0, 30)}" ${got.toFixed(2)} < ${min}`);
  }
  return out;
}

module.exports = { load, findTileOverflow, findClippedText, findContrastFailures };
