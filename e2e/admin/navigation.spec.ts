import { test, expect } from '../fixtures';

test.describe('Admin Navigation', () => {
  test('sidebar contains all expected main links', async ({ adminPage: page }) => {
    const sidebar = page.locator('aside');

    await expect(sidebar.getByText('Dashboard')).toBeVisible();
    await expect(sidebar.getByText('Envios')).toBeVisible();
    await expect(sidebar.getByText('Warehouse')).toBeVisible();
    await expect(sidebar.getByText('Clientes')).toBeVisible();
    await expect(sidebar.getByText('Repartidores')).toBeVisible();
  });

  test('sidebar contains all expected secondary links', async ({ adminPage: page }) => {
    const sidebar = page.locator('aside');

    await expect(sidebar.getByText('Pagos')).toBeVisible();
    await expect(sidebar.getByText('Tarifas')).toBeVisible();
    await expect(sidebar.getByText('Auditoria')).toBeVisible();
    await expect(sidebar.getByText('Configuracion')).toBeVisible();
  });

  test('clicking each main link loads the correct page', async ({ adminPage: page }) => {
    const mainRoutes = [
      { label: 'Envios', path: '/admin/envios', heading: 'Envios' },
      { label: 'Warehouse', path: '/admin/warehouse', heading: 'Warehouse' },
      { label: 'Clientes', path: '/admin/clientes', heading: 'Clientes' },
      { label: 'Repartidores', path: '/admin/repartidores', heading: 'Repartidores' },
    ];

    for (const route of mainRoutes) {
      await page.locator('aside').getByText(route.label, { exact: true }).click();
      await page.waitForURL(route.path, { timeout: 10_000 });
      await expect(page.getByRole('heading', { name: route.heading })).toBeVisible({ timeout: 10_000 });
    }
  });

  test('clicking each secondary link loads the correct page', async ({ adminPage: page }) => {
    const secondaryRoutes = [
      { label: 'Pagos', path: '/admin/pagos' },
      { label: 'Tarifas', path: '/admin/tarifas' },
      { label: 'Auditoria', path: '/admin/auditoria' },
      { label: 'Configuracion', path: '/admin/configuracion' },
    ];

    for (const route of secondaryRoutes) {
      await page.locator('aside').getByText(route.label, { exact: true }).click();
      await page.waitForURL(route.path, { timeout: 10_000 });
    }
  });

  test('dashboard link navigates back to /admin', async ({ adminPage: page }) => {
    await page.locator('aside').getByText('Envios', { exact: true }).click();
    await page.waitForURL('/admin/envios', { timeout: 10_000 });

    await page.locator('aside').getByText('Dashboard', { exact: true }).click();
    await page.waitForURL('/admin', { timeout: 10_000 });
    await expect(page.getByText('Envios Hoy')).toBeVisible();
  });

  test('command palette opens with Cmd+K and closes with Escape', async ({ adminPage: page }) => {
    await page.keyboard.press('Meta+k');

    const commandInput = page.locator('[cmdk-input]');
    await expect(commandInput).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(commandInput).not.toBeVisible({ timeout: 3_000 });
  });

  test('header user menu shows profile and logout options', async ({ adminPage: page }) => {
    const userMenuTrigger = page.locator('header').getByRole('button').filter({ has: page.locator('[class*="avatar"]') });
    await userMenuTrigger.click();

    await expect(page.getByText('Perfil')).toBeVisible({ timeout: 3_000 });
    await expect(page.getByText('Configuracion')).toBeVisible();
    await expect(page.getByText('Cerrar Sesion')).toBeVisible();
  });

  test('sidebar collapse toggle works', async ({ adminPage: page }) => {
    const sidebar = page.locator('aside');
    const collapseBtn = sidebar.getByText('Colapsar');
    await expect(collapseBtn).toBeVisible();

    await collapseBtn.click();

    await expect(sidebar).toHaveCSS('width', '56px', { timeout: 3_000 });
  });

  test('mobile: hamburger menu opens sidebar drawer', async ({ adminPage: page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/admin');
    await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 10_000 });

    const hamburger = page.getByRole('button', { name: 'Abrir menu' });
    await expect(hamburger).toBeVisible();
    await hamburger.click();

    const sheet = page.locator('[data-state="open"]').filter({ hasText: 'GO EXPRESS' });
    await expect(sheet).toBeVisible({ timeout: 5_000 });

    await expect(sheet.getByText('Dashboard')).toBeVisible();
    await expect(sheet.getByText('Envios')).toBeVisible();
    await expect(sheet.getByText('Clientes')).toBeVisible();
  });
});
