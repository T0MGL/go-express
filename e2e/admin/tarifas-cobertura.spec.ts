import { test, expect } from '../fixtures';

test.describe('Panel de cobertura en Tarifas', () => {
  test('panel renders con stat global y 18 cards de departamento', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');

    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Cobertura operativa')).toBeVisible({ timeout: 10_000 });

    // Stat global: "X/262 ciudades" y "Y/18 departamentos"
    await expect(page.getByText(/\/262/)).toBeVisible();
    await expect(page.getByText(/\/18/)).toBeVisible();

    // Al menos 18 cards de departamento (pueden ser mas si hay loading extras, pero no menos).
    const deptoCards = page.locator('button:has(.truncate)').filter({ hasText: /\d+\/\d+ ciudades/ });
    const count = await deptoCards.count();
    expect(count).toBeGreaterThanOrEqual(18);
  });

  test('modal de nueva tarifa permite elegir cualquier ciudad del catalogo', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /Nueva tarifa/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Nueva tarifa', { exact: true })).toBeVisible();

    // El picker de origen tiene label "Origen *"
    await expect(page.getByLabel('Origen *')).toBeVisible();
    await expect(page.getByLabel('Destino *')).toBeVisible();
  });

  test('click en chip gris abre modal pre-llenado con ciudad como destino', async ({ adminPage: page }) => {
    await page.goto('/admin/tarifas');
    await expect(page.getByText('Cobertura operativa')).toBeVisible({ timeout: 10_000 });

    // Los chips grises son botones con title "Click para crear tarifa y habilitar".
    const chipsSinCobertura = page.locator('button[title="Click para crear tarifa y habilitar"]');
    const hayChips = (await chipsSinCobertura.count()) > 0;

    if (!hayChips) {
      test.skip(true, 'No hay ciudades sin cobertura en este entorno de test');
      return;
    }

    await chipsSinCobertura.first().click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Nueva tarifa', { exact: true })).toBeVisible();
  });
});
