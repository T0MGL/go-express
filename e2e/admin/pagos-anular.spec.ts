import { test, expect } from '../fixtures';

test.describe('Anulacion de pagos', () => {
  test('toggle "Mostrar anulados" cambia el filtro de la lista', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const toggle = page.getByTestId('toggle-anulados');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveText(/Mostrar anulados/);

    await toggle.click();
    await expect(toggle).toHaveText(/Ocultar anulados/);

    await toggle.click();
    await expect(toggle).toHaveText(/Mostrar anulados/);
  });

  test('modal de anulacion se abre desde el detalle de envio y valida motivo', async ({ adminPage: page }) => {
    await page.goto('/admin/pagos');
    await expect(page.getByRole('heading', { name: /Cobros/ })).toBeVisible({ timeout: 10_000 });

    const firstLink = page.locator('table tbody tr').first().locator('a').first();
    const count = await firstLink.count();
    test.skip(count === 0, 'No hay pagos en el ambiente para correr el happy path');

    await firstLink.click();
    await page.waitForURL(/\/admin\/envios\//, { timeout: 10_000 });

    const anularBtn = page.getByRole('button', { name: /Anular cobro/ });
    const visible = await anularBtn.isVisible().catch(() => false);
    test.skip(!visible, 'El envio seleccionado no tiene pago activo para anular');

    await anularBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5_000 });
    await expect(dialog.getByText(/Anular cobro/)).toBeVisible();

    const confirm = dialog.getByRole('button', { name: /Confirmar anulacion/ });
    await expect(confirm).toBeDisabled();

    await dialog.getByRole('textbox').fill('corto');
    await expect(confirm).toBeDisabled();

    await dialog.getByRole('textbox').fill('Prueba e2e: motivo valido de anulacion con mas de diez caracteres');
    await expect(confirm).toBeEnabled();

    await dialog.getByRole('button', { name: /Cancelar/ }).click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  });
});
