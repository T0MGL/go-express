import { test, expect, type Page } from '@playwright/test';

const TRACKING_ROUTE = '**/public/tracking/*';
const VALID_NUMBER = 'GE2026000001';

const RESULT_FIXTURE = {
  trackingNumber: VALID_NUMBER,
  estado: 'en_reparto',
  origen: 'Asunción',
  destino: 'Ciudad del Este',
  destinatarioCiudad: 'Ciudad del Este',
  fecha: '2026-08-28',
  eventos: [
    { estado: 'en_reparto', descripcion: 'Salió a reparto', ubicacion: 'CDE', fecha: '2026-08-30T12:10:00Z' },
    { estado: 'en_transito', descripcion: 'En camino al depósito', fecha: '2026-08-29T09:00:00Z' },
    { estado: 'recolectado', descripcion: 'Retirado del cliente', fecha: '2026-08-28T15:30:00Z' },
  ],
};

// El copy de "no encontramos" es la unica rama que puede sugerirle al comprador que
// su numero esta mal. Ninguna caida nuestra puede llegar ahi.
const NOT_FOUND_COPY = /No encontramos ese número/i;
const CONNECTION_COPY = /No pudimos conectarnos/i;

async function search(page: Page, numero: string) {
  await page.locator('#tracking-input').fill(numero);
  await page.getByRole('button', { name: 'Rastrear' }).click();
}

test.describe('Public Tracking', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('renders tracking page with search input', async ({ page }) => {
    await page.goto('/track');

    await expect(page.getByRole('heading', { name: /Rastreá tu envío/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#tracking-input')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rastrear' })).toBeVisible();
  });

  test('shows an inline error when submitting empty input', async ({ page }) => {
    await page.goto('/track');

    await page.getByRole('button', { name: 'Rastrear' }).click();

    await expect(page.getByRole('alert')).toHaveText(/Ingresá tu número de seguimiento/i, { timeout: 5_000 });
  });

  test('gives format feedback instead of silence when the number is too short', async ({ page }) => {
    let requested = false;
    await page.route(TRACKING_ROUTE, async (route) => {
      requested = true;
      await route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"no"}' });
    });

    await page.goto('/track');
    await search(page, 'GE123');

    await expect(page.getByRole('alert')).toHaveText(/más corto de lo esperado/i, { timeout: 5_000 });
    expect(requested).toBe(false);
  });

  test('shows "not found" when the API returns 404', async ({ page }) => {
    await page.route(TRACKING_ROUTE, (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Envío no encontrado","code":"NOT_FOUND"}' })
    );

    await page.goto('/track');
    await search(page, 'GE2026999999');

    await expect(page.getByText(NOT_FOUND_COPY)).toBeVisible({ timeout: 15_000 });
  });

  test('a 5xx never tells the buyer the number is wrong', async ({ page }) => {
    await page.route(TRACKING_ROUTE, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom","code":"DB_ERROR"}' })
    );

    await page.goto('/track');
    await search(page, VALID_NUMBER);

    await expect(page.getByText(CONNECTION_COPY)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(NOT_FOUND_COPY)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Reintentar/i })).toBeVisible();
  });

  test('a dropped connection never tells the buyer the number is wrong', async ({ page }) => {
    await page.route(TRACKING_ROUTE, (route) => route.abort('failed'));

    await page.goto('/track');
    await search(page, VALID_NUMBER);

    await expect(page.getByText(CONNECTION_COPY)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(NOT_FOUND_COPY)).toHaveCount(0);
  });

  test('the retry button re-queries the API and renders the result', async ({ page }) => {
    let attempts = 0;
    await page.route(TRACKING_ROUTE, async (route) => {
      attempts += 1;
      // TanStack reintenta dos veces por su cuenta, asi que la rama de error recien
      // aparece en el tercer fallo. El cuarto request solo puede venir del boton.
      if (attempts <= 3) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"down"}' });
        return;
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESULT_FIXTURE) });
    });

    await page.goto('/track');
    await search(page, VALID_NUMBER);

    await expect(page.getByText(CONNECTION_COPY)).toBeVisible({ timeout: 25_000 });
    await page.getByRole('button', { name: /Reintentar/i }).click();

    await expect(page.getByText(VALID_NUMBER)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
    await expect(page.getByText(CONNECTION_COPY)).toHaveCount(0);
  });

  test('explains what the current state means, not just its label', async ({ page }) => {
    await page.route(TRACKING_ROUTE, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(RESULT_FIXTURE) })
    );

    await page.goto(`/track?q=${VALID_NUMBER}`);

    await expect(page.getByText('En manos del repartidor para entregar')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Fecha de creación')).toBeVisible();
  });

  test('places a shipment that went through the depot on the depot stage', async ({ page }) => {
    await page.route(TRACKING_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...RESULT_FIXTURE,
          estado: 'en_deposito',
          eventos: [
            { estado: 'en_deposito', descripcion: 'Ingresó al depósito', fecha: '2026-08-29T18:00:00Z' },
            ...RESULT_FIXTURE.eventos.slice(1),
          ],
        }),
      })
    );

    await page.goto(`/track?q=${VALID_NUMBER}`);

    const progressbar = page.locator('[role="progressbar"]');
    await expect(progressbar).toBeVisible({ timeout: 15_000 });
    await expect(progressbar).toHaveAttribute('aria-valuetext', 'En depósito');
    // Cuarta de seis etapas. El bug anterior lo dibujaba como "Pendiente", en cero.
    await expect(progressbar).toHaveAttribute('aria-valuenow', '4');
    await expect(progressbar).toHaveAttribute('aria-valuemax', '6');
  });

  test('draws a failed delivery where it actually stopped, not at zero', async ({ page }) => {
    await page.route(TRACKING_ROUTE, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...RESULT_FIXTURE,
          estado: 'fallido',
          eventos: [
            { estado: 'fallido', descripcion: 'Nadie en el domicilio', fecha: '2026-08-30T16:00:00Z' },
            ...RESULT_FIXTURE.eventos,
          ],
        }),
      })
    );

    await page.goto(`/track?q=${VALID_NUMBER}`);

    const progressbar = page.locator('[role="progressbar"]');
    await expect(progressbar).toBeVisible({ timeout: 15_000 });
    // en_reparto, la cuarta de cinco etapas: el envio llego lejos, no se quedo en cero.
    await expect(progressbar).toHaveAttribute('aria-valuenow', '4');
    await expect(page.getByText(/El recorrido se interrumpió en/i)).toBeVisible();
  });

  test('auto-searches from query parameter', async ({ page }) => {
    await page.goto(`/track?q=${VALID_NUMBER}`);

    await expect(page.locator('#tracking-input')).toHaveValue(VALID_NUMBER, { timeout: 5_000 });

    const resultOrMessage = page
      .getByText(NOT_FOUND_COPY)
      .or(page.getByText(CONNECTION_COPY))
      .or(page.getByText('Número de seguimiento'));
    await expect(resultOrMessage.first()).toBeVisible({ timeout: 25_000 });
  });

  test('shows tracking result with timeline when valid number exists', async ({ page }) => {
    const trackingNumber = process.env.TEST_TRACKING_NUMBER;
    test.skip(!trackingNumber, 'TEST_TRACKING_NUMBER env var required for this test');

    await page.goto(`/track?q=${trackingNumber}`);

    await expect(page.getByText(trackingNumber!)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Número de seguimiento')).toBeVisible();
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
  });
});
