import { test, expect } from '@playwright/test';

test.describe('Admin Login', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('shows login form on /login', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByText('GO EXPRESS')).toBeVisible();
    await expect(page.getByText('Panel de administracion')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Contrasena')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar sesion' })).toBeVisible();
  });

  test('shows validation error for empty email', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Contrasena').fill('short1');
    await page.getByRole('button', { name: 'Iniciar sesion' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Ingrese su email')).toBeVisible();
  });

  test('shows validation error for short password', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('test@goexpress.com.py');
    await page.getByLabel('Contrasena').fill('12345');
    await page.getByRole('button', { name: 'Iniciar sesion' }).click();

    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('La contrasena debe tener al menos 6 caracteres')).toBeVisible();
  });

  test('shows error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('fake@goexpress.com.py');
    await page.getByLabel('Contrasena').fill('wrongpassword123');
    await page.getByRole('button', { name: 'Iniciar sesion' }).click();

    await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  });

  test('logs in with valid credentials and redirects to /admin', async ({ page }) => {
    const email = process.env.TEST_ADMIN_EMAIL;
    const password = process.env.TEST_ADMIN_PASSWORD;
    test.skip(!email || !password, 'TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD required');

    await page.goto('/login');

    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Contrasena').fill(password!);
    await page.getByRole('button', { name: 'Iniciar sesion' }).click();

    await page.waitForURL('/admin', { timeout: 15_000 });
    await expect(page.getByText('Dashboard')).toBeVisible();
  });

  test('logs out and redirects to /login', async ({ page }) => {
    const email = process.env.TEST_ADMIN_EMAIL;
    const password = process.env.TEST_ADMIN_PASSWORD;
    test.skip(!email || !password, 'TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD required');

    await page.goto('/login');
    await page.getByLabel('Email').fill(email!);
    await page.getByLabel('Contrasena').fill(password!);
    await page.getByRole('button', { name: 'Iniciar sesion' }).click();
    await page.waitForURL('/admin', { timeout: 15_000 });

    await page.getByRole('button', { name: /Admin/ }).click();
    await page.getByText('Cerrar Sesion').click();

    await page.waitForURL('/login', { timeout: 10_000 });
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});
