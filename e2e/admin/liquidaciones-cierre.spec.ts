import { test, expect } from '../fixtures';

async function navigateToFirstLiquidacion(page: import('@playwright/test').Page) {
  await page.goto('/admin/liquidaciones');
  await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

  const firstRow = page.locator('table tbody tr').first();
  const count = await firstRow.count();
  if (count === 0) {
    test.skip(true, 'No hay liquidaciones en el sistema para probar el detalle');
    return;
  }

  await firstRow.locator('a').first().click();
  await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });
  await expect(page.getByText(/Envios incluidos/i)).toBeVisible({ timeout: 10_000 });
}

test.describe('Liquidaciones: detalle y cierre', () => {
  test('detail page shows all four financial stat cards', async ({ adminPage: page }) => {
    await navigateToFirstLiquidacion(page);

    await expect(page.getByText('Envios')).toBeVisible();
    await expect(page.getByText('Esperado').first()).toBeVisible();
    await expect(page.getByText('Recibido').first()).toBeVisible();
    await expect(page.getByText('Diferencia').first()).toBeVisible();
  });

  test('Esperado and Recibido show Gs. formatted values, never NaN', async ({ adminPage: page }) => {
    await navigateToFirstLiquidacion(page);

    const statValues = page.locator('.stat-card .font-data');
    const count = await statValues.count();

    for (let i = 0; i < count; i++) {
      const text = await statValues.nth(i).textContent();
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('undefined');
    }
  });

  test('detail page shows Envios incluidos table with financial columns', async ({ adminPage: page }) => {
    await navigateToFirstLiquidacion(page);

    await expect(page.getByText('Envios incluidos')).toBeVisible();

    // Financial columns that must always be present
    await expect(page.getByRole('columnheader', { name: 'Esperado' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Cobrado' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Diferencia' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Conciliado' })).toBeVisible();
  });

  test('conciliado badges only show "si" or "pend" values', async ({ adminPage: page }) => {
    await navigateToFirstLiquidacion(page);

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'Esta liquidacion no tiene envios incluidos');

    const conciliadoBadges = page.locator('table tbody td:last-child [class*="badge"]');
    const badgeCount = await conciliadoBadges.count();

    for (let i = 0; i < badgeCount; i++) {
      const text = await conciliadoBadges.nth(i).textContent();
      expect(['si', 'pend']).toContain(text?.trim());
    }
  });

  test('estado badge shows one of the three valid states', async ({ adminPage: page }) => {
    await navigateToFirstLiquidacion(page);

    const validStates = ['Pendiente', 'Cerrada', 'Con diferencia'];
    const stateBadge = page.locator('.page-header [class*="badge"]').first();
    await expect(stateBadge).toBeVisible({ timeout: 5_000 });
    const text = await stateBadge.textContent();
    expect(validStates.some((s) => text?.includes(s))).toBe(true);
  });

  test('"Volver a liquidaciones" link navigates back', async ({ adminPage: page }) => {
    await navigateToFirstLiquidacion(page);

    await page.getByRole('link', { name: /Volver a liquidaciones/ }).click();
    await page.waitForURL('/admin/liquidaciones', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible();
  });

  test('"Cerrar liquidacion" button only appears when estado is pendiente', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    const firstRow = page.locator('table tbody tr').first();
    const count = await firstRow.count();
    test.skip(count === 0, 'No hay liquidaciones');

    await firstRow.locator('a').first().click();
    await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });
    await expect(page.getByText(/Envios incluidos/i)).toBeVisible({ timeout: 10_000 });

    const estadoBadge = page.locator('.page-header [class*="badge"]').first();
    const estadoText = await estadoBadge.textContent();
    const esPendiente = estadoText?.includes('Pendiente');

    const cerrarBtn = page.getByRole('button', { name: /Cerrar liquidacion/ });

    if (esPendiente) {
      await expect(cerrarBtn).toBeVisible();
    } else {
      // Closed or with-difference liquidations must not show this button
      await expect(cerrarBtn).toBeHidden();
    }
  });

  test('"Cerrar liquidacion" modal opens with prefilled monto esperado', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    // Find a pendiente liquidacion
    const pendienteRow = page.locator('table tbody tr').filter({ hasText: 'Pendiente' }).first();
    const hasPendiente = (await pendienteRow.count()) > 0;
    test.skip(!hasPendiente, 'No hay liquidaciones en estado pendiente');

    await pendienteRow.locator('a').first().click();
    await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Cerrar liquidacion/ })).toBeVisible({ timeout: 10_000 });

    // Read the Esperado amount before opening the modal
    const esperadoCard = page.locator('.stat-card').filter({ hasText: 'Esperado' });
    const esperadoText = await esperadoCard.locator('.font-data').textContent();

    await page.getByRole('button', { name: /Cerrar liquidacion/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Cerrar liquidacion')).toBeVisible();
    await expect(dialog.getByText('Monto esperado')).toBeVisible();

    // The monto esperado in the modal must match the stat card
    if (esperadoText) {
      await expect(dialog.getByText(esperadoText)).toBeVisible();
    }
  });

  test('changing monto to create diferencia shows warning banner', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    const pendienteRow = page.locator('table tbody tr').filter({ hasText: 'Pendiente' }).first();
    const hasPendiente = (await pendienteRow.count()) > 0;
    test.skip(!hasPendiente, 'No hay liquidaciones pendientes');

    await pendienteRow.locator('a').first().click();
    await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });
    await page.getByRole('button', { name: /Cerrar liquidacion/ }).click({ timeout: 10_000 });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Change monto to create a diferencia (add 1000 to whatever is prefilled)
    const montoInput = dialog.getByLabel(/Monto fisico recibido/i);
    const currentValue = await montoInput.inputValue();
    const newValue = String(Number(currentValue) + 1000);
    await montoInput.clear();
    await montoInput.fill(newValue);

    // Warning banner must appear when there is a diferencia
    await expect(dialog.getByText(/Diferencia:/i)).toBeVisible({ timeout: 3_000 });
  });

  test('with diferencia, "Confirmar cierre" is disabled until notas filled (>= 10 chars)', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    const pendienteRow = page.locator('table tbody tr').filter({ hasText: 'Pendiente' }).first();
    const hasPendiente = (await pendienteRow.count()) > 0;
    test.skip(!hasPendiente, 'No hay liquidaciones pendientes');

    await pendienteRow.locator('a').first().click();
    await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });
    await page.getByRole('button', { name: /Cerrar liquidacion/ }).click({ timeout: 10_000 });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Create a diferencia
    const montoInput = dialog.getByLabel(/Monto fisico recibido/i);
    const currentValue = await montoInput.inputValue();
    await montoInput.clear();
    await montoInput.fill(String(Number(currentValue) + 1000));
    await expect(dialog.getByText(/Diferencia:/i)).toBeVisible({ timeout: 3_000 });

    const confirmarBtn = dialog.getByRole('button', { name: 'Confirmar cierre' });

    // No notas: button must be disabled (notasCortas is true)
    await expect(confirmarBtn).toBeDisabled();

    // Short notas: still disabled
    await dialog.getByRole('textbox').last().fill('corto');
    await expect(confirmarBtn).toBeDisabled();

    // Valid notas (>= 10 chars): button must enable
    await dialog.getByRole('textbox').last().fill('Explicacion valida de la diferencia encontrada');
    await expect(confirmarBtn).toBeEnabled();
  });

  test('without diferencia, "Confirmar cierre" is enabled', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    const pendienteRow = page.locator('table tbody tr').filter({ hasText: 'Pendiente' }).first();
    const hasPendiente = (await pendienteRow.count()) > 0;
    test.skip(!hasPendiente, 'No hay liquidaciones pendientes');

    await pendienteRow.locator('a').first().click();
    await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });
    await page.getByRole('button', { name: /Cerrar liquidacion/ }).click({ timeout: 10_000 });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Monto prefilled to esperado = no diferencia = button should be enabled
    const confirmarBtn = dialog.getByRole('button', { name: 'Confirmar cierre' });
    await expect(confirmarBtn).toBeEnabled({ timeout: 3_000 });
  });

  test('"Confirmar cierre" cancel closes modal', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    const pendienteRow = page.locator('table tbody tr').filter({ hasText: 'Pendiente' }).first();
    const hasPendiente = (await pendienteRow.count()) > 0;
    test.skip(!hasPendiente, 'No hay liquidaciones pendientes');

    await pendienteRow.locator('a').first().click();
    await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });
    await page.getByRole('button', { name: /Cerrar liquidacion/ }).click({ timeout: 10_000 });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Must still be on the same detail page
    await expect(page.getByText('Envios incluidos')).toBeVisible();
  });

  test('con_diferencia liquidacion shows warning banner with difference amount', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    const conDiferenciaRow = page.locator('table tbody tr').filter({ hasText: 'Con diferencia' }).first();
    const hasConDiferencia = (await conDiferenciaRow.count()) > 0;
    test.skip(!hasConDiferencia, 'No hay liquidaciones con diferencia en este ambiente');

    await conDiferenciaRow.locator('a').first().click();
    await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });

    await expect(page.getByText('Liquidacion con diferencia')).toBeVisible({ timeout: 5_000 });
    // Diferencia stat card must be non-zero (red)
    const difCard = page.locator('.stat-card').filter({ hasText: 'Diferencia' });
    await expect(difCard.locator('.text-destructive')).toBeVisible();
  });
});
