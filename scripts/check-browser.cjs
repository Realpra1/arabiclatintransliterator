// Optional real-browser checks. Install playwright-core or set PLAYWRIGHT_CORE_PATH.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE_PATH || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(join(process.env.APP_DIRECTORY || process.cwd(), 'ArabicEnglishAlphabetTranslator.html')).href);
    assert.equal(await page.locator('#errorBox').isVisible(), false);
    assert.ok(await page.locator('.alphabet-key img').evaluate(el => el.complete && el.naturalWidth > 0));
    await page.locator('#input').fill('كتب دمشق علم H2O 25°C 🙂');
    await page.waitForFunction(() => document.querySelector('#output').textContent.includes('ktb'));
    assert.ok(await page.locator('#vowelWarning').isVisible());
    assert.ok(await page.locator('#output .protected').count());
    assert.ok(await page.locator('#output .warning').count());
    assert.ok(await page.locator('#output .unmapped').count());
    const legend = await page.locator('.results-meta').boundingBox();
    const warning = await page.locator('#vowelWarning').boundingBox();
    assert.ok(legend.y + legend.height <= warning.y);
    await page.locator('#input').fill('حَصَضَطَظَجَ وَيْ ى H2O');
    await page.locator('#standardNotation').check();
    await page.waitForFunction(() => document.querySelector('#output').textContent.includes('ḥaṣaḍaṭaẓaja'));
    assert.equal(await page.locator('#output').textContent(), 'ḥaṣaḍaṭaẓaja way á H2O');
    await page.locator('#swapBtn').click();
    const arabic = await page.locator('#output').textContent();
    await page.locator('#swapBtn').click();
    assert.equal(await page.locator('#output').textContent(), 'ḥaṣaḍaṭaẓaja way á H2O');
    assert.ok(arabic.includes('جَ'));
    // Tanwin is distinct from ordinary nun, and survives actual UI reversals.
    await page.locator('#input').fill('نُونٌ بٌ بٍ بً باً');
    await page.waitForFunction(() => document.querySelector('#output').textContent === 'nūnuṇ buṇ biṇ baṇ bāṇ');
    await page.locator('#swapBtn').click();
    await page.locator('#swapBtn').click();
    assert.equal(await page.locator('#output').textContent(), 'nūnuṇ buṇ biṇ baṇ bāṇ');
    await page.locator('#standardNotation').uncheck();
    assert.equal(await page.locator('#output').textContent(), 'nūnuN buN biN baN bāN');
    await page.locator('#standardNotation').check();
    // Copy the text only, with no annotation markup.
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copiedText = text; } } }));
    await page.locator('#copyBtn').click();
    assert.equal(await page.evaluate(() => window.copiedText), await page.locator('#output').textContent());
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error('Blocked'); };
      document.execCommand = () => false;
    });
    await page.locator('#copyBtn').click();
    await page.waitForFunction(() => document.querySelector('#errorBox').textContent.includes('Ctrl+C'));
    assert.ok(await page.locator('#errorBox').isVisible());
    // Conversion failures cannot leave stale, copyable output.
    await page.evaluate(() => { window.savedConvert = MapperView.convert; MapperView.convert = () => { throw new Error('Test conversion failure'); }; });
    await page.locator('#input').fill('ب');
    await page.waitForFunction(() => document.querySelector('#errorBox').textContent.includes('Test conversion failure'));
    assert.equal(await page.locator('#output').textContent(), '');
    assert.equal(await page.locator('#copyBtn').isDisabled(), true);
    assert.equal(await page.locator('#input').inputValue(), 'ب');
    await page.evaluate(() => { MapperView.convert = window.savedConvert; });
    await page.locator('#clearBtn').click();
    assert.equal(await page.locator('#errorBox').isVisible(), false);
    // User text is rendered as text, never executable HTML.
    await page.locator('#input').fill('<img src=x onerror=alert(1)>');
    await page.waitForFunction(() => document.querySelector('#output').textContent.length > 0);
    assert.equal(await page.locator('#output img').count(), 0);
    // The entire real passage remains one conversion, with no per-word splitting.
    await page.locator('input[value="en2ar"]').check();
    await page.locator('#standardNotation').uncheck();
    await page.locator('#input').fill(readFileSync('tests/fixtures/civilization.canonical-latin.txt', 'utf8'));
    await page.waitForFunction(() => document.querySelector('#output').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#output').textContent(), readFileSync('tests/fixtures/civilization.accepted-arabic.txt', 'utf8'));
    await page.locator('input[value="ar2en"]').check();
    await page.locator('#sampleBtn').click();
    await page.locator('#standardNotation').check();
    await page.screenshot({ path: '/tmp/arabiclatin-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '/tmp/arabiclatin-mobile.png', fullPage: true });
    await page.locator('#showHighlights').uncheck();
    assert.ok(await page.locator('#output').evaluate(el => el.classList.contains('no-highlights')));
    assert.deepEqual(errors, []);
    console.log('Browser checks passed: offline image, diagnostics, notation/reverse, clipboard success/failure, conversion recovery, HTML safety, full passage, and mobile layout.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
