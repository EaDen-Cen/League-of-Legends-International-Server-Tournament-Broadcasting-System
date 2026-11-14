import { test, expect } from '@playwright/test';
import { harness } from './harness';

test('interface language persists on refresh and immediately reaches the read-only OBS view', async ({ page, baseURL }) => {
  const h = await harness(baseURL);
  try {
    await h.reset({ language: 'zh' });
    const overlay = await page.context().newPage();
    await page.goto('/control#token=e2e-control'); await overlay.goto('/overlay/draft#token=e2e-overlay');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.getByRole('button', { name: '比赛设置', exact: true }).click();
    await page.getByLabel('界面语言', { exact: true }).selectOption('eng');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.locator('.status')).toHaveText('Connected');
    await expect(overlay.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload(); await expect(page.locator('.status')).toHaveText('Connected');
    await page.getByRole('button', { name: 'Match settings', exact: true }).click();
    await expect(page.getByLabel('Interface language', { exact: true })).toHaveValue('eng');
    await overlay.close();
  } finally { h.close(); }
});
