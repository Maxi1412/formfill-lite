const { test, expect } = require('@playwright/test');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs/promises');

async function makeTestPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText('QA FORM', { x: 100, y: 750, size: 16, font, color: rgb(0,0,0) });

  const form = pdf.getForm();
  const name = form.createTextField('name');
  name.addToPage(page, { x: 100, y: 700, width: 200, height: 20, borderWidth: 1 });

  const agree = form.createCheckBox('agree');
  agree.addToPage(page, { x: 330, y: 700, width: 20, height: 20, borderWidth: 1 });

  return Buffer.from(await pdf.save());
}

test('FormFill Lite release workflow', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(String(err)));

  await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle('FormFill Lite');
  await expect(page.locator('#installBtn')).toBeVisible();

  const manifest = await page.request.get('http://127.0.0.1:4173/manifest.webmanifest');
  expect(manifest.ok()).toBeTruthy();
  const manifestJson = await manifest.json();
  expect(manifestJson.name).toBe('FormFill Lite');
  expect(manifestJson.icons.some(x => x.sizes === '192x192')).toBeTruthy();
  expect(manifestJson.icons.some(x => x.sizes === '512x512')).toBeTruthy();

  const sw = await page.request.get('http://127.0.0.1:4173/sw.js');
  expect(sw.ok()).toBeTruthy();

  const original = await makeTestPdf();
  await page.locator('#fileInput').setInputFiles({
    name: 'qa-form.pdf',
    mimeType: 'application/pdf',
    buffer: original
  });

  await expect(page.locator('#pageStatus')).toHaveText('Page 1 / 1');
  await expect(page.locator('#statusText')).toHaveText('Ready');

  const overlay = page.locator('#overlay');
  const box = await overlay.boundingBox();
  expect(box).toBeTruthy();

  // PDF field [100,700,300,720] at 125% zoom:
  // field left is 125 CSS px and field top is 90 CSS px.
  await page.mouse.dblclick(box.x + 190, box.y + 100);
  const editor = page.locator('.inlineEditor');
  await expect(editor).toBeVisible();

  const left = parseFloat(await editor.evaluate(el => el.style.left));
  const width = parseFloat(await editor.evaluate(el => el.style.width));
  expect(left).toBeGreaterThanOrEqual(126);
  expect(left).toBeLessThanOrEqual(130);
  expect(width).toBeGreaterThan(235);

  await editor.fill('Max Test');
  await editor.press('Enter');
  await expect(page.locator('.anno.text')).toHaveText('Max Test');

  const textBefore = parseFloat(await page.locator('.anno.text').evaluate(el => el.style.left));
  await page.keyboard.press('ArrowRight');
  const textAfter = parseFloat(await page.locator('.anno.text').evaluate(el => el.style.left));
  expect(textAfter).toBeGreaterThan(textBefore);

  await page.locator('#undoBtn').click();
  const textUndo = parseFloat(await page.locator('.anno.text').evaluate(el => el.style.left));
  expect(Math.abs(textUndo - textBefore)).toBeLessThan(0.2);

  await page.locator('#redoBtn').click();
  const textRedo = parseFloat(await page.locator('.anno.text').evaluate(el => el.style.left));
  expect(textRedo).toBeGreaterThan(textUndo);

  // Add a checkmark inside the native checkbox.
  await page.locator('#checkTool').click();
  await page.mouse.click(box.x + 425, box.y + 102);
  await expect(page.locator('.anno.mark')).toHaveText('✓');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#saveBtn').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('qa-form-completed.pdf');

  const outputPath = await download.path();
  const output = await fs.readFile(outputPath);
  expect(output.length).toBeGreaterThan(original.length * 0.8);

  const completed = await PDFDocument.load(output);
  expect(completed.getPageCount()).toBe(1);
  const size = completed.getPage(0).getSize();
  expect(size.width).toBe(612);
  expect(size.height).toBe(792);

  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

  expect(pageErrors).toEqual([]);
});
