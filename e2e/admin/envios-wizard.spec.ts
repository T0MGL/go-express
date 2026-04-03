import { test, expect } from '../fixtures';

test.describe('Envio Wizard (5-step creation)', () => {
  test.beforeEach(async ({ adminPage: page }) => {
    await page.evaluate(() => localStorage.removeItem('envio-borrador'));
    await page.goto('/admin/envios/nuevo');
    await expect(page.getByRole('heading', { name: 'Nuevo Envio' })).toBeVisible({ timeout: 10_000 });
  });

  test('displays all 5 step indicators', async ({ adminPage: page }) => {
    await expect(page.getByText('Cliente', { exact: true })).toBeVisible();
    await expect(page.getByText('Ruta')).toBeVisible();
    await expect(page.getByText('Paquete')).toBeVisible();
    await expect(page.getByText('Destinatario')).toBeVisible();
    await expect(page.getByText('Pago', { exact: true })).toBeVisible();
    await expect(page.getByText('Paso 1 de 5')).toBeVisible();
  });

  test('step 1: shows validation error when no client selected', async ({ adminPage: page }) => {
    await page.getByRole('button', { name: 'Siguiente' }).click();

    await expect(page.getByText('Selecciona un cliente')).toBeVisible();
  });

  test('step 1: select client and advance to step 2', async ({ adminPage: page }) => {
    const clienteTrigger = page.locator('#cliente').locator('..');
    await clienteTrigger.click();

    const firstOption = page.getByRole('option').first();
    await firstOption.click();

    await expect(page.getByText('Detalles del Cliente')).toBeVisible({ timeout: 5_000 });

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 2 de 5')).toBeVisible();
    await expect(page.getByText('Ruta de Envio')).toBeVisible();
  });

  test('step 2: select origin and destination', async ({ adminPage: page }) => {
    await selectClient(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();

    const origenTrigger = page.locator('#origen').locator('..');
    await origenTrigger.click();
    await page.getByRole('option', { name: 'Central' }).click();

    const destinoTrigger = page.locator('#destino').locator('..');
    await destinoTrigger.click();
    await page.getByRole('option', { name: 'Alto Parana' }).click();

    await expect(page.getByText(/Central.*Alto Parana/)).toBeVisible();
    await expect(page.getByText('Envio interdepartamental')).toBeVisible();

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 3 de 5')).toBeVisible();
  });

  test('step 3: enter weight and select size', async ({ adminPage: page }) => {
    await advanceToStep(page, 3);

    await expect(page.getByText('Detalles del Paquete')).toBeVisible();

    await page.locator('#peso').fill('2.5');
    await page.getByText('Mediano').click();

    await expect(page.getByText('Motor Volumetrico')).toBeVisible({ timeout: 3_000 });

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 4 de 5')).toBeVisible();
  });

  test('step 4: fill recipient data', async ({ adminPage: page }) => {
    await advanceToStep(page, 4);

    await expect(page.getByText('Datos del Destinatario')).toBeVisible();

    await page.locator('#destinatarioNombre').fill('Juan Perez Garcia');
    await page.locator('#destinatarioDireccion').fill('Av. Espana 1234, Barrio Centro');
    await page.locator('#destinatarioTelefono').fill('+595 981 123 456');

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 5 de 5')).toBeVisible();
  });

  test('step 4: shows validation for invalid phone format', async ({ adminPage: page }) => {
    await advanceToStep(page, 4);

    await page.locator('#destinatarioNombre').fill('Juan Perez Garcia');
    await page.locator('#destinatarioDireccion').fill('Av. Espana 1234, Barrio Centro');
    await page.locator('#destinatarioTelefono').fill('0981123456');

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Formato: +595 XXX XXX XXX')).toBeVisible();
  });

  test('step 5: shows payment form with suggested price', async ({ adminPage: page }) => {
    await advanceToStep(page, 5);

    await expect(page.getByText('Informacion de Pago')).toBeVisible();
    await expect(page.getByText('Precio Sugerido')).toBeVisible();

    const costoInput = page.locator('#costo');
    const costoValue = await costoInput.inputValue();
    expect(Number(costoValue)).toBeGreaterThan(0);
  });

  test('step 5: fill payment and see summary', async ({ adminPage: page }) => {
    await advanceToStep(page, 5);

    await page.locator('#costo').fill('50000');

    const tipoPagoTrigger = page.locator('#tipoPago').locator('..');
    await tipoPagoTrigger.click();
    await page.getByRole('option', { name: /Contra Entrega/ }).click();

    await expect(page.getByText('Resumen del Envio')).toBeVisible();
    await expect(page.getByText('Contra Entrega')).toBeVisible();
  });

  test('full wizard: create shipment end-to-end', async ({ adminPage: page }) => {
    await advanceToStep(page, 5);

    await page.locator('#costo').clear();
    await page.locator('#costo').fill('35000');

    const tipoPagoTrigger = page.locator('#tipoPago').locator('..');
    await tipoPagoTrigger.click();
    await page.getByRole('option', { name: /Cuenta Corriente/ }).click();

    await page.getByRole('button', { name: 'Crear Envio' }).click();

    const successToast = page.getByText(/Envio creado/);
    await expect(successToast).toBeVisible({ timeout: 15_000 });

    await page.waitForURL('/admin/envios', { timeout: 10_000 });
  });

  test('"Anterior" button navigates back through steps', async ({ adminPage: page }) => {
    await advanceToStep(page, 3);

    await page.getByRole('button', { name: 'Anterior' }).click();
    await expect(page.getByText('Paso 2 de 5')).toBeVisible();

    await page.getByRole('button', { name: 'Anterior' }).click();
    await expect(page.getByText('Paso 1 de 5')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  });

  test('"Guardar borrador" persists data', async ({ adminPage: page }) => {
    await selectClient(page);

    await page.getByRole('button', { name: /Guardar borrador/ }).click();
    await expect(page.getByText('Borrador guardado correctamente')).toBeVisible({ timeout: 5_000 });

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Nuevo Envio' })).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText('Detalles del Cliente')).toBeVisible({ timeout: 5_000 });
  });
});

async function selectClient(page: import('@playwright/test').Page) {
  const clienteTrigger = page.locator('#cliente').locator('..');
  await clienteTrigger.click();
  await page.getByRole('option').first().click();
  await expect(page.getByText('Detalles del Cliente')).toBeVisible({ timeout: 5_000 });
}

async function advanceToStep(page: import('@playwright/test').Page, targetStep: number) {
  if (targetStep >= 2) {
    await selectClient(page);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 2 de 5')).toBeVisible();
  }

  if (targetStep >= 3) {
    const origenTrigger = page.locator('#origen').locator('..');
    await origenTrigger.click();
    await page.getByRole('option', { name: 'Central' }).click();

    const destinoTrigger = page.locator('#destino').locator('..');
    await destinoTrigger.click();
    await page.getByRole('option', { name: 'Alto Parana' }).click();

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 3 de 5')).toBeVisible();
  }

  if (targetStep >= 4) {
    await page.locator('#peso').fill('2.5');
    await page.getByText('Mediano').click();

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 4 de 5')).toBeVisible();
  }

  if (targetStep >= 5) {
    await page.locator('#destinatarioNombre').fill('Juan Perez Garcia');
    await page.locator('#destinatarioDireccion').fill('Av. Espana 1234, Barrio Centro');
    await page.locator('#destinatarioTelefono').fill('+595 981 123 456');

    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page.getByText('Paso 5 de 5')).toBeVisible();
  }
}
