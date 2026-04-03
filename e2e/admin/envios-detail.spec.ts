import { test, expect } from '../fixtures';

test.describe('Envio Detail Page', () => {
  test('navigates to first envio from list', async ({ adminPage: page }) => {
    await page.goto('/admin/envios');
    await expect(page.getByRole('heading', { name: 'Envios' })).toBeVisible({ timeout: 10_000 });

    const firstTrackingLink = page.locator('table tbody tr').first().locator('a').first();
    const trackingText = await firstTrackingLink.textContent();
    test.skip(!trackingText, 'No envios in the list to test');

    await firstTrackingLink.click();
    await page.waitForURL(/\/admin\/envios\//, { timeout: 10_000 });

    await expect(page.getByRole('heading', { name: 'Detalle del Envio' })).toBeVisible();
  });

  test('detail page shows tracking number and estado badge', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    await expect(page.getByText('Numero de seguimiento')).toBeVisible();

    const trackingNumber = page.locator('.font-data.text-xl');
    await expect(trackingNumber).toBeVisible();
    const text = await trackingNumber.textContent();
    expect(text).toMatch(/^GE\d+/);

    const estadoBadge = page.locator('.surface-card').first().locator('[class*="badge"]').first();
    await expect(estadoBadge).toBeVisible();
  });

  test('"Actualizar Estado" opens modal', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    const estadoButton = page.getByRole('button', { name: /Actualizar Estado/ });
    const isDisabled = await estadoButton.isDisabled();
    test.skip(isDisabled, 'Estado transitions not available for this envio');

    await estadoButton.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });

  test('shows payment info section', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    await expect(page.getByText('Informacion de Pago')).toBeVisible();
    await expect(page.getByText('Costo del Envio')).toBeVisible();
    await expect(page.getByText('Estado de Pago')).toBeVisible();
  });

  test('"Registrar Pago" opens payment modal', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    const payButton = page.getByRole('button', { name: /Registrar Pago|Completar Pago/ });
    const isVisible = await payButton.isVisible().catch(() => false);
    test.skip(!isVisible, 'Payment already completed or button not visible');

    await payButton.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Monto|monto/)).toBeVisible();
  });

  test('notas internas section renders with form', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    await expect(page.getByText('Notas Internas')).toBeVisible();
    await expect(page.getByPlaceholder(/nota interna/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Agregar Nota/ })).toBeVisible();
  });

  test('add a nota interna', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    const notaText = `Test nota ${Date.now()}`;
    await page.getByPlaceholder(/nota interna/i).fill(notaText);
    await page.getByRole('button', { name: /Agregar Nota/ }).click();

    await expect(page.getByText('Nota agregada correctamente')).toBeVisible({ timeout: 10_000 });
  });

  test('"Volver" button navigates back to envios list', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    await page.getByRole('button', { name: 'Volver' }).click();
    await page.waitForURL('/admin/envios', { timeout: 10_000 });
  });

  test('"Reportar Problema" opens problema modal', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    await page.getByRole('button', { name: /Reportar Problema/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });

  test('shows repartidor section', async ({ adminPage: page }) => {
    await navigateToFirstEnvio(page);

    await expect(page.getByText('Repartidor Asignado')).toBeVisible();
  });
});

async function navigateToFirstEnvio(page: import('@playwright/test').Page) {
  await page.goto('/admin/envios');
  await expect(page.getByRole('heading', { name: 'Envios' })).toBeVisible({ timeout: 10_000 });

  const rows = page.locator('table tbody tr');
  const rowCount = await rows.count();
  if (rowCount === 0) {
    test.skip(true, 'No envios in the system to test');
    return;
  }

  const firstLink = rows.first().locator('a').first();
  await firstLink.click();
  await page.waitForURL(/\/admin\/envios\//, { timeout: 10_000 });
  await expect(page.getByText('Detalle del Envio')).toBeVisible({ timeout: 10_000 });
}
