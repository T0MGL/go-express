import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { estadoLabels, estadoColors, estadosPagoColors } from '@/data/constants';
import { Plus, Download, ArrowUpRight } from 'lucide-react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { exportToCSV } from '@/lib/exportCSV';
import { formatDate } from '@/lib/utils';
import { toast } from 'sonner';
import type { Envio } from '@/data/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEnvios } from '@/hooks/api/use-envios';
import { useRepartidores } from '@/hooks/api/use-repartidores';

const EnviosList = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('todos');
  const [filterRepartidor, setFilterRepartidor] = useState<string>('todos');

  const apiFilters: Record<string, string | undefined> = {};
  if (filterEstado !== 'todos') apiFilters.estado = filterEstado;
  if (searchTerm) apiFilters.search = searchTerm;
  if (filterRepartidor !== 'todos') apiFilters.repartidorId = filterRepartidor === 'sin_asignar' ? 'sin_asignar' : filterRepartidor;

  const { data: apiEnvios, isLoading: loadingEnvios } = useEnvios(apiFilters);
  const { data: apiRepartidores } = useRepartidores();

  const repartidores = apiRepartidores?.data ?? [];

  const filteredEnvios = apiEnvios?.data ?? [];

  const totalCount = apiEnvios?.pagination?.total ?? filteredEnvios.length;

  const getInitials = (nombre: string) => {
    return nombre
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const getRepartidorNombre = (repartidorId: string | undefined) => {
    if (!repartidorId) return '';
    const rep = repartidores.find(r => r.id === repartidorId);
    return rep?.nombre ?? '';
  };

  const handleExportCSV = () => {
    const columns = [
      { label: 'Tracking', accessor: (e: Envio) => e.trackingNumber },
      { label: 'Cliente', accessor: (e: Envio) => e.clienteNombre },
      { label: 'Origen', accessor: (e: Envio) => e.origen },
      { label: 'Destino', accessor: (e: Envio) => e.destino },
      { label: 'Estado', accessor: (e: Envio) => estadoLabels[e.estado] },
      { label: 'Estado Pago', accessor: (e: Envio) => e.pago?.estadoPago || 'pendiente' },
      { label: 'Costo', accessor: (e: Envio) => e.costo },
      { label: 'Fecha', accessor: (e: Envio) => e.fecha },
    ];

    exportToCSV(filteredEnvios, 'envios', columns);
    toast.success('Exportando envios a CSV...');
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="page-header-title">Envios</h1>
            <p className="page-header-subtitle">Gestion y seguimiento de todos los envios</p>
          </div>
          <div className="flex gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  Exportar
                </Button>
              </TooltipTrigger>
              <TooltipContent>Descargar listado en CSV</TooltipContent>
            </Tooltip>
            <Link to="/admin/envios/nuevo">
              <Button size="sm" className="gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                Nuevo Envio
              </Button>
            </Link>
          </div>
        </div>

        <div className="surface-card">
          <div className="p-4 border-b border-border/40">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <MagnifyingGlass size={15} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                <Input
                  placeholder="Buscar por tracking o cliente..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="en_transito">En Transito</SelectItem>
                  <SelectItem value="entregado">Entregado</SelectItem>
                  <SelectItem value="problema">Con Problema</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterRepartidor} onValueChange={setFilterRepartidor}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Repartidor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="sin_asignar">Sin asignar</SelectItem>
                  {repartidores.filter(r => r.estado === 'activo').map(rep => (
                    <SelectItem key={rep.id} value={rep.id}>{rep.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loadingEnvios ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th className="pl-4">Tracking #</th>
                      <th>Cliente</th>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Estado</th>
                      <th>Repartidor</th>
                      <th>Pago</th>
                      <th>Fecha</th>
                      <th className="text-right pr-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEnvios.map((envio) => (
                      <tr key={envio.id} className="group">
                        <td className="pl-4">
                          <Link
                            to={`/admin/envios/${envio.id}`}
                            className="font-data font-medium text-primary hover:text-primary/80 transition-colors"
                          >
                            {envio.trackingNumber}
                          </Link>
                        </td>
                        <td className="text-[13px]">{envio.clienteNombre}</td>
                        <td className="text-[13px] text-muted-foreground">{envio.origen}</td>
                        <td className="text-[13px] text-muted-foreground">{envio.destino}</td>
                        <td>
                          <Badge variant={estadoColors[envio.estado]}>
                            {estadoLabels[envio.estado]}
                          </Badge>
                        </td>
                        <td>
                          {envio.repartidorId ? (
                            <div className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                <AvatarFallback className="text-[9px] bg-muted">
                                  {getInitials(getRepartidorNombre(envio.repartidorId))}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-[13px]">
                                {getRepartidorNombre(envio.repartidorId)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[12px] text-muted-foreground/60">Sin asignar</span>
                          )}
                        </td>
                        <td>
                          <Badge
                            variant={estadosPagoColors[envio.pago?.estadoPago || 'pendiente']}
                          >
                            {envio.pago?.estadoPago === 'pagado' ? 'Pagado'
                              : envio.pago?.estadoPago === 'pago_parcial' ? 'Parcial'
                              : 'Pendiente'}
                          </Badge>
                        </td>
                        <td className="text-[13px] text-muted-foreground">{formatDate(envio.fecha)}</td>
                        <td className="text-right pr-4">
                          <Link to={`/admin/envios/${envio.id}`}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" aria-label="Ver detalle del envio">
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredEnvios.length > 0 && (
                <div className="px-4 py-3 border-t border-border/40">
                  <p className="text-[12px] text-muted-foreground">
                    Mostrando {filteredEnvios.length} de {totalCount} envios
                  </p>
                </div>
              )}

              {filteredEnvios.length === 0 && (
                <div className="text-center py-16 px-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                    <MagnifyingGlass size={18} weight="duotone" className="text-muted-foreground/50" />
                  </div>
                  <p className="text-[13px] font-medium text-foreground">No se encontraron envios</p>
                  <p className="text-[12px] text-muted-foreground mt-1">
                    Intenta ajustar los filtros de busqueda
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};

export default EnviosList;
