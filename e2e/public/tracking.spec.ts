import { test, expect } from '@playwright/test';

test.describe('Public Tracking', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('renders tracking page with search input', async ({ page }) => {
    await page.goto('/track');

    await expect(page.getByRole('heading', { name: /Rastrea tu envio/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#tracking-input')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rastrear' })).toBeVisible();
  });

  test('shows toast error when submitting empty input', async ({ page }) => {
    await page.goto('/track');

    await page.getByRole('button', { name: 'Rastrear' }).click();

    await expect(page.getByText('Ingresa un numero de seguimiento')).toBeVisible({ timeout: 5_000 });
  });

  test('shows "not found" message for invalid tracking number', async ({ page }) => {
    await page.goto('/track');

    await page.locator('#tracking-input').fill('INVALID000000');
    await page.getByRole('button', { name: 'Rastrear' }).click();

    await expect(page.getByText('No encontramos tu envio')).toBeVisible({ timeout: 15_000 });
  });

  test('auto-searches from query parameter', async ({ page }) => {
    await page.goto('/track?q=GE2026000001');

    const searchInput = page.locator('#tracking-input');
    await expect(searchInput).toHaveValue('GE2026000001', { timeout: 5_000 });

    const resultOrNotFound = page
      .getByText('No encontramos tu envio')
      .or(page.locator('text=Numero de seguimiento'));
    await expect(resultOrNotFound).toBeVisible({ timeout: 15_000 });
  });

  test('shows tracking result with timeline when valid number exists', async ({ page }) => {
    const trackingNumber = process.env.TEST_TRACKING_NUMBER;
    test.skip(!trackingNumber, 'TEST_TRACKING_NUMBER env var required for this test');

    await page.goto(`/track?q=${trackingNumber}`);

    await expect(page.getByText(trackingNumber!)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Numero de seguimiento')).toBeVisible();
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
  });
});
