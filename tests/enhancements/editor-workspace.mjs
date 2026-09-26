import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Uses only the disposable local database and mocked services from browser.mjs.
export async function checkEditorWorkspace(page, base, viewport) {
  console.log(`Checking editor workspace interactions at ${viewport.width}px`);
  await page.goto(base + '/editor/reporters/settings/');
  const payment = page.getByRole('tab', { name: 'Applications & payment', exact: true });
  const card = page.getByRole('tab', { name: 'ID card', exact: true });
  const policy = page.getByRole('tab', { name: 'Reporter policy', exact: true });
  await expect(payment).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: `test-results/enhancements/editor-settings-${viewport.width}.png` });
  const initialFee = await page.locator('[name="fee"]').inputValue();
  await page.locator('[name="fee"]').fill('5000');
  await page.locator('[name="instructionsHi"]').fill('यह परीक्षण पाठ है। इसे सहेजे बिना टैब बदलने पर भी बने रहना चाहिए।');
  await page.locator('[name="qr"]').setInputFiles({ name: 'preview-only.png', mimeType: 'image/png', buffer: Buffer.from('not submitted') });
  const posts = [];
  const record = request => { if (request.method() === 'POST') posts.push(request.url()); };
  page.on('request', record);
  await card.click();
  await expect(page.locator('#reporter-card-design')).toBeVisible();
  await expect(page.locator('#reporter-payment-settings')).toBeHidden();
  assert.equal(new URL(await page.locator('#reporter-card-design form').getAttribute('action'), base).pathname, '/api/editor/reporters/action/');
  await policy.click();
  await expect(page.locator('[name="bodyEn"]')).toBeVisible();
  await payment.click();
  assert.equal(await page.locator('[name="fee"]').inputValue(), '5000');
  assert.match(await page.locator('[name="instructionsHi"]').inputValue(), /परीक्षण पाठ/);
  assert.equal(await page.locator('[name="qr"]').evaluate(input => input.files.length), 1, 'Tabs preserve selected uploads');
  assert.deepEqual(posts, [], 'Navigation does not submit any form');
  page.off('request', record);
  await page.locator('[name="fee"]').fill(initialFee);
  await page.locator('[name="qr"]').setInputFiles([]);

  // Keyboard activation, browser history, and policy API redirect fragments.
  await payment.focus(); await page.keyboard.press('ArrowRight');
  await expect(card).toBeFocused();
  await expect(card).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End'); await expect(policy).toBeFocused();
  await page.goBack(); await expect(card).toHaveAttribute('aria-selected', 'true');
  await page.goForward(); await expect(policy).toHaveAttribute('aria-selected', 'true');
  await page.reload(); await expect(policy).toHaveAttribute('aria-selected', 'true');

  // A required advanced field cannot remain hidden when native validation fails.
  await card.click();
  const advanced = page.locator('#reporter-card-design details');
  await advanced.locator('summary').click();
  const layout = await page.locator('[name="layout"]').inputValue();
  await page.locator('[name="layout"]').fill('');
  await advanced.locator('summary').click();
  await page.getByRole('button', { name: 'Save new design version' }).click();
  await expect(advanced).toHaveAttribute('open', '');
  await expect(page.locator('[name="layout"]')).toBeFocused();
  await page.locator('[name="layout"]').fill(layout);
  if (viewport.width === 1440) {
    await page.locator('[name="reviewed"]').check();
    await page.getByRole('button', { name: 'Save new design version' }).click();
    await page.waitForURL(url => url.searchParams.get('saved') === '1');
    await expect(page.getByRole('tab', { name: 'ID card', exact: true })).toHaveAttribute('aria-selected', 'true');
    assert.equal(new URL(page.url()).hash, '#reporter-card-design', 'Design saves keep the correct tab without changing the API');
  }
  await payment.click();

  if (viewport.width < 1024) {
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    await menu.click();
    await expect(page.getByRole('dialog', { name: 'NAEE PARVAZ' })).toBeVisible();
    const close = page.getByRole('button', { name: 'Close menu' });
    await expect(close).toBeFocused();
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    assert.deepEqual(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })), [], 'Drawer accessibility');
    await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(close).toBeFocused();
    await page.screenshot({ path: `test-results/enhancements/editor-menu-${viewport.width}.png` });
    await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
    await page.locator('.editor-menu-backdrop').click({ position: { x: viewport.width - 5, y: 100 } });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await menu.click();
  }
  await page.locator('[data-editor-nav]').filter({ hasText: 'Website videos' }).click();
  await expect(page.locator('#website-videos')).toBeVisible();
  await expect(page.locator('[data-editor-nav][aria-current="page"]')).toHaveText('Website videos');
  await expect(page.locator('.editor-page-heading h1')).toHaveText('Website videos');
  if (viewport.width < 1024) await expect(page.locator('.editor-menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('tab', { name: 'Website settings', exact: true }).click();
  await expect(page.locator('[data-editor-nav][aria-current="page"]')).toHaveText('Website settings');
  await page.goto(base + '/editor/#new-video');
  await expect(page.locator('#new-video')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Website videos', exact: true })).toHaveAttribute('aria-selected', 'true');
  for (const query of ['saved=video', 'saved=status', 'error=video']) {
    await page.goto(base + '/editor/?' + query);
    await expect(page.getByRole('tab', { name: 'Website videos', exact: true })).toHaveAttribute('aria-selected', 'true');
  }
  await page.goto(base + '/editor/reporters/settings/?policySaved=1#reporter-policy-settings');
  await expect(page.getByRole('tab', { name: 'Reporter policy', exact: true })).toHaveAttribute('aria-selected', 'true');

  // The drawer must release the page when crossing back to desktop size.
  if (viewport.width < 1024) {
    await page.locator('.editor-menu-toggle').click();
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await page.locator('main').evaluate(element => element.inert), false);
    await expect(page.locator('.editor-sidebar')).toBeVisible();
    await page.setViewportSize(viewport);
    await expect(page.locator('.editor-menu-toggle')).toHaveAttribute('aria-expanded', 'false');
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole('tab', { name: 'Applications & payment', exact: true }).click();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Reporter settings fit 320px');
  await page.setViewportSize(viewport);
}
