import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '.auth/admin.json');

setup('authenticate as admin', async ({ page }) => {
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD env vars are required. '
      + 'Set them in a .env.test file or export them before running tests.'
    );
  }

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contrasena').fill(password);
  await page.getByRole('button', { name: /Iniciar sesi[oó]n/ }).click();

  await page.waitForURL('/admin', { timeout: 15_000 });
  await expect(page.getByText('Dashboard')).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
