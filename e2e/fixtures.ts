import { test as base, expect, type Page } from '@playwright/test';

type Fixtures = {
  adminPage: Page;
};

export const test = base.extend<Fixtures>({
  adminPage: async ({ page }, use) => {
    await page.goto('/admin');
    await expect(page.getByText('Dashboard')).toBeVisible({ timeout: 10_000 });
    await use(page);
  },
});

export { expect };
