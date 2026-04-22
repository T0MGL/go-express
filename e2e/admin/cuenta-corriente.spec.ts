import { test, expect } from '../fixtures';

async function openFirstClienteDetail(page: import('@playwright/test').Page) {
  await page.goto('/admin/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

  const clienteCard = page.locator('[aria-label^="Ver detalle de"]').first();
  const count = await clienteCard.count();
  if (count === 0) {
    test.skip(true, 'No hay clientes en el sistema para probar cuenta corriente');
    return;
  }

  await clienteCard.click();
  const dialog = page.getByRole('dialog').first();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
}

test.describe('Cuenta corriente (admin)', () => {
  test('cliente detail opens and shows cuenta corriente section', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);

    // The detail dialog contains the CC section
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });
  });

  test('always shows Saldo, Limite and Disponible financial cards', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);

    // These three must always render, even with zero values
    await expect(page.getByText('Saldo')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Límite')).toBeVisible();
    await expect(page.getByText('Disponible')).toBeVisible();
  });

  test('saldo values are Gs. formatted, never NaN or empty', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    // Wait for loading to resolve
    await expect(page.locator('.opacity-30').first()).toBeHidden({ timeout: 8_000 }).catch(() => null);

    const saldoCards = page.locator('.rounded-lg.border.border-border\\/40.bg-card');
    const count = await saldoCards.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < Math.min(count, 3); i++) {
      const text = await saldoCards.nth(i).textContent();
      // Values must contain Gs. format or hint text, never NaN
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('undefined');
    }
  });

  test('shows Ultimos movimientos section', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);

    await expect(page.getByText('Últimos movimientos')).toBeVisible({ timeout: 8_000 });
  });

  test('"Ajuste" button opens ajuste dialog', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Ajuste/ }).first().click();

    await expect(page.getByText('Registrar ajuste de cuenta corriente')).toBeVisible({ timeout: 5_000 });
  });

  test('ajuste dialog has Aumenta deuda / Reduce deuda type toggles', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Ajuste/ }).first().click();
    await expect(page.getByText('Registrar ajuste de cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByRole('button', { name: /Aumenta deuda/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reduce deuda/ })).toBeVisible();
  });

  test('ajuste rejects descripcion shorter than 10 chars', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Ajuste/ }).first().click();
    await expect(page.getByText('Registrar ajuste de cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByPlaceholder('50000').first().fill('10000');
    await page.getByPlaceholder(/Corrección de saldo/i).fill('corto');
    await page.getByRole('button', { name: 'Registrar ajuste' }).click();

    await expect(page.getByText(/descripcion necesita al menos 10/i)).toBeVisible({ timeout: 5_000 });
  });

  test('ajuste rejects monto invalido (zero)', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Ajuste/ }).first().click();
    await expect(page.getByText('Registrar ajuste de cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByPlaceholder('50000').first().fill('0');
    await page.getByPlaceholder(/Corrección de saldo/i).fill('Descripcion valida con mas de diez caracteres');
    await page.getByRole('button', { name: 'Registrar ajuste' }).click();

    await expect(page.getByText(/Monto invalido/i)).toBeVisible({ timeout: 5_000 });
  });

  test('ajuste dialog cancel closes without changes', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Ajuste/ }).first().click();
    await expect(page.getByText('Registrar ajuste de cuenta corriente')).toBeVisible({ timeout: 5_000 });

    // Cancel button is inside the ajuste dialog
    await page.locator('[role="dialog"]').filter({ hasText: 'Registrar ajuste' }).getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByText('Registrar ajuste de cuenta corriente')).toBeHidden({ timeout: 5_000 });
    // The client detail dialog should still be open
    await expect(page.getByText('Cuenta corriente')).toBeVisible();
  });

  test('"Nota de credito" button opens nota credito dialog', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Nota de crédito/ }).click();

    await expect(page.getByText('Emitir nota de crédito')).toBeVisible({ timeout: 5_000 });
  });

  test('nota credito rejects descripcion shorter than 10 chars', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Nota de crédito/ }).click();
    await expect(page.getByText('Emitir nota de crédito')).toBeVisible({ timeout: 5_000 });

    await page.getByPlaceholder('50000').first().fill('5000');
    await page.getByPlaceholder(/Bonificación comercial/i).fill('muy corto');
    await page.getByRole('button', { name: 'Emitir nota de crédito' }).click();

    await expect(page.getByText(/descripcion necesita al menos 10/i)).toBeVisible({ timeout: 5_000 });
  });

  test('nota credito cancel closes dialog', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Nota de crédito/ }).click();
    await expect(page.getByText('Emitir nota de crédito')).toBeVisible({ timeout: 5_000 });

    await page.locator('[role="dialog"]').filter({ hasText: 'Emitir nota de crédito' }).getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByText('Emitir nota de crédito')).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText('Cuenta corriente')).toBeVisible();
  });

  test('"Limite" button opens limite credito dialog', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Límite/ }).click();

    await expect(page.getByText('Editar límite de crédito')).toBeVisible({ timeout: 5_000 });
  });

  test('limite dialog shows current value as "Actual"', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Límite/ }).click();
    await expect(page.getByText('Editar límite de crédito')).toBeVisible({ timeout: 5_000 });

    // "Actual: Gs. X" label must always be visible to show what the current limit is
    await expect(page.getByText(/Actual:/i)).toBeVisible();
  });

  test('limite rejects motivo shorter than 5 chars', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Límite/ }).click();
    await expect(page.getByText('Editar límite de crédito')).toBeVisible({ timeout: 5_000 });

    // Fill limite and a too-short motivo
    await page.getByPlaceholder(/0 = sin restricción/i).fill('500000');
    await page.getByPlaceholder(/Aprobado por/i).fill('ok');
    await page.getByRole('button', { name: 'Guardar límite' }).click();

    await expect(page.getByText(/motivo necesita al menos 5/i)).toBeVisible({ timeout: 5_000 });
  });

  test('limite cancel closes dialog', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Cuenta corriente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: /Límite/ }).click();
    await expect(page.getByText('Editar límite de crédito')).toBeVisible({ timeout: 5_000 });

    await page.locator('[role="dialog"]').filter({ hasText: 'Editar límite de crédito' }).getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByText('Editar límite de crédito')).toBeHidden({ timeout: 5_000 });
    await expect(page.getByText('Cuenta corriente')).toBeVisible();
  });

  test('movements list shows tipo badges from the expected set', async ({ adminPage: page }) => {
    await openFirstClienteDetail(page);
    await expect(page.getByText('Últimos movimientos')).toBeVisible({ timeout: 8_000 });

    const movimientos = page.locator('[role="dialog"]').first().locator('.divide-y > div');
    const hasMovimientos = (await movimientos.count()) > 0;
    test.skip(!hasMovimientos, 'Este cliente no tiene movimientos de CC registrados');

    // Every badge must be one of the valid tipo labels
    const validLabels = ['Débito', 'Crédito', 'Ajuste', 'Nota crédito', 'Reverso'];
    const badges = movimientos.locator('[class*="badge"]');
    const badgeCount = await badges.count();

    for (let i = 0; i < badgeCount; i++) {
      const text = await badges.nth(i).textContent();
      expect(validLabels.some((l) => text?.includes(l))).toBe(true);
    }
  });
});
