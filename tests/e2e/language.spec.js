import { test, expect } from '@playwright/test';

const cases = [
  { code: 'zh-CN', heading: '哪些感受让你印象深刻？', generate: '生成我的评价', fragment: '服务好', unavailable: '暂不可用' },
  { code: 'zh-TW', heading: '哪些感受讓你印象深刻？', generate: '產生我的評價', fragment: '服務好', unavailable: '暫時無法使用' },
  { code: 'en', heading: 'What stood out?', generate: 'Create my review', fragment: 'friendly', unavailable: 'unavailable' },
  { code: 'fr-CA', heading: 'Qu’est-ce qui vous a marqué?', generate: 'Créer mon avis', fragment: 'attentionné', unavailable: 'indisponible' },
  { code: 'es', heading: '¿Qué te llamó la atención?', generate: 'Crear mi reseña', fragment: 'amable', unavailable: 'no está disponible' },
];

for (const item of cases) {
  test(`${item.code}：界面、输出语言、保留草稿、错误翻译与偏好保存`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('#ui-language').selectOption(item.code);
    await expect(page.locator('html')).toHaveAttribute('lang', item.code);
    await expect(page.getByText(item.heading)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.tag').first().click();
    await page.locator('#review-language').selectOption(item.code);
    const request = page.waitForRequest(req => req.url().endsWith('/api/reviews'));
    await page.getByRole('button', { name: item.generate }).click();
    expect((await request).postDataJSON().language).toBe(item.code);
    await expect(page.getByRole('textbox')).toHaveValue(new RegExp(item.fragment));
    await expect(page.getByRole('textbox')).toHaveAttribute('lang', item.code);
    const text = await page.getByRole('textbox').inputValue();
    await page.getByRole('checkbox').check();
    // 仅切换界面不会清空、翻译或作废原草稿。
    await page.locator('#ui-language').selectOption(item.code === 'en' ? 'zh-CN' : 'en');
    await expect(page.getByRole('textbox')).toHaveValue(text);
    await expect(page.locator('.copy')).toBeEnabled();
    await page.locator('#ui-language').selectOption(item.code);
    await page.locator('#review-language').selectOption(item.code === 'en' ? 'fr-CA' : 'en');
    await expect(page.locator('.warning')).toBeVisible();
    await expect(page.locator('.copy')).toBeDisabled();
    await page.locator('#review-language').selectOption(item.code);
    // 模拟服务失败，验证错误按当前界面语言呈现，且不丢失文案。
    await page.route('**/api/reviews', route => route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: '生成服务暂不可用，请稍后重试。' }) }));
    await page.locator('.generate').click();
    await expect(page.getByRole('alert')).toContainText(item.unavailable);
    await expect(page.getByRole('textbox')).toHaveValue(text);
    await page.reload();
    await expect(page.locator('#ui-language')).toHaveValue(item.code);
    await expect(page.locator('#review-language')).toHaveValue(item.code);
    if (item.code === 'fr-CA') {
      await page.screenshot({ path: 'docs/法语手机预览.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.screenshot({ path: 'docs/法语桌面预览.png', fullPage: true });
    }
  });
}

test('加拿大法语浏览器首次访问自动匹配语言', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-CA' });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4320/');
  await expect(page.locator('#ui-language')).toHaveValue('fr-CA');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr-CA');
  await context.close();
});
