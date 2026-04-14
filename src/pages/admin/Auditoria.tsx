import { useState, useMemo, useEffect } from 'react';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuditoriaLog } from '@/data/types';
import {
  accionLabels,
  accionColors,
} from '@/data/constants';
import {
  ShieldCheck,
  DownloadSimple,
  Info,
  UserCircle,
  Clock,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import { cn, formatTimestamp, formatTimestampTime, formatTimestampSmart } from '@/lib/utils';
import { useAuditoria } from '@/hooks/api/use-auditoria';
import { useUsuarios } from '@/hooks/api/use-usuarios';

const entidadLabels: Record<string, string> = {
  envio: 'Envío',
  cliente: 'Cliente',
  repartidor: 'Repartidor',
  pago: 'Pago',
  nota_interna: 'Nota Interna',
  tarifa: 'Tarifa',
  usuario: 'Usuario',
  almacen: 'Almacén',
  sistema: 'Sistema',
};

const badgeVariantForColor = (color: string) => {
  switch (color) {
    case 'success': return 'bg-green-100 text-green-700 border-green-200';
    case 'destructive': return 'bg-red-100 text-red-700 border-red-200';
    case 'warning': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'primary': return 'bg-blue-100 text-blue-700 border-blue-200';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const PAGE_SIZE = 20;

const Auditoria = () => {
  const [busqueda, setBusqueda] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('todos');
  const [filtroAccion, setFiltroAccion] = useState('todos');
  const [filtroEntidad, setFiltroEntidad] = useState('todos');
  const [filtroFecha, setFiltroFecha] = useState('');
  const [page, setPage] = useState(1);

  const debouncedBusqueda = useDebouncedValue(busqueda, 350);

  useEffect(() => {
    setPage(1);
  }, [debouncedBusqueda, filtroUsuario, filtroAccion, filtroEntidad, filtroFecha]);

  const apiFilters = useMemo(() => {
    const f: Record<string, string | number | undefined> = { page, limit: PAGE_SIZE };
    if (filtroUsuario !== 'todos') f.usuarioId = filtroUsuario;
    if (filtroAccion !== 'todos') f.accion = filtroAccion;
    if (filtroEntidad !== 'todos') f.entidad = filtroEntidad;
    if (filtroFecha) {
      f.fechaDesde = filtroFecha;
      f.fechaHasta = filtroFecha;
    }
    if (debouncedBusqueda) f.search = debouncedBusqueda;
    return f;
  }, [filtroUsuario, filtroAccion, filtroEntidad, filtroFecha, debouncedBusqueda, page]);

  const { data: apiAuditoria, isLoading } = useAuditoria(apiFilters);
  const { data: apiUsuarios } = useUsuarios();

  const logs = (apiAuditoria?.data ?? []) as unknown as AuditoriaLog[];
  const logsFiltrados = (apiAuditoria?.data ?? []) as unknown as AuditoriaLog[];
  const totalCount = apiAuditoria?.pagination?.total ?? logs.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const exportarCSV = () => {
    const headers = ['Fecha', 'Hora', 'Usuario', 'Acción', 'Entidad', 'ID Entidad', 'Descripción', 'Valor Anterior', 'Valor Nuevo'];
    const rows = logsFiltrados.map((l) => [
      formatTimestamp(l.creadoEn), formatTimestampTime(l.creadoEn), l.usuario,
      accionLabels[l.accion], entidadLabels[l.entidad], l.entidadId,
      `"${l.descripcion}"`, l.valorAnterior || '', l.valorNuevo || '',
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const usuariosUnicos = apiUsuarios ?? [];
  const accionesUnicas = Object.keys(accionLabels) as AuditoriaLog['accion'][];
  const entidadesUnicas = Object.keys(entidadLabels) as AuditoriaLog['entidad'][];

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroUsuario('todos');
    setFiltroAccion('todos');
    setFiltroEntidad('todos');
    setFiltroFecha('');
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-header-title flex items-center gap-2">
            <ShieldCheck size={20} weight="duotone" className="text-primary" />
            Historial de acciones
          </h1>
          <p className="page-header-subtitle">
            Cada cambio que se hizo en el sistema, quien lo hizo y cuando
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportarCSV} className="gap-1.5">
          <DownloadSimple size={14} weight="duotone" /> Exportar CSV
        </Button>
      </div>

      {/* Aviso inmutabilidad */}
      <div className="surface-card p-3 bg-primary/5 border-primary/20 flex items-start gap-2.5">
        <Info size={16} weight="duotone" className="text-primary flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-muted-foreground">
          <strong className="text-foreground">Este historial no se puede editar ni borrar.</strong> Todo queda guardado para poder revisar quien hizo que y cuando.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <SearchInput
          value={busqueda}
          onChange={setBusqueda}
          placeholder="Buscar en el detalle de la acción..."
          className="flex-1 min-w-48"
        />
        <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
          <SelectTrigger className={cn('w-40', filtroUsuario !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
            <SelectValue placeholder="Usuario" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los usuarios</SelectItem>
            {usuariosUnicos.map((u) => (
              <SelectItem key={u.id} value={u.id}>{u.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroAccion} onValueChange={setFiltroAccion}>
          <SelectTrigger className={cn('w-44', filtroAccion !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las acciones</SelectItem>
            {accionesUnicas.map((a) => (
              <SelectItem key={a} value={a}>{accionLabels[a]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroEntidad} onValueChange={setFiltroEntidad}>
          <SelectTrigger className={cn('w-36', filtroEntidad !== 'todos' && 'border-primary/50 bg-primary/5 text-foreground')}>
            <SelectValue placeholder="Entidad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las entidades</SelectItem>
            {entidadesUnicas.map((e) => (
              <SelectItem key={e} value={e}>{entidadLabels[e]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          className={cn('w-40', filtroFecha && 'border-primary/50 bg-primary/5 text-foreground')}
        />
        {(busqueda || filtroUsuario !== 'todos' || filtroAccion !== 'todos' || filtroEntidad !== 'todos' || filtroFecha) && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="text-muted-foreground">
            Limpiar filtros
          </Button>
        )}
      </div>

      {/* Log table */}
      <div className="surface-card overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-2">
                <div className="h-4 w-32 bg-muted/40 rounded animate-pulse" />
                <div className="h-4 w-20 bg-muted/30 rounded animate-pulse" />
                <div className="h-5 w-16 bg-muted/40 rounded-full animate-pulse" />
                <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
                <div className="h-4 w-64 bg-muted/20 rounded animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
        <>
        <div className="overflow-x-auto">
          <table className="premium-table w-full">
            <thead>
              <tr>
                <th className="whitespace-nowrap w-[1%]">
                  <div className="flex items-center gap-1.5"><Clock size={12} weight="duotone" /> Cuando</div>
                </th>
                <th className="whitespace-nowrap w-[1%]">
                  <div className="flex items-center gap-1.5"><UserCircle size={12} weight="duotone" /> Quien</div>
                </th>
                <th className="w-[1%]">Acción</th>
                <th className="w-[1%]">Sobre</th>
                <th>Detalle</th>
                <th className="whitespace-nowrap w-[1%]">Cambios</th>
              </tr>
            </thead>
            <tbody>
              {logsFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-[13px]">
                    No hay registros que coincidan con los filtros
                  </td>
                </tr>
              )}
              {logsFiltrados.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap align-top">
                    <p className="font-medium text-[12px] leading-snug">{formatTimestampSmart(log.creadoEn)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5" title={`${formatTimestamp(log.creadoEn)} ${formatTimestampTime(log.creadoEn)}`}>
                      {formatTimestampTime(log.creadoEn)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap align-top">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <UserCircle size={12} weight="duotone" className="text-primary" />
                      </div>
                      <span className="text-[12px] font-medium">{log.usuario}</span>
                    </div>
                  </td>
                  <td className="align-top">
                    <span className={cn(
                      'inline-flex items-center justify-center whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium border',
                      badgeVariantForColor(accionColors[log.accion])
                    )}>
                      {accionLabels[log.accion]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap align-top">
                    <Badge variant="outline" className="text-[11px] whitespace-nowrap">
                      {entidadLabels[log.entidad]}
                    </Badge>
                  </td>
                  <td className="align-top">
                    <p className="text-[12px] text-foreground leading-relaxed">{log.descripcion}</p>
                  </td>
                  <td className="whitespace-nowrap align-top">
                    {(log.valorAnterior || log.valorNuevo) ? (
                      <div className="text-[11px] space-y-1">
                        {log.valorAnterior && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground shrink-0 w-[46px] text-right">Antes:</span>
                            <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded border border-red-100 font-data text-[10px]">
                              {typeof log.valorAnterior === 'string' ? log.valorAnterior : JSON.stringify(log.valorAnterior)}
                            </span>
                          </div>
                        )}
                        {log.valorNuevo && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted-foreground shrink-0 w-[46px] text-right">Después:</span>
                            <span className="bg-green-50 text-green-600 px-1.5 py-0.5 rounded border border-green-100 font-data text-[10px]">
                              {typeof log.valorNuevo === 'string' ? log.valorNuevo : JSON.stringify(log.valorNuevo)}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground/40">Sin cambios</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {logsFiltrados.length > 0 && (
          <div className="border-t px-4 py-2.5 flex items-center justify-between gap-3 text-[11px] text-muted-foreground bg-muted/20">
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} weight="duotone" /> Registro protegido
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="h-7 px-2"
                >
                  <CaretLeft size={12} weight="bold" />
                </Button>
                <span className="font-medium text-foreground/80">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="h-7 px-2"
                >
                  <CaretRight size={12} weight="bold" />
                </Button>
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
};

export default Auditoria;
