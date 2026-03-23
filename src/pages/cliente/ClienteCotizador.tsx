import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { tipoServicioLabels } from '@/data/constants';
import { formatCurrency } from '@/lib/utils';
import { Calculator, Package, Truck, Info, CheckCircle, ArrowRight, CircleNotch } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useCiudadesDisponibles, useCotizar, type CotizarResponse } from '@/hooks/api/use-cotizador';

// Display format for cotizacion results
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
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [peso, setPeso] = useState('');
  const [largo, setLargo] = useState('');
  const [ancho, setAncho] = useState('');
  const [alto, setAlto] = useState('');
  const [cotizando, setCotizando] = useState(false);

  // API hooks
  const { data: apiCiudades } = useCiudadesDisponibles();
  const cotizarMutation = useCotizar();

  const ciudadesDisponibles = apiCiudades ?? [];

  // Compute display results
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
    if (!origen || !destino || !peso) return;

    const l = parseFloat(largo) || 0;
    const a = parseFloat(ancho) || 0;
    const al = parseFloat(alto) || 0;
    const hasDimensions = l > 0 && a > 0 && al > 0;

    cotizarMutation.mutate(
      {
        origen,
        destino,
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
    setOrigen('');
    setDestino('');
    setPeso('');
    setLargo('');
    setAncho('');
    setAlto('');
  };

  // Live volumetric preview
  const pesoVolPreview = useMemo(() => {
    const l = parseFloat(largo) || 0;
    const a = parseFloat(ancho) || 0;
    const al = parseFloat(alto) || 0;
    if (!l || !a || !al) return null;
    return Math.round((l * a * al) / 5000 * 100) / 100;
  }, [largo, ancho, alto]);

  const pesoRealNum = parseFloat(peso) || 0;
  const esTarificadoVol = pesoVolPreview !== null && pesoVolPreview > pesoRealNum;

  const noTarifasDisponibles = false;
  const canCotizar = !(!origen || !destino || !peso);

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-header-title">Cotizador de Envios</h1>
          <p className="page-header-subtitle">
            Calcula el costo estimado de tu envio antes de crearlo
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        {/* Formulario */}
        <div className="space-y-4">
          <div className="surface-card p-5">
            <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
              <Truck size={16} weight="duotone" className="text-primary" /> Ruta
            </h3>
            <div className="space-y-3">
              <div>
                <Label className="text-[11px]">Ciudad de origen *</Label>
                <Select value={origen} onValueChange={(v) => { setOrigen(v); setCotizando(false); }}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Seleccionar origen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ciudadesDisponibles.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px]">Ciudad de destino *</Label>
                <Select value={destino} onValueChange={(v) => { setDestino(v); setCotizando(false); }}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Seleccionar destino..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ciudadesDisponibles.filter((c) => c !== origen).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {noTarifasDisponibles && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded p-2">
                  No tenemos tarifas disponibles para esta ruta. Contacta a Go Express para consultar disponibilidad.
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

              {/* Live preview volumetrico */}
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
            {cotizarMutation.isPending ? 'Calculando...' : 'Calcular cotizacion'}
            {!cotizarMutation.isPending && <ArrowRight size={14} weight="bold" />}
          </Button>
        </div>

        {/* Resultados */}
        <div>
          {!cotizando && (
            <div className="surface-card p-8 text-center text-muted-foreground h-full flex flex-col items-center justify-center">
              <Calculator size={32} weight="duotone" className="mb-3 opacity-30" />
              <p className="text-[13px] font-medium">Completa el formulario</p>
              <p className="text-[12px] mt-1">Los resultados de cotizacion apareceran aqui</p>
            </div>
          )}

          {cotizando && displayResultados.length === 0 && (
            <div className="surface-card p-6 text-center text-muted-foreground">
              <p className="text-[13px]">No se pudo calcular. Verifica los datos ingresados.</p>
            </div>
          )}

          {cotizando && displayResultados.length > 0 && (
            <div className="space-y-3">
              <p className="section-label mb-3">
                Cotizacion para {origen} → {destino}
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
                      <Button size="sm" className="w-full gap-1.5 mt-1" onClick={() => navigate('/cliente/envios/nuevo')}>
                        <CheckCircle size={14} weight="duotone" /> Crear envio con esta tarifa
                      </Button>
                    )}
                  </div>
                ))}

              <Button variant="ghost" size="sm" onClick={resetear} className="w-full text-muted-foreground mt-2">
                Nueva cotizacion
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Info metodo volumetrico */}
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
