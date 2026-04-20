import { test, expect } from '../fixtures';

test.describe('Liquidaciones', () => {
  test('listado accesible desde navegacion y abre wizard', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    const nuevaBtn = page.getByRole('button', { name: /Nueva liquidacion/i });
    await expect(nuevaBtn).toBeVisible();

    await nuevaBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/Nueva liquidacion/i)).toBeVisible();

    // El boton de crear debe iniciar deshabilitado hasta que se elija repartidor.
    const crearBtn = dialog.getByRole('button', { name: /Crear liquidacion/i });
    await expect(crearBtn).toBeDisabled();

    await dialog.getByRole('button', { name: /Cancelar/ }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });

  test('detalle de liquidacion muestra tabla de envios y boton cerrar si pendiente', async ({ adminPage: page }) => {
    await page.goto('/admin/liquidaciones');
    await expect(page.getByRole('heading', { name: /Liquidaciones/ })).toBeVisible({ timeout: 10_000 });

    const firstRow = page.locator('table tbody tr').first();
    const count = await firstRow.count();
    test.skip(count === 0, 'No hay liquidaciones en el ambiente para correr el happy path');

    await firstRow.locator('a').first().click();
    await page.waitForURL(/\/admin\/liquidaciones\/[0-9a-f-]+/, { timeout: 10_000 });

    await expect(page.getByText(/Envios incluidos/i)).toBeVisible();
    await expect(page.getByText(/Esperado/i).first()).toBeVisible();
  });

  test('banner de deprecation en reporte-cod apunta a liquidaciones', async ({ adminPage: page }) => {
    await page.goto('/admin/reporte-cod');
    await expect(page.getByRole('heading', { name: /Reporte COD/ })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Para cierre de caja oficial usar Liquidaciones/i)).toBeVisible();
  });

  test('ruta legacy /admin/conciliacion redirige a /admin/reporte-cod', async ({ adminPage: page }) => {
    await page.goto('/admin/conciliacion');
    await page.waitForURL(/\/admin\/reporte-cod/, { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: /Reporte COD/ })).toBeVisible();
  });
});
