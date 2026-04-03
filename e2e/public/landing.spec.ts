import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('renders hero section with headline', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: /tu env.o/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Solidez Log')).toBeVisible();
  });

  test('shows tracking search input in hero', async ({ page }) => {
    await page.goto('/');

    const trackingForm = page.locator('form').filter({ has: page.locator('input[type="text"]') }).first();
    await expect(trackingForm).toBeVisible({ timeout: 10_000 });
  });

  test('navigates to /track when tracking form is submitted', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);

    const trackingInput = page.locator('input[type="text"]').first();
    await trackingInput.fill('GE2026000001');

    const submitButton = trackingInput.locator('..').locator('..').locator('..').getByRole('button').first();
    await submitButton.click();

    await page.waitForURL(/\/track\?q=GE2026000001/, { timeout: 10_000 });
  });

  test('navigation links are present (Servicios, Cobertura, Contacto)', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Servicios' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cobertura' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Contacto' })).toBeVisible();
  });

  test('"Rastrear Envio" button navigates to /track', async ({ page }) => {
    await page.goto('/');

    const rastrearBtn = page.getByRole('button', { name: /Rastrear Env/ });
    await rastrearBtn.click();

    await page.waitForURL('/track', { timeout: 10_000 });
  });

  test('"Portal Empresas" button navigates to /cliente', async ({ page }) => {
    await page.goto('/');

    const portalBtn = page.getByRole('button', { name: 'Portal Empresas' }).first();
    await portalBtn.click();

    await page.waitForURL('/cliente', { timeout: 10_000 });
  });
});
