import { test, expect } from '../fixtures';

test.describe('Cobros (Pagos)', () => {
  test('page loads with heading and three stat cards', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Cobrado hasta ahora')).toBeVisible();
    await expect(page.getByText('Pendiente de cobrar')).toBeVisible();
    await expect(page.getByText('Cobrado hoy')).toBeVisible();
  });

  test('stat cards show Gs. formatted amounts, never NaN or undefined', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByText('Cobrado hasta ahora')).toBeVisible({ timeout: 10_000 });

    const statValues = page.locator('.stat-card .font-data');
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const text = await statValues.nth(i).textContent();
      // Must contain Gs. prefix or be zero formatted, never NaN or empty
      expect(text).toMatch(/Gs\.|0/);
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('undefined');
    }
  });

  test('table renders correct financial column headers', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole('columnheader', { name: 'Seguimiento' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Cliente' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Precio' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Estado' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Como pago' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Cobrado el' })).toBeVisible();
  });

  test('filter by estado updates list', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const comboboxes = page.getByRole('combobox');
    await comboboxes.first().click();
    await page.getByRole('option', { name: 'Sin cobrar' }).click();

    // Active filter shows visual indicator on trigger
    const trigger = comboboxes.first();
    const classes = await trigger.getAttribute('class');
    expect(classes).toContain('border-primary');
  });

  test('filter by metodo de cobro updates list', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const comboboxes = page.getByRole('combobox');
    await comboboxes.nth(1).click();
    await page.getByRole('option', { name: 'Efectivo' }).click();

    const trigger = comboboxes.nth(1);
    const classes = await trigger.getAttribute('class');
    expect(classes).toContain('border-primary');
  });

  test('"Exportar CSV" button is visible (accounting requirement)', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole('button', { name: /Exportar CSV/ })).toBeVisible();
  });

  test('search accepts tracking number format', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const search = page.getByPlaceholder(/número de seguimiento/i);
    await expect(search).toBeVisible();
    await search.fill('GE2026');
    await expect(search).toHaveValue('GE2026');
  });

  test('"Registrar cobro" opens PaymentModal with correct fields', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const cobrarBtn = page.getByRole('button', { name: 'Registrar cobro' }).first();
    const hasCobrar = (await cobrarBtn.count()) > 0;
    test.skip(!hasCobrar, 'No hay pagos pendientes de cobro en este ambiente');

    await cobrarBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText('Registrar Pago')).toBeVisible();
    await expect(dialog.getByText('Monto a Pagar')).toBeVisible();
    await expect(dialog.getByLabel('Monto Recibido *')).toBeVisible();
    await expect(dialog.getByText('Método de Pago *')).toBeVisible();
  });

  test('PaymentModal lists all accepted payment methods', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const cobrarBtn = page.getByRole('button', { name: 'Registrar cobro' }).first();
    const hasCobrar = (await cobrarBtn.count()) > 0;
    test.skip(!hasCobrar, 'No hay pagos pendientes para abrir PaymentModal');

    await cobrarBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    // Open the metodo select to see all options
    await dialog.getByRole('combobox').click();
    await expect(page.getByRole('option', { name: 'Efectivo' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Transferencia' })).toBeVisible();
    await expect(page.getByRole('option', { name: /Tarjeta/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Contra entrega/ })).toBeVisible();
  });

  test('PaymentModal cancel closes dialog', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const cobrarBtn = page.getByRole('button', { name: 'Registrar cobro' }).first();
    const hasCobrar = (await cobrarBtn.count()) > 0;
    test.skip(!hasCobrar, 'No hay pagos pendientes');

    await cobrarBtn.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('paid cobros show "Ver envio" link, not "Registrar cobro" (prevents double payment)', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    // Filter by pagado state to find cobrados
    await page.getByRole('combobox').first().click();
    await page.getByRole('option', { name: 'Cobrado' }).click();
    await page.waitForTimeout(400);

    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    test.skip(rowCount === 0, 'No hay cobros en estado "pagado" en este ambiente');

    const firstRow = rows.first();
    await expect(firstRow.getByRole('button', { name: /Ver envío/ })).toBeVisible();

    // The dangerous "Registrar cobro" must not be present on already paid rows
    const cobrarVisible = await firstRow.getByRole('button', { name: 'Registrar cobro' }).isVisible().catch(() => false);
    expect(cobrarVisible).toBe(false);
  });

  test('anulado cobros show strikethrough amount for auditability', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const toggle = page.getByTestId('toggle-anulados');
    await toggle.click();
    await expect(toggle).toHaveText(/Ocultar anulados/);
    await page.waitForTimeout(400);

    const anuladoBadge = page.locator('table tbody').getByText('Anulado').first();
    const hasAnulado = (await anuladoBadge.count()) > 0;
    test.skip(!hasAnulado, 'No hay pagos anulados en este ambiente');

    const anuladoRow = page.locator('table tbody tr').filter({ hasText: 'Anulado' }).first();
    // Strikethrough indicates voided amount visually
    await expect(anuladoRow.locator('.line-through')).toBeVisible();
  });

  test('empty state renders when search matches nothing', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    await page.getByPlaceholder(/número de seguimiento/i).fill('ZZZNONEXISTENT999');
    await page.waitForTimeout(450); // debounce delay

    await expect(page.getByText(/Ningún cobro coincide|Aún no hay cobros/)).toBeVisible({ timeout: 5_000 });
  });
});
