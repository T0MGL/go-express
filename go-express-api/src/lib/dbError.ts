import { AppError } from '../middleware/errorHandler.js';

// Las reglas de negocio de GO EXPRESS viven en el schema, no en el codigo: cada una es un
// RAISE EXCEPTION 'nombre_regla: mensaje humano' con ERRCODE P0001 (baseline 000 y las
// migraciones 018 a 044). Sin traduccion, PostgREST devolvia el error al servicio, el
// servicio lo convertia en 500 DB_ERROR y el operador del mostrador leia "error del
// servidor" cuando la base le estaba diciendo exactamente que corregir.
//
// Antes de esto habia tres traductores parciales escritos a mano (pago.service,
// liquidacion.service y updateEstado en envio.service) que cubrian 20 de las 35 reglas con
// criterios distintos. Este modulo es el unico camino: las reglas que ya tenian status
// definido lo conservan, porque ese es el contrato vivo del front y de los tests.
//
// El texto de la base es de la base: esta sin acentos y nombra tablas, funciones y uuids.
// Lo que sale de aca lo lee el mostrador, asi que cada regla alcanzable trae su propia copia
// en español y los datos utiles viajan aparte, en details.

interface Traduccion {
  mensaje?: string;
  detalles?: Record<string, unknown>;
}

interface Regla {
  status: number;
  traducir?: (mensajeDb: string) => Traduccion;
}

const texto = (mensaje: string) => (): Traduccion => ({ mensaje });

// Sin toLocaleString: el separador depende del ICU con el que se haya compilado Node y este
// numero lo lee un operador, no un test.
function guaranies(monto: number): string {
  return `${monto.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} Gs`;
}

// 'transicion_invalida: pendiente a entregado no es una transicion valida desde GE2026001073
// (allowed: {recolectado,problema})'. El front pinta los estados posibles en vez de dejar al
// operador adivinando cual era, asi que la lista viaja en details.
function transicion(mensajeDb: string): Traduccion {
  const m = mensajeDb.match(/^(\w+) a (\w+) no es una transicion valida desde (\S+) \(allowed: \{(.*)\}\)$/);
  if (m === null) return {};

  const [, actual = '', solicitado = '', trackingNumber = '', permitidos = ''] = m;
  const allowedTransitions = permitidos.split(',').map((e) => e.trim()).filter(Boolean);

  return {
    mensaje: `El envío está en "${actual}" y no puede pasar a "${solicitado}".`,
    detalles: { currentEstado: actual, requestedEstado: solicitado, trackingNumber, allowedTransitions },
  };
}

// Las dos reglas de I1 traen los mismos dos numeros: lo que se pretende cobrar y el piso.
function montos(mensajeDb: string): { montoACobrar: number; costoMasSeguro: number } | null {
  const [cobrar, minimo] = mensajeDb.match(/\((\d+)\)/g) ?? [];
  if (cobrar === undefined || minimo === undefined) return null;
  return { montoACobrar: Number(cobrar.slice(1, -1)), costoMasSeguro: Number(minimo.slice(1, -1)) };
}

function montoInsuficiente(mensajeDb: string): Traduccion {
  const detalles = montos(mensajeDb);
  if (detalles === null) return { mensaje: 'El monto a cobrar no cubre el costo del envío más el seguro.' };
  return {
    mensaje: `El monto a cobrar (${guaranies(detalles.montoACobrar)}) no cubre el costo del envío más el seguro (${guaranies(detalles.costoMasSeguro)}).`,
    detalles,
  };
}

function montoAnticipado(mensajeDb: string): Traduccion {
  const detalles = montos(mensajeDb);
  if (detalles === null) return { mensaje: 'Un envío anticipado cobra exactamente el costo del envío más el seguro.' };
  return {
    mensaje: `Un envío anticipado cobra exactamente el costo más el seguro (${guaranies(detalles.costoMasSeguro)}), no ${guaranies(detalles.montoACobrar)}.`,
    detalles,
  };
}

// El status sale de que tiene que hacer el operador: 404 el recurso no existe, 409 el estado
// actual del recurso lo bloquea (anular el pago, reabrir la liquidacion, asignar repartidor,
// recargar), 400/422 el dato enviado esta mal y se corrige en el formulario.
//
// Las reglas que no figuran siguen siendo 500 a proposito, y son de dos tipos. Invariantes
// internos: conservacion_rota (la contabilidad no cierra) y truncate_prohibido. Y guardas
// contra escrituras que la API no hace nunca (ledger_append_only, pago_no_eliminable,
// pago_no_modificable, liquidacion_reapertura_invalida, liquidacion_cerrada_inmutable):
// verificado que ningun endpoint hace DELETE ni UPDATE directo sobre pagos, liquidaciones ni
// movimientos_cuenta_corriente, asi que si alguna salta es que rompimos algo nosotros, no el
// operador, y el 500 es la respuesta honesta.
const REGLAS: ReadonlyMap<string, Regla> = new Map<string, Regla>([
  ['envio_no_encontrado', { status: 404, traducir: texto('El envío no existe.') }],
  ['liquidacion_no_encontrada', { status: 404, traducir: texto('La liquidación no existe.') }],
  ['pago_no_encontrado', { status: 404, traducir: texto('El pago no existe.') }],
  ['repartidor_no_encontrado', { status: 404, traducir: texto('El repartidor no existe.') }],

  ['cod_monto_no_modificable', {
    status: 409,
    traducir: texto('El envío ya tiene un cobro o está en una liquidación. Anulá el pago antes de cambiarle el monto.'),
  }],
  ['limite_credito_excedido', {
    status: 409,
    traducir: texto('El cliente supera su límite de crédito con este envío.'),
  }],
  ['liquidacion_envios_inmutable', {
    status: 409,
    traducir: texto('Ese envío pertenece a una liquidación cerrada. Reabrila para corregirlo.'),
  }],
  ['liquidacion_no_cerrada', {
    status: 409,
    traducir: texto('La liquidación ya está pendiente, no hay nada que reabrir.'),
  }],
  ['liquidacion_rango_solapado', {
    status: 409,
    traducir: texto('El repartidor ya tiene una liquidación que se solapa con ese rango de fechas.'),
  }],
  ['liquidacion_snapshot_stale', {
    status: 409,
    traducir: texto('La liquidación cambió mientras se cerraba. Recargá y volvé a intentar.'),
  }],
  ['liquidacion_ya_cerrada', { status: 409, traducir: texto('La liquidación ya está cerrada.') }],
  ['pago_en_liquidacion_cerrada', {
    status: 409,
    traducir: texto('El envío pertenece a una liquidación cerrada. Reabrila antes de editar o anular este pago.'),
  }],
  ['pago_envio_eliminado', {
    status: 409,
    traducir: texto('El envío fue anulado, no se puede registrar un cobro contra él.'),
  }],
  ['pago_sin_repartidor', {
    status: 409,
    traducir: texto('El envío no tiene repartidor asignado. Asignalo antes de registrar el cobro.'),
  }],
  ['pago_ya_anulado', { status: 409, traducir: texto('El pago ya fue anulado.') }],
  ['tipo_pago_no_modificable', {
    status: 409,
    traducir: texto('El envío tiene un cobro activo, no se puede cambiar la forma de pago.'),
  }],

  ['anticipado_monto_invalido', { status: 422, traducir: montoAnticipado }],
  ['descripcion_requerida', { status: 422, traducir: texto('La descripción no puede quedar vacía.') }],
  ['monto_a_cobrar_insuficiente', { status: 422, traducir: montoInsuficiente }],
  ['notas_requeridas', {
    status: 422,
    traducir: texto('Cerrar con diferencia requiere una nota de al menos 10 caracteres.'),
  }],
  ['pago_cc_no_editable', {
    status: 422,
    traducir: texto('Un pago a cuenta corriente no se edita. Anulalo y registrá uno nuevo con el monto correcto.'),
  }],
  ['pago_monto_total_invalido', {
    status: 422,
    traducir: texto('El monto total no coincide con el del envío. Recargá el envío e intentá de nuevo.'),
  }],
  ['transicion_invalida', { status: 422, traducir: transicion }],

  // 400 y no 422 porque es el status que estas cuatro ya devolvian antes de centralizar el
  // traductor, y el front no distingue entre los dos.
  ['envio_eliminado', { status: 400, traducir: texto('No se puede modificar un envío eliminado.') }],
  ['monto_invalido', { status: 400, traducir: texto('El monto recibido no puede ser negativo.') }],
  ['motivo_insuficiente', { status: 400, traducir: texto('El motivo debe tener al menos 10 caracteres.') }],
  ['pago_monto_recibido_invalido', {
    status: 400,
    traducir: texto('El monto recibido no puede ser negativo ni superar el importe del envío.'),
  }],
  ['rango_invalido', { status: 400, traducir: texto('La fecha hasta debe ser posterior o igual a la fecha desde.') }],
]);

const CODIGO_POR_STATUS: ReadonlyMap<number, string> = new Map([
  [400, 'BAD_REQUEST'],
  [404, 'NOT_FOUND'],
  [409, 'CONFLICT'],
  [422, 'UNPROCESSABLE_ENTITY'],
]);

interface ErrorPostgres {
  code: string;
  message: string;
}

function comoErrorPostgres(error: unknown): ErrorPostgres | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== 'string' || typeof message !== 'string') return null;
  return { code, message };
}

/**
 * Traduce una violacion de regla de negocio de Postgres al AppError que le corresponde.
 * Devuelve null para cualquier otro error, incluida una regla que no este mapeada: un P0001
 * desconocido es un 500 y tiene que seguir siendolo. Convertirlo en 422 seria decirle al
 * operador que se equivoco cuando el que fallo fue el sistema.
 */
export function businessRuleError(error: unknown): AppError | null {
  const pg = comoErrorPostgres(error);
  if (pg === null || pg.code !== 'P0001') return null;

  const corte = pg.message.indexOf(': ');
  if (corte === -1) return null;

  const nombre = pg.message.slice(0, corte);
  const mensajeDb = pg.message.slice(corte + 2);
  const regla = REGLAS.get(nombre);
  if (regla === undefined) return null;

  const { mensaje, detalles } = regla.traducir?.(mensajeDb) ?? {};

  return new AppError(
    mensaje ?? mensajeDb,
    regla.status,
    CODIGO_POR_STATUS.get(regla.status) ?? 'UNPROCESSABLE_ENTITY',
    { regla: nombre, ...detalles }
  );
}

/**
 * Unico punto de conversion de un error de supabase a AppError. Los servicios lo usan en vez
 * de construir el 500 DB_ERROR a mano, para que el trato de una regla de negocio no dependa
 * de por cual de los ~125 call sites paso.
 */
export function dbError(error: unknown, fallbackMessage: string): AppError {
  return businessRuleError(error) ?? new AppError(fallbackMessage, 500, 'DB_ERROR');
}
