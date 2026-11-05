const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const [,, html, out, w, scale] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: +w || 1400, height: 800 }, deviceScaleFactor: +scale || 1 });
  await p.goto('file://' + path.resolve(html));
  await p.waitForTimeout(300);
  await p.screenshot({ path: out, fullPage: true });
  await b.close();
})();
