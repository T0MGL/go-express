import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { tipoServicioLabels } from '@/data/constants';
import { formatCurrency } from '@/lib/utils';
import { Calculator, Package, Truck, Info, CheckCircle, ArrowRight, CircleNotch } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useCotizar, type CotizarResponse } from '@/hooks/api/use-cotizador';
import { CiudadPicker } from '@/components/CiudadPicker';
import type { Ciudad } from '@/hooks/api/use-ciudades';

interface DisplayResultado {
  tipoServicio: string;
  pesoReal: number;
  pesoVolumetrico: number;
  pesoTarificado: number;
  esVolumetrico: boolean;
  pesoExtra: number;
  costoBase: number;
  costoExtra: number;
  costoTotal: number;
  pesoBase: number;
  precioPorKgExtra: number;
}

const ClienteCotizador = () => {
  const navigate = useNavigate();
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [origenNombre, setOrigenNombre] = useState('');
  const [destinoNombre, setDestinoNombre] = useState('');
  const [peso, setPeso] = useState('');
  const [largo, setLargo] = useState('');
  const [ancho, setAncho] = useState('');
  const [alto, setAlto] = useState('');
  const [cotizando, setCotizando] = useState(false);

  const cotizarMutation = useCotizar();

  const handleOrigenChange = (id: string, ciudad: Ciudad) => {
    setOrigenId(id);
    setOrigenNombre(ciudad.nombre);
    setCotizando(false);
  };

  const handleDestinoChange = (id: string, ciudad: Ciudad) => {
    setDestinoId(id);
    setDestinoNombre(ciudad.nombre);
    setCotizando(false);
  };

  const displayResultados: DisplayResultado[] = useMemo(() => {
    const r = cotizarMutation.data as CotizarResponse | undefined;
    if (!r) return [];
    return [{
      tipoServicio: r.tarifa?.tipoServicio ?? 'estandar',
      pesoReal: r.pesoReal,
      pesoVolumetrico: r.pesoVolumetrico,
      pesoTarificado: r.pesoTarificado,
      esVolumetrico: r.esVolumetrico,
      pesoExtra: Math.max(0, r.pesoTarificado - 0),
      costoBase: r.costoBase,
      costoExtra: r.costoExtra,
      costoTotal: r.costoTotal,
      pesoBase: 0,
      precioPorKgExtra: 0,
    }];
  }, [cotizarMutation.data]);

  const cotizar = () => {
    if (!origenId || !destinoId || !peso) return;

    const l = parseFloat(largo) || 0;
    const a = parseFloat(ancho) || 0;
    const al = parseFloat(alto) || 0;
    const hasDimensions = l > 0 && a > 0 && al > 0;

    cotizarMutation.mutate(
      {
        origenCiudadId: origenId,
        destinoCiudadId: destinoId,
        peso: parseFloat(peso),
        dimensiones: hasDimensions ? { largo: l, ancho: a, alto: al } : undefined,
      },
      {
        onSuccess: () => {
          setCotizando(true);
        },
      }
    );
  };

  const resetear = () => {
    setCotizando(false);
    setOrigenId('');
    setDestinoId('');
    setOrigenNombre('');
    setDestinoNombre('');
    setPeso('');
    setLargo('');
    setAncho('');
    setAlto('');
    cotizarMutation.reset();
  };

  const pesoVolPreview = useMemo(() => {
    const l = parseFloat(largo) || 0;
    const a = parseFloat(ancho) || 0;
    const al = parseFloat(alto) || 0;
    if (!l || !a || !al) return null;
    return Math.round((l * a * al) / 5000 * 100) / 100;
  }, [largo, ancho, alto]);

  const pesoRealNum = parseFloat(peso) || 0;
  const esTarificadoVol = pesoVolPreview !== null && pesoVolPreview > pesoRealNum;
  const canCotizar = !(!origenId || !destinoId || !peso);

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-header-title">Cotizador</h1>
          <p className="page-header-subtitle">
            Calculá el costo estimado antes de crear el envío
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div className="surface-card p-5">
            <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
              <Truck size={16} weight="duotone" className="text-primary" /> Ruta
            </h3>
            <div className="space-y-3">
              <CiudadPicker
                value={origenId || undefined}
                onChange={handleOrigenChange}
                source="cliente"
                label="Ciudad de origen *"
                placeholder="Seleccionar origen..."
                id="cotizador-origen"
              />
              <CiudadPicker
                value={destinoId || undefined}
                onChange={handleDestinoChange}
                source="cliente"
                label="Ciudad de destino *"
                placeholder="Seleccionar destino..."
                id="cotizador-destino"
              />
              {cotizarMutation.isError && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded p-2">
                  No hay tarifa para esta ruta. Contactá a Go Express para consultar disponibilidad.
                </p>
              )}
            </div>
          </div>

          <div className="surface-card p-5">
            <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
              <Package size={16} weight="duotone" className="text-primary" /> Peso y dimensiones
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-[11px]">Peso real (kg) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={peso}
                  onChange={(e) => { setPeso(e.target.value); setCotizando(false); }}
                  placeholder="Ej: 2.5"
                  className="mt-1.5 font-data"
                />
              </div>
              <div>
                <Label className="text-[11px]">Dimensiones (cm), para calculo volumetrico</Label>
                <div className="grid grid-cols-3 gap-2 mt-1.5">
                  <Input type="number" value={largo} onChange={(e) => { setLargo(e.target.value); setCotizando(false); }} placeholder="Largo" className="font-data" />
                  <Input type="number" value={ancho} onChange={(e) => { setAncho(e.target.value); setCotizando(false); }} placeholder="Ancho" className="font-data" />
                  <Input type="number" value={alto} onChange={(e) => { setAlto(e.target.value); setCotizando(false); }} placeholder="Alto" className="font-data" />
                </div>
              </div>

              {pesoVolPreview !== null && (
                <div className={cn(
                  'rounded-lg p-3 text-[12px] border',
                  esTarificadoVol
                    ? 'bg-amber-50 border-amber-200 text-amber-700'
                    : 'bg-muted/40 border-border text-muted-foreground'
                )}>
                  <div className="flex items-start gap-2">
                    <Info size={14} weight="duotone" className="flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p>
                        <strong>Peso volumetrico:</strong> (<span className="font-data">{largo}</span> x <span className="font-data">{ancho}</span> x <span className="font-data">{alto}</span>) / 5.000 = <strong className="font-data">{pesoVolPreview} kg</strong>
                      </p>
                      <p>
                        <strong>Peso real:</strong> <span className="font-data">{pesoRealNum} kg</span>
                      </p>
                      <p className="font-semibold">
                        Se tarificara por:{' '}
                        {esTarificadoVol
                          ? <>peso volumetrico (<span className="font-data">{pesoVolPreview} kg</span>) - es mayor</>
                          : <>peso real (<span className="font-data">{pesoRealNum} kg</span>) - es mayor</>}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={cotizar}
            size="sm"
            disabled={!canCotizar || cotizarMutation.isPending}
            className="w-full gap-1.5"
          >
            {cotizarMutation.isPending ? (
              <CircleNotch size={14} weight="bold" className="animate-spin" />
            ) : (
              <Calculator size={14} weight="duotone" />
            )}
            {cotizarMutation.isPending ? 'Calculando...' : 'Calcular cotización'}
            {!cotizarMutation.isPending && <ArrowRight size={14} weight="bold" />}
          </Button>
        </div>

        <div>
          {!cotizando && (
            <div className="surface-card p-8 text-center text-muted-foreground h-full flex flex-col items-center justify-center">
              <Calculator size={32} weight="duotone" className="mb-3 opacity-30" />
              <p className="text-[13px] font-medium">Completá el formulario</p>
              <p className="text-[12px] mt-1 max-w-[18rem]">
                Los resultados de la cotización van a aparecer acá al apretar "Calcular cotización".
              </p>
            </div>
          )}

          {cotizando && displayResultados.length === 0 && (
            <div className="surface-card p-6 text-center text-muted-foreground">
              <p className="text-[13px]">No pudimos calcular. Revisá los datos ingresados.</p>
            </div>
          )}

          {cotizando && displayResultados.length > 0 && (
            <div className="space-y-3">
              <p className="section-label mb-3">
                Cotizacion para {origenNombre} → {destinoNombre}
              </p>
              {displayResultados
                .sort((a, b) => a.costoTotal - b.costoTotal)
                .map((r, i) => (
                  <div
                    key={`${r.tipoServicio}-${i}`}
                    className={cn(
                      'surface-card p-5 transition-all',
                      i === 0 ? 'border-primary ring-1 ring-primary/20' : ''
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={i === 0 ? 'default' : 'outline'}>
                          {tipoServicioLabels[r.tipoServicio] || r.tipoServicio}
                        </Badge>
                        {i === 0 && (
                          <Badge className="text-[10px] bg-green-100 text-green-700 border-green-200">
                            Mas economico
                          </Badge>
                        )}
                      </div>
                      <p className="text-lg font-bold text-foreground font-data">
                        {formatCurrency(r.costoTotal)}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground mb-3">
                      <div className="flex justify-between">
                        <span>Precio base (<span className="font-data">{r.pesoBase}</span> kg):</span>
                        <span className="font-data">{formatCurrency(r.costoBase)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Peso tarificado:</span>
                        <span className={cn('font-medium font-data', r.esVolumetrico ? 'text-amber-600' : '')}>
                          {r.pesoTarificado} kg {r.esVolumetrico ? '(vol.)' : '(real)'}
                        </span>
                      </div>
                      {r.pesoExtra > 0 && (
                        <div className="flex justify-between col-span-2">
                          <span>Kg extra (<span className="font-data">{r.pesoExtra}</span> kg x <span className="font-data">{formatCurrency(r.precioPorKgExtra)}</span>):</span>
                          <span className="font-data">{formatCurrency(r.costoExtra)}</span>
                        </div>
                      )}
                    </div>

                    {r.esVolumetrico && (
                      <div className="text-[11px] bg-amber-50 border border-amber-100 rounded p-2 mb-3 flex items-start gap-1.5">
                        <Info size={12} weight="duotone" className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <span className="text-amber-700">
                          Se aplica <strong>peso volumetrico</strong> (<span className="font-data">{r.pesoVolumetrico} kg</span>) porque es mayor que el peso real (<span className="font-data">{r.pesoReal} kg</span>).
                        </span>
                      </div>
                    )}

                    {i === 0 && (
                      <Button size="sm" className="w-full gap-1.5 mt-1" onClick={() => navigate('/portal/envios/nuevo')}>
                        <CheckCircle size={14} weight="duotone" /> Crear envío con esta tarifa
                      </Button>
                    )}
                    {i === 0 && (
                      <p className="text-[10px] text-muted-foreground text-center mt-2">
                        El precio final puede variar al verificar el paquete en depósito.
                      </p>
                    )}
                  </div>
                ))}

              <Button variant="ghost" size="sm" onClick={resetear} className="w-full text-muted-foreground mt-2">
                Nueva cotización
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="surface-card p-4 mt-5 bg-muted/30">
        <div className="flex items-start gap-2.5">
          <Info size={14} weight="duotone" className="text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-muted-foreground">
            <strong className="text-foreground">Motor Volumetrico Go Express:</strong>{' '}
            El peso volumetrico se calcula como (Largo x Ancho x Alto) / 5.000. Go Express cobra el mayor
            entre el peso real y el peso volumetrico. Esta cotizacion es estimativa; el precio final puede
            variar segun la verificacion fisica del paquete.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClienteCotizador;
