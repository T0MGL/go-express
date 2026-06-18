import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  UploadSimple, DownloadSimple, CheckCircle, XCircle, Warning,
  FileText, Info, ArrowRight, Trash, CircleNotch,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useClienteBulkImport, type BulkImportEnvio } from '@/hooks/api/use-cliente-envios';
import { isValidPhone, normalizePhone } from '@/lib/phone';

interface FilaImportada {
  fila: number;
  destinatarioNombre: string;
  destinatarioDireccion: string;
  destinatarioTelefono: string;
  destino: string;
  peso: string;
  contenido: string;
  notas: string;
  errores: string[];
}

const COLUMNAS_TEMPLATE = [
  'destinatario_nombre',
  'destinatario_telefono',
  'destinatario_direccion',
  'destino_ciudad',
  'peso_kg',
  'contenido',
  'notas',
];

const parsearCSV = (text: string): FilaImportada[] => {
  const lineas = text.trim().split('\n').filter(Boolean);
  if (lineas.length < 2) return [];
  // Skip header
  const datos = lineas.slice(1);
  return datos.map((linea, idx) => {
    const cols = linea.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const [nombre = '', telefono = '', direccion = '', destino = '', peso = '', contenido = '', notas = ''] = cols;
    const errores: string[] = [];
    if (!nombre) errores.push('Falta nombre del destinatario');
    if (!telefono) errores.push('Falta teléfono');
    else if (!isValidPhone(telefono)) errores.push('Teléfono invalido');
    if (!direccion) errores.push('Falta dirección');
    if (!destino) errores.push('Falta ciudad de destino');
    if (!peso || isNaN(Number(peso))) errores.push('Peso invalido');
    return {
      fila: idx + 2,
      destinatarioNombre: nombre,
      destinatarioDireccion: direccion,
      destinatarioTelefono: telefono ? normalizePhone(telefono) : telefono,
      destino,
      peso,
      contenido,
      notas,
      errores,
    };
  });
};

const descargarTemplate = () => {
  const header = COLUMNAS_TEMPLATE.join(',');
  const ejemplo1 = 'Juan Perez Garcia,+595983123456,"Av. San Blas 1234, Centro",Ciudad del Este,2.5,Ropa y accesorios,Fragil';
  const ejemplo2 = 'Maria Lopez Hernandez,+595984987654,"Calle Padre Bolik 567, Centro",Encarnación,1.2,Electronico,';
  const csv = [header, ejemplo1, ejemplo2].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla_importacion_goexpress.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const ClienteImportar = () => {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [filas, setFilas] = useState<FilaImportada[]>([]);
  const [importado, setImportado] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState('');

  const bulkImportMutation = useClienteBulkImport();

  const procesarArchivo = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast({ title: 'Solo se aceptan archivos .csv', variant: 'destructive' });
      return;
    }
    setNombreArchivo(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parsearCSV(text);
      if (parsed.length === 0) {
        toast({ title: 'El archivo no tiene datos o el formato es incorrecto', variant: 'destructive' });
        return;
      }
      setFilas(parsed);
      setImportado(false);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) procesarArchivo(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) procesarArchivo(file);
  };

  const filasValidas = filas.filter((f) => f.errores.length === 0);
  const filasConError = filas.filter((f) => f.errores.length > 0);

  const confirmarImportacion = () => {
    if (filasValidas.length === 0) {
      toast({ title: 'No hay filas validas para importar', variant: 'destructive' });
      return;
    }

    const stored = localStorage.getItem('go_express_cliente');
    const clienteId = stored ? (JSON.parse(stored) as { id: string }).id : '';

    const envios: BulkImportEnvio[] = filasValidas.map((f) => ({
      clienteId,
      origen: 'Asunción',
      destino: f.destino,
      destinatarioNombre: f.destinatarioNombre,
      destinatarioDireccion: f.destinatarioDireccion,
      destinatarioTelefono: f.destinatarioTelefono,
      destinatarioCiudad: f.destino,
      producto: f.contenido || undefined,
      peso: parseFloat(f.peso) || 1,
      costo: 0,
      montoACobrar: 0,
      tipoPago: 'contra_entrega',
      notas: f.notas || undefined,
    }));

    bulkImportMutation.mutate(envios, {
      onSuccess: (res) => {
        setImportado(true);
        toast({
          title: `Listo, importamos ${res.imported} ${res.imported === 1 ? 'envío' : 'envíos'}`,
          description: 'Los pedidos quedaron registrados y pasan a recolección en las próximas horas.',
        });
      },
      onError: () => {
        toast({ title: 'No pudimos importar los envíos. Probá de nuevo.', variant: 'destructive' });
      },
    });
  };

  const limpiar = () => {
    setFilas([]);
    setImportado(false);
    setNombreArchivo('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <div className="page-header mb-6">
        <div>
          <h1 className="page-header-title">Importar paquetes</h1>
          <p className="page-header-subtitle">
            Cargá varios pedidos a la vez con un archivo CSV
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={descargarTemplate} className="gap-1.5">
          <DownloadSimple size={14} weight="duotone" /> Descargar plantilla
        </Button>
      </div>

      {/* Instrucciones */}
      <div className="surface-card p-4 mb-5 bg-primary/5 border-primary/20">
        <div className="flex items-start gap-2.5">
          <Info size={14} weight="duotone" className="text-primary flex-shrink-0 mt-0.5" />
          <div className="text-[12px] text-muted-foreground space-y-1">
            <p><strong className="text-foreground">Cómo funciona:</strong></p>
            <ol className="list-decimal list-inside space-y-0.5 ml-1">
              <li>Descargá la plantilla CSV con el botón de arriba</li>
              <li>Completá los datos de tus pedidos en el archivo (una fila por pedido)</li>
              <li>Subí el archivo completado al área de carga</li>
              <li>Revisá la vista previa y confirmá la importación</li>
            </ol>
            <p className="mt-1">
              <strong className="text-foreground">Campos obligatorios:</strong> nombre, teléfono, dirección, ciudad de destino, peso en kg.
            </p>
          </div>
        </div>
      </div>

      {/* Zona de carga */}
      {!importado && (
        <div
          className={cn(
            'border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer mb-5',
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/40 hover:bg-muted/30'
          )}
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <FileText size={32} weight="duotone" className="text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-[13px] font-medium mb-1">
            {dragging ? 'Soltá el archivo acá' : 'Arrastrá tu archivo CSV acá'}
          </p>
          <p className="text-[12px] text-muted-foreground mb-3">o hacé clic para elegirlo</p>
          <Button variant="outline" size="sm" className="gap-1.5" type="button">
            <UploadSimple size={14} weight="duotone" /> Seleccionar archivo
          </Button>
          {nombreArchivo && (
            <p className="text-[11px] text-primary mt-3 font-medium">{nombreArchivo}</p>
          )}
        </div>
      )}

      {/* Estado importado */}
      {importado && (
        <div className="surface-card p-6 mb-5 bg-green-50 border-green-200 text-center">
          <CheckCircle size={32} weight="duotone" className="text-green-500 mx-auto mb-3" />
          <h3 className="font-semibold text-[15px] mb-1">Listo, recibimos tus pedidos</h3>
          <p className="text-[12px] text-muted-foreground mb-4">
            Se importaron <strong className="font-data">{filasValidas.length}</strong>{' '}
            {filasValidas.length === 1 ? 'envío' : 'envíos'}. Los procesamos en las próximas horas y te notificamos cuando pasen a recolección.
          </p>
          <Button variant="outline" size="sm" onClick={limpiar} className="gap-1.5">
            <UploadSimple size={14} weight="duotone" /> Importar otro archivo
          </Button>
        </div>
      )}

      {/* Resumen */}
      {filas.length > 0 && !importado && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div className="flex gap-3 flex-1">
              <div className="stat-card !py-2 !px-3 flex-row items-center gap-2">
                <CheckCircle size={14} weight="duotone" className="text-green-500" />
                <span className="text-[12px]"><strong className="font-data">{filasValidas.length}</strong> listas</span>
              </div>
              <div className="stat-card !py-2 !px-3 flex-row items-center gap-2">
                <XCircle size={14} weight="duotone" className="text-destructive" />
                <span className="text-[12px]"><strong className="font-data">{filasConError.length}</strong> con errores</span>
              </div>
              <div className="stat-card !py-2 !px-3 flex-row items-center gap-2">
                <FileText size={14} weight="duotone" className="text-muted-foreground" />
                <span className="text-[12px]"><strong className="font-data">{filas.length}</strong> total</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={limpiar} className="gap-1.5">
                <Trash size={14} weight="duotone" /> Limpiar
              </Button>
              <Button
                size="sm"
                disabled={filasValidas.length === 0 || bulkImportMutation.isPending}
                onClick={confirmarImportacion}
                className="gap-1.5"
              >
                {bulkImportMutation.isPending ? (
                  <CircleNotch size={14} weight="bold" className="animate-spin" />
                ) : null}
                {bulkImportMutation.isPending ? 'Importando...' : `Importar ${filasValidas.length} envíos`}
                {!bulkImportMutation.isPending && <ArrowRight size={14} weight="bold" />}
              </Button>
            </div>
          </div>

          {/* Tabla preview */}
          <div className="surface-card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/40 text-[11px] font-medium text-muted-foreground">
              Vista previa: <span className="font-data">{nombreArchivo}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th className="pl-4">Fila</th>
                    <th>Estado</th>
                    <th>Destinatario</th>
                    <th>Teléfono</th>
                    <th>Dirección</th>
                    <th>Destino</th>
                    <th className="text-right">Peso</th>
                    <th>Contenido</th>
                    <th className="pr-4">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr
                      key={f.fila}
                      className={cn(
                        f.errores.length > 0 ? 'bg-red-50/60' : ''
                      )}
                    >
                      <td className="pl-4 text-muted-foreground font-data">#{f.fila}</td>
                      <td>
                        {f.errores.length === 0 ? (
                          <CheckCircle size={14} weight="duotone" className="text-green-500" />
                        ) : (
                          <XCircle size={14} weight="duotone" className="text-destructive" />
                        )}
                      </td>
                      <td className="text-[13px] font-medium">{f.destinatarioNombre || <span className="text-destructive">-</span>}</td>
                      <td className="text-[13px] text-muted-foreground font-data">{f.destinatarioTelefono || '-'}</td>
                      <td className="text-[13px] max-w-[160px] truncate text-muted-foreground">{f.destinatarioDireccion || '-'}</td>
                      <td className="text-[13px]">{f.destino || '-'}</td>
                      <td className="text-[13px] text-right font-data">{f.peso ? `${f.peso} kg` : '-'}</td>
                      <td className="text-[13px] max-w-[120px] truncate text-muted-foreground">{f.contenido || '-'}</td>
                      <td className="pr-4">
                        {f.errores.length > 0 ? (
                          <div className="flex items-start gap-1">
                            <Warning size={12} weight="duotone" className="text-destructive flex-shrink-0 mt-0.5" />
                            <span className="text-destructive text-[10px]">{f.errores.join(' . ')}</span>
                          </div>
                        ) : (
                          <span className="text-green-600 text-[10px]">OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ClienteImportar;
