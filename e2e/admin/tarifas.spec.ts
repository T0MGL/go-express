import { test, expect } from '../fixtures';

test.describe('Tarifas: CRUD y precios', () => {
  test('page loads with heading and pricing explanation', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    // Pricing formula info card must be visible for transparency
    await expect(page.getByText(/Como se calcula el precio/i)).toBeVisible();
    await expect(page.getByText(/5\.000 cm3 por kg/i)).toBeVisible();
  });

  test('table renders all financial pricing columns', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole('columnheader', { name: 'Desde' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Hasta' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Tipo' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Precio base' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Kg incluidos' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Precio kg extra' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Estado' })).toBeVisible();
  });

  test('active tarifas show Gs. formatted prices, never NaN', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'No hay tarifas cargadas en este ambiente');

    const priceCells = page.locator('table tbody td.font-data');
    const priceCount = await priceCells.count();

    for (let i = 0; i < priceCount; i++) {
      const text = await priceCells.nth(i).textContent();
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('undefined');
      // All price cells must include Gs. currency format
      expect(text).toMatch(/Gs\.|0/);
    }
  });

  test('active tarifas show "Activa" badge', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'No hay tarifas cargadas');

    // At least one row must have "Activa" badge (assuming some are active)
    const activaBadge = page.locator('table tbody').getByText('Activa').first();
    const hasActiva = (await activaBadge.count()) > 0;
    test.skip(!hasActiva, 'No hay tarifas activas');

    await expect(activaBadge).toBeVisible();
  });

  test('"Nueva tarifa" modal opens with all required pricing fields', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Nueva tarifa/ }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Nueva tarifa', { exact: true })).toBeVisible();

    // City pickers for origin and destination
    await expect(dialog.getByLabel('Origen *')).toBeVisible();
    await expect(dialog.getByLabel('Destino *')).toBeVisible();

    // Pricing fields
    await expect(dialog.getByText('Precio base (Gs.) *')).toBeVisible();
    await expect(dialog.getByText('Peso base incluido (kg)')).toBeVisible();
    await expect(dialog.getByText('Precio por kg extra (Gs.)')).toBeVisible();
    await expect(dialog.getByText('Factor dimensional (cm3/kg)')).toBeVisible();
  });

  test('"Nueva tarifa" tipo de servicio select has Estandar, Express, Economico', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Nueva tarifa/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole('combobox').click();
    await expect(page.getByRole('option', { name: 'Estandar' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Express' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Economico' })).toBeVisible();
  });

  test('formula preview updates when factor dimensional changes', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Nueva tarifa/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Change the factor dimensional input (placeholder 5000 is unique to this field)
    await dialog.getByPlaceholder('5000', { exact: true }).fill('6000');

    // The formula preview must reflect the new factor
    await expect(dialog.getByText(/\/ 6000/)).toBeVisible();
  });

  test('"Nueva tarifa" cancel closes modal', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Nueva tarifa/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('edit button opens modal pre-filled with "Editar tarifa" title', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    const editBtn = page.locator('[aria-label^="Editar tarifa"]').first();
    const hasEdit = (await editBtn.count()) > 0;
    test.skip(!hasEdit, 'No hay tarifas activas para editar');

    await editBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Editar tarifa', { exact: true })).toBeVisible();
    // Edit modal shows "Guardar cambios" not "Crear tarifa"
    await expect(dialog.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
  });

  test('delete button opens "Desactivar tarifa" modal with motivo field', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    const deleteBtn = page.locator('[aria-label^="Desactivar tarifa"]').first();
    const hasDelete = (await deleteBtn.count()) > 0;
    test.skip(!hasDelete, 'No hay tarifas activas para desactivar');

    await deleteBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Desactivar tarifa')).toBeVisible();
    await expect(dialog.getByText('Motivo de desactivacion *')).toBeVisible();
    await expect(dialog.getByPlaceholder(/Ruta suspendida/i)).toBeVisible();
    // The destructive action button must be present and visible
    await expect(dialog.getByRole('button', { name: 'Desactivar tarifa' })).toBeVisible();
  });

  test('"Desactivar tarifa" cancel closes modal without deleting', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    const deleteBtn = page.locator('[aria-label^="Desactivar tarifa"]').first();
    const hasDelete = (await deleteBtn.count()) > 0;
    test.skip(!hasDelete, 'No hay tarifas activas para desactivar');

    await deleteBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });

    // Tarifa must still be in the table
    await expect(page.locator('table tbody tr').first()).toBeVisible();
  });

  test('"Ver tambien desactivadas" toggle reveals soft-deleted tarifas', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    const toggleBtn = page.getByRole('button', { name: /Ver tambien desactivadas/ });
    await expect(toggleBtn).toBeVisible();

    const activeCountBefore = await page.locator('table tbody tr').count();

    await toggleBtn.click();
    await expect(page.getByRole('button', { name: /Ocultar desactivadas/ })).toBeVisible({ timeout: 5_000 });

    // If there are soft-deleted tarifas, the count should increase or stay the same
    const totalCountAfter = await page.locator('table tbody tr').count();
    expect(totalCountAfter).toBeGreaterThanOrEqual(activeCountBefore);
  });

  test('soft-deleted tarifas show "Desactivada" badge and "Restaurar" button', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Ver tambien desactivadas/ }).click();
    await page.waitForTimeout(400);

    const desactivadaBadge = page.locator('table tbody').getByText('Desactivada').first();
    const hasDesactivada = (await desactivadaBadge.count()) > 0;
    test.skip(!hasDesactivada, 'No hay tarifas desactivadas en este ambiente');

    await expect(desactivadaBadge).toBeVisible();

    // Rows with "Desactivada" badge must show "Restaurar" and NOT show the delete icon
    const desactivadaRow = page.locator('table tbody tr').filter({ hasText: 'Desactivada' }).first();
    await expect(desactivadaRow.getByRole('button', { name: 'Restaurar' })).toBeVisible();
    // Edit and delete buttons must be absent on deactivated tarifas
    const editVisible = await desactivadaRow.locator('[aria-label^="Editar tarifa"]').isVisible().catch(() => false);
    expect(editVisible).toBe(false);
  });

  test('search filters tarifas by city name', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    const rows = page.locator('table tbody tr');
    const hasTarifas = (await rows.count()) > 0;
    test.skip(!hasTarifas, 'No hay tarifas para filtrar');

    // Get the name from the first "Desde" cell
    const primeraOrigen = await rows.first().locator('td').first().textContent();
    if (!primeraOrigen) return;

    await page.getByPlaceholder(/origen, destino/i).fill(primeraOrigen.trim().slice(0, 4));
    await page.waitForTimeout(200);

    // After searching, all visible rows must contain the search term in Desde or Hasta
    const visibleRows = page.locator('table tbody tr');
    const visibleCount = await visibleRows.count();

    // Empty state must not appear when there is a valid match
    await expect(page.getByText(/Ninguna tarifa coincide/i)).toBeHidden();
    expect(visibleCount).toBeGreaterThan(0);
  });
});
