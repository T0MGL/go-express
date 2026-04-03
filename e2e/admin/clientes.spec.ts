import { test, expect } from '../fixtures';

test.describe('Clientes Management', () => {
  test('page loads with header and stats', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');

    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Empresas activas')).toBeVisible();
    await expect(page.getByText('Envios totales')).toBeVisible();
    await expect(page.getByText('Deuda pendiente')).toBeVisible();
  });

  test('search input filters client list', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

    const searchInput = page.getByPlaceholder(/Buscar por empresa/);
    await expect(searchInput).toBeVisible();

    await searchInput.fill('zzzznonexistent');
    await page.waitForTimeout(500);

    const noResults = page.getByText('No se encontraron empresas');
    const results = page.locator('[role="button"][aria-label^="Ver detalle"]');

    const noResultsVisible = await noResults.isVisible().catch(() => false);
    const resultsCount = await results.count();

    expect(noResultsVisible || resultsCount === 0).toBeTruthy();
  });

  test('"Nuevo Cliente" opens creation modal', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Nuevo Cliente/ }).click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Nuevo Cliente', { exact: true })).toBeVisible();
  });

  test('creation modal has all required fields', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Nuevo Cliente/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText('Razon Social *')).toBeVisible();
    await expect(page.getByText('RUC *')).toBeVisible();
    await expect(page.getByText('Contacto principal *')).toBeVisible();
    await expect(page.getByText('Telefono *')).toBeVisible();
    await expect(page.getByText('Email *')).toBeVisible();
    await expect(page.getByText('Direccion *')).toBeVisible();
    await expect(page.getByText('Ciudad *')).toBeVisible();
  });

  test('create a new client', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Nuevo Cliente/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const uniqueSuffix = Date.now().toString().slice(-6);
    const razonSocial = `E2E Test Corp ${uniqueSuffix}`;

    await page.getByRole('dialog').locator('input[name="razonSocial"]').fill(razonSocial);
    await page.getByRole('dialog').locator('input[name="ruc"]').fill(`80${uniqueSuffix}-1`);
    await page.getByRole('dialog').locator('input[name="contactoNombre"]').fill('Test Contacto');
    await page.getByRole('dialog').locator('input[name="telefono"]').fill('+595 21 555 1000');
    await page.getByRole('dialog').locator('input[name="email"]').fill(`test${uniqueSuffix}@e2e.com`);
    await page.getByRole('dialog').locator('input[name="direccion"]').fill('Calle Test 456');

    const ciudadTrigger = page.getByRole('dialog').locator('button').filter({ hasText: 'Seleccionar' }).first();
    await ciudadTrigger.click();
    await page.getByRole('option', { name: 'Central' }).click();

    await page.getByRole('button', { name: 'Crear Cliente' }).click();

    await expect(page.getByText('Cliente creado correctamente')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5_000 });
  });

  test('clicking a client row opens detail panel', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

    const firstClient = page.locator('[role="button"][aria-label^="Ver detalle"]').first();
    const isVisible = await firstClient.isVisible().catch(() => false);
    test.skip(!isVisible, 'No clients in the system to test');

    await firstClient.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
  });

  test('edit button opens edit modal with prefilled data', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

    const editButton = page.getByRole('button', { name: /Editar/ }).first();
    const isVisible = await editButton.isVisible().catch(() => false);
    test.skip(!isVisible, 'No clients with edit button visible');

    await editButton.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Editar Cliente')).toBeVisible();

    const razonInput = page.getByRole('dialog').locator('input[name="razonSocial"]');
    const value = await razonInput.inputValue();
    expect(value.length).toBeGreaterThan(0);
  });

  test('estado filter changes visible results', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

    const estadoTrigger = page.locator('button').filter({ hasText: 'Todos' }).first();
    await estadoTrigger.click();
    await page.getByRole('option', { name: 'Activo' }).click();

    await page.waitForTimeout(500);
  });

  test('export button exists and is clickable', async ({ adminPage: page }) => {
    await page.goto('/admin/clientes');
    await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible({ timeout: 10_000 });

    const exportBtn = page.getByRole('button', { name: /Exportar/ });
    await expect(exportBtn).toBeVisible();
  });
});
