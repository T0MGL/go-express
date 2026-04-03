import { test, expect } from '../fixtures';

test.describe('Admin Dashboard', () => {
  test('loads dashboard with KPI cards', async ({ adminPage: page }) => {
    await expect(page.getByText('Envios Hoy')).toBeVisible();
    await expect(page.getByText('En Transito')).toBeVisible();
    await expect(page.getByText('Tasa Entrega')).toBeVisible();
    await expect(page.getByText('Por Cobrar')).toBeVisible();
  });

  test('stat values display actual numbers (not NaN or undefined)', async ({ adminPage: page }) => {
    const statValues = page.locator('.stat-card-value');
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < count; i++) {
      const text = await statValues.nth(i).textContent();
      expect(text).not.toContain('NaN');
      expect(text).not.toContain('undefined');
      expect(text).not.toBe('');
    }
  });

  test('"Nuevo Envio" button navigates to wizard', async ({ adminPage: page }) => {
    await page.getByRole('link', { name: /Nuevo Envio/ }).click();

    await page.waitForURL('/admin/envios/nuevo', { timeout: 10_000 });
    await expect(page.getByText('Nuevo Envio')).toBeVisible();
  });

  test('recent shipments table renders', async ({ adminPage: page }) => {
    await expect(page.getByText('Envios Recientes')).toBeVisible();

    const table = page.locator('table.premium-table');
    await expect(table).toBeVisible();

    const headers = table.locator('thead th');
    await expect(headers.nth(0)).toContainText('Tracking');
    await expect(headers.nth(1)).toContainText('Cliente');
    await expect(headers.nth(2)).toContainText('Destino');
    await expect(headers.nth(3)).toContainText('Estado');
    await expect(headers.nth(4)).toContainText('Fecha');
  });

  test('sidebar navigation works for each main section', async ({ adminPage: page }) => {
    const sidebarLinks = [
      { label: 'Envios', url: '/admin/envios' },
      { label: 'Warehouse', url: '/admin/warehouse' },
      { label: 'Clientes', url: '/admin/clientes' },
      { label: 'Repartidores', url: '/admin/repartidores' },
      { label: 'Pagos', url: '/admin/pagos' },
      { label: 'Tarifas', url: '/admin/tarifas' },
      { label: 'Auditoria', url: '/admin/auditoria' },
      { label: 'Configuracion', url: '/admin/configuracion' },
    ];

    for (const link of sidebarLinks) {
      const sidebarLink = page.locator('aside a, aside [role="link"]').filter({ hasText: link.label }).first();
      await sidebarLink.click();
      await page.waitForURL(link.url, { timeout: 10_000 });
    }

    const dashboardLink = page.locator('aside a, aside [role="link"]').filter({ hasText: 'Dashboard' }).first();
    await dashboardLink.click();
    await page.waitForURL('/admin', { timeout: 10_000 });
  });
});
