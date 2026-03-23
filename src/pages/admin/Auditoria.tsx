import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { AuditoriaLog } from '@/data/mockData';
import {
  accionLabels,
  accionColors,
} from '@/data/constants';
import {
  ShieldCheck,
  MagnifyingGlass,
  DownloadSimple,
  Info,
  UserCircle,
  Clock,
} from '@phosphor-icons/react';
import { cn, formatDate } from '@/lib/utils';
import { useAuditoria } from '@/hooks/api/use-auditoria';
import { useUsuarios } from '@/hooks/api/use-usuarios';

const entidadLabels: Record<string, string> = {
  envio: 'Envio',
  cliente: 'Cliente',
  repartidor: 'Repartidor',
  pago: 'Pago',
  nota_interna: 'Nota Interna',
  tarifa: 'Tarifa',
  usuario: 'Usuario',
  almacen: 'Almacen',
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

const Auditoria = () => {
  const [busqueda, setBusqueda] = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('todos');
  const [filtroAccion, setFiltroAccion] = useState('todos');
  const [filtroEntidad, setFiltroEntidad] = useState('todos');
  const [filtroFecha, setFiltroFecha] = useState('');


  // API hooks
  const apiFilters: Record<string, string | undefined> = {};
  if (filtroUsuario !== 'todos') apiFilters.usuarioId = filtroUsuario;
  if (filtroAccion !== 'todos') apiFilters.accion = filtroAccion;
  if (filtroEntidad !== 'todos') apiFilters.entidad = filtroEntidad;
  if (filtroFecha) apiFilters.fecha = filtroFecha;
  if (busqueda) apiFilters.busqueda = busqueda;

  const { data: apiAuditoria, isLoading } = useAuditoria(apiFilters);
  const { data: apiUsuarios } = useUsuarios();

  const logs = (apiAuditoria?.data ?? []) as unknown as AuditoriaLog[];
  const logsFiltrados = (apiAuditoria?.data ?? []) as unknown as AuditoriaLog[];
  const totalCount = apiAuditoria?.pagination?.total ?? logs.length;

  const exportarCSV = () => {
    const headers = ['Fecha', 'Hora', 'Usuario', 'Accion', 'Entidad', 'ID Entidad', 'Descripcion', 'Valor Anterior', 'Valor Nuevo'];
    const rows = logsFiltrados.map((l) => [
      l.fecha, l.hora, l.usuario,
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
            Log de Auditoria
          </h1>
          <p className="page-header-subtitle">
            {logsFiltrados.length} de {totalCount} registros · Registro inmutable de todas las acciones del sistema
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
          <strong className="text-foreground">Registro inmutable:</strong> El log de auditoria no puede ser editado ni eliminado.
          Cada accion queda registrada con usuario, fecha, hora y detalle completo para garantizar la trazabilidad total del sistema.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <MagnifyingGlass size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar en descripcion o ID..."
            className="pl-9"
          />
        </div>
        <Select value={filtroUsuario} onValueChange={setFiltroUsuario}>
          <SelectTrigger className="w-40">
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
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Accion" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las acciones</SelectItem>
            {accionesUnicas.map((a) => (
              <SelectItem key={a} value={a}>{accionLabels[a]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroEntidad} onValueChange={setFiltroEntidad}>
          <SelectTrigger className="w-36">
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
          className="w-40"
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
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
        <>
        <div className="overflow-x-auto">
          <table className="premium-table w-full">
            <thead>
              <tr>
                <th className="whitespace-nowrap w-[1%]">
                  <div className="flex items-center gap-1.5"><Clock size={12} weight="duotone" /> Fecha / Hora</div>
                </th>
                <th className="whitespace-nowrap w-[1%]">
                  <div className="flex items-center gap-1.5"><UserCircle size={12} weight="duotone" /> Usuario</div>
                </th>
                <th className="w-[1%]">Accion</th>
                <th className="w-[1%]">Entidad</th>
                <th>Descripcion</th>
                <th className="whitespace-nowrap w-[1%]">Cambios</th>
              </tr>
            </thead>
            <tbody>
              {logsFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-[13px]">
                    No se encontraron registros con los filtros aplicados
                  </td>
                </tr>
              )}
              {logsFiltrados.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap align-top">
                    <p className="font-medium text-[12px] leading-snug">{formatDate(log.fecha)}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{log.hora}</p>
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
                    <p className="text-[11px] text-muted-foreground mt-1 font-data">{log.entidadId}</p>
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
                            <span className="text-muted-foreground shrink-0 w-[46px] text-right">Despues:</span>
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
          <div className="border-t px-4 py-2.5 flex items-center justify-between text-[11px] text-muted-foreground bg-muted/20">
            <span>{logsFiltrados.length} registros mostrados</span>
            <span className="flex items-center gap-1">
              <ShieldCheck size={12} weight="duotone" /> Registro protegido · Solo lectura
            </span>
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
};

export default Auditoria;
