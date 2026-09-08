import { createClient } from '@supabase/supabase-js';
import { request, clienteHeaders, adminHeaders } from './setup/test-client.js';
import { seedTestData, cleanupTestData, type TestData } from './setup/seed.js';

const supabase = createClient(
  process.env['SUPABASE_URL']!,
  process.env['SUPABASE_SERVICE_ROLE_KEY']!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ADMIN_USER_ID = '00000000-0000-4000-a000-000000000001';

// 'Asunción' escrita descompuesta, que es como la escribe macOS y como llega en un CSV armado
// ahi. tarifa_norm_ciudad (056) devolvia 'asunción' para esta y 'asuncion' para la compuesta:
// dos rutas distintas para el indice, la misma ruta para el codigo.
const ASUNCION_NFD = 'Asuncio\u0301n';
const ASUNCION_NBSP = '\u00a0Asuncion\u00a0';

let testData: TestData;

beforeAll(async () => {
  testData = await seedTestData();
});

afterAll(async () => {
  await cleanupTestData(testData);
});

describe('el normalizador: una regla, no una lista escrita a mano', () => {
  // Todas escritas con escapes: un caracter invisible o una nasal precompuesta pegada en el
  // fuente pasa desapercibida en review y viaja distinto segun la herramienta.
  const equivalencias: ReadonlyArray<readonly [string, string, string]> = [
    ['nasal guarani i', 'Tava\u0129', 'tavai'],
    ['nasal guarani e', '\u00d1e\u1ebdmbucu', 'neembucu'],
    ['nasal guarani u', 'Cerro Guas\u0169', 'cerro guasu'],
    ['nasal guarani y', 'Guas\u1ef9 Kua', 'guasy kua'],
    ['enie', '\u00d1emby', 'nemby'],
    ['cedilla', 'Cura\u00e7ao', 'curacao'],
    ['descompuesta', 'Asuncio\u0301n', 'asuncion'],
    ['espacio ideografico', 'Ciudad del\u3000Este', 'ciudad del este'],
    ['bom y espacios duros', '\ufeff\u00a0Encarnaci\u00f3n\u202f', 'encarnacion'],
  ];

  // Las vocales nasales son grafia corriente en guarani, y esto es Paraguay: el catalogo hoy
  // escribe 'Tavaí' con agudo, pero el dia que alguien lo corrija a 'Tavaĩ' esa ruta tiene que
  // seguir cotizando. Una lista de acentuados escrita a mano no sobrevive a esa correccion; la
  // descomposicion si.
  it.each(equivalencias)('%s normaliza a la forma sin marcas', async (_etiqueta, entrada, esperado) => {
    const { data, error } = await supabase.rpc('norm_ciudad', { p_in: entrada });

    expect(error).toBeNull();
    expect(data).toBe(esperado);
  });

  it('el catalogo no tiene dos ciudades que normalicen igual', async () => {
    // Normalizar mas agresivo puede fusionar dos ciudades distintas y volverlas ambiguas, y una
    // ciudad ambigua es una ruta que deja de cotizar. 262 nombres, 262 normalizados.
    const res = await request.get('/api/public/ciudades');
    const ciudades = res.body.data as Array<{ nombre: string }>;

    const { data, error } = await supabase.rpc('resolver_ciudades', {
      p_nombres: ciudades.map((c) => c.nombre),
    });

    expect(error).toBeNull();
    const filas = data as Array<{ coincidencias: number }>;
    expect(filas).toHaveLength(ciudades.length);
    expect(filas.filter((f) => f.coincidencias !== 1)).toHaveLength(0);
  });
});

describe('identidad de ruta: dos filas para la misma ruta', () => {
  // La primera mitad de la cadena: las dos escrituras son la misma ciudad para el unico
  // normalizador que queda. tarifa_norm_ciudad devolvia 'asuncion' para una y 'asuncion' con
  // tilde para la otra, y de ahi salian dos rutas donde el codigo veia una.
  it('la compuesta y la descompuesta resuelven al mismo id de ciudad', async () => {
    const { data, error } = await supabase.rpc('resolver_ciudades', {
      p_nombres: ['Asunción', ASUNCION_NFD, ASUNCION_NBSP],
    });

    expect(error).toBeNull();
    const filas = data as Array<{ ciudad_id: string | null; coincidencias: number }>;
    expect(filas).toHaveLength(3);
    expect(new Set(filas.map((f) => f.ciudad_id)).size).toBe(1);
    expect(filas[0]?.ciudad_id).toBe(testData.origenCiudadId);
  });

  it('la base rechaza una segunda tarifa viva para el mismo par de ciudades', async () => {
    // Escrita en NFD a proposito: bajo el unique por nombre normalizado de 056 esta fila entraba,
    // porque el normalizador de SQL no recomponia. El unique por ids no le da esa salida.
    const { error } = await supabase.from('tarifas').insert({
      origen: ASUNCION_NFD,
      destino: 'Encarnación',
      origen_ciudad_id: testData.origenCiudadId,
      destino_ciudad_id: testData.destinoCiudadId,
      tipo_servicio: 'estandar',
      precio_base: 99000,
      peso_base: 5,
      precio_por_kg_extra: 5000,
      factor_dimensional: 5000,
      activo: true,
      eliminado: false,
      creado_por: ADMIN_USER_ID,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('23505');
  });

  it('no deja crear una tarifa viva sin ciudad resuelta', async () => {
    const { error } = await supabase.from('tarifas').insert({
      origen: 'Asuncion',
      destino: 'Alto Parana',
      origen_ciudad_id: testData.origenCiudadId,
      destino_ciudad_id: null,
      tipo_servicio: 'express',
      precio_base: 42000,
      peso_base: 5,
      precio_por_kg_extra: 5000,
      factor_dimensional: 5000,
      activo: true,
      eliminado: false,
      creado_por: ADMIN_USER_ID,
    });

    expect(error).not.toBeNull();
    expect(error?.code).toBe('23514');
    expect(error?.message).toContain('tarifas_ruta_ciudad_resuelta');
  });

  it('el texto de la ruta lo deriva la base desde ciudades, no el que escribe', async () => {
    const { data, error } = await supabase
      .from('tarifas')
      .update({ origen: 'CUALQUIER COSA', destino: 'otra cosa' })
      .eq('id', testData.tarifaId)
      .select('origen, destino')
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({ origen: 'Asunción', destino: 'Encarnación' });
  });
});

describe('identidad de ruta: la misma ciudad escrita de varias formas', () => {
  const escrituras: ReadonlyArray<readonly [string, string]> = [
    ['sin tildes', 'Asuncion'],
    ['con tildes', 'Asunción'],
    ['descompuesta (NFD)', ASUNCION_NFD],
    ['con espacios duros', ASUNCION_NBSP],
    ['en mayusculas y con espacios de mas', '  ASUNCION   '],
  ];

  it.each(escrituras)('%s cotiza contra la misma tarifa', async (_etiqueta, origen) => {
    const res = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({ origen, destino: 'Encarnacion', peso: 3 });

    expect(res.status).toBe(200);
    expect(res.body.tarifa).toMatchObject({ origen: 'Asunción', destino: 'Encarnación' });
    expect(res.body.costoTotal).toBe(35000);
  });

  it('el gateway cotiza igual la compuesta y la descompuesta', async () => {
    const [compuesta, descompuesta] = await Promise.all([
      request
        .post('/api/cliente/cotizador/cotizar')
        .set(clienteHeaders(testData.clienteId))
        .send({ origen: 'Asunción', destino: 'Encarnación', peso: 4.2 }),
      request
        .post('/api/cliente/cotizador/cotizar')
        .set(clienteHeaders(testData.clienteId))
        .send({ origen: ASUNCION_NFD, destino: 'Encarnación', peso: 4.2 }),
    ]);

    expect(compuesta.status).toBe(200);
    expect(descompuesta.status).toBe(200);
    expect(descompuesta.body.costoTotal).toBe(compuesta.body.costoTotal);
    expect(descompuesta.body.tarifa).toEqual(compuesta.body.tarifa);
  });
});

describe('identidad de ruta: el selector y el backend miran lo mismo', () => {
  it('toda tarifa viva cotiza por el nombre de catalogo de sus dos ciudades', async () => {
    const [tarifasRes, ciudadesRes] = await Promise.all([
      request.get('/api/admin/tarifas').query({ limit: 100 }).set(adminHeaders()),
      request.get('/api/public/ciudades'),
    ]);

    expect(tarifasRes.status).toBe(200);
    expect(ciudadesRes.status).toBe(200);

    const ciudades = ciudadesRes.body.data as Array<{ id: string; nombre: string; habilitada: boolean }>;
    const nombrePorId = new Map(ciudades.map((c) => [c.id, c.nombre] as const));

    const vivas = (tarifasRes.body.data as Array<{
      id: string;
      activo: boolean;
      eliminado: boolean;
      origenCiudadId: string | null;
      destinoCiudadId: string | null;
    }>).filter((t) => t.activo && !t.eliminado);

    expect(vivas.length).toBeGreaterThanOrEqual(1);

    for (const tarifa of vivas) {
      // Que el selector la pueda nombrar es la mitad: si el id no esta en el catalogo, el chip
      // verde apunta a una ciudad que el backend no puede resolver.
      const origen = tarifa.origenCiudadId === null ? null : nombrePorId.get(tarifa.origenCiudadId);
      const destino = tarifa.destinoCiudadId === null ? null : nombrePorId.get(tarifa.destinoCiudadId);
      expect(origen).toBeDefined();
      expect(destino).toBeDefined();

      // Y la otra mitad: el backend le pone precio a esa misma ruta, nombrada como la nombra el
      // selector. Con la busqueda por texto de antes, una tarifa con el nombre escrito distinto
      // salia habilitada en el selector y sin cobertura en el cotizador.
      const cotizacion = await request
        .post('/api/cliente/cotizador/cotizar')
        .set(clienteHeaders(testData.clienteId))
        .send({ origen, destino, peso: 1 });

      expect(cotizacion.status).toBe(200);
      expect(cotizacion.body.costoTotal).toBeGreaterThan(0);
    }
  });

  it('una ciudad sin tarifa no aparece habilitada ni cotiza', async () => {
    const ciudadesRes = await request.get('/api/public/ciudades');
    const ciudades = ciudadesRes.body.data as Array<{ nombre: string; habilitada: boolean }>;
    const fuerteOlimpo = ciudades.find((c) => c.nombre === 'Fuerte Olimpo');

    expect(fuerteOlimpo?.habilitada).toBe(false);

    const cotizacion = await request
      .post('/api/cliente/cotizador/cotizar')
      .set(clienteHeaders(testData.clienteId))
      .send({ origen: 'Asuncion', destino: 'Fuerte Olimpo', peso: 1 });

    expect(cotizacion.status).toBe(404);
  });
});
