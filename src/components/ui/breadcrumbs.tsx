import { Link, useLocation } from 'react-router-dom';
import { CaretRight, House } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const routeLabels: Record<string, string> = {
  admin: 'Admin',
  cliente: 'Portal',
  envios: 'Envios',
  nuevo: 'Nuevo',
  warehouse: 'Warehouse',
  clientes: 'Clientes',
  repartidores: 'Repartidores',
  pagos: 'Pagos',
  tarifas: 'Tarifas',
  auditoria: 'Auditoria',
  configuracion: 'Configuracion',
  importar: 'Importar',
  cotizar: 'Cotizador',
  etiquetas: 'Etiquetas',
  cuenta: 'Mi Cuenta',
  productos: 'Productos',
};

interface BreadcrumbsProps {
  className?: string;
}

export function Breadcrumbs({ className }: BreadcrumbsProps) {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length <= 1) return null;

  const crumbs = segments.map((segment, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    const isLast = i === segments.length - 1;
    const label = routeLabels[segment] || segment;

    return { path, label, isLast, isId: segment.startsWith('env') && !routeLabels[segment] };
  });

  return (
    <nav className={cn('flex items-center gap-1 text-[12px] text-muted-foreground mb-4', className)}>
      <Link to={`/${segments[0]}`} className="hover:text-foreground transition-colors">
        <House size={13} weight="duotone" />
      </Link>
      {crumbs.slice(1).map((crumb) => (
        <span key={crumb.path} className="flex items-center gap-1">
          <CaretRight size={10} weight="bold" className="text-muted-foreground/40" />
          {crumb.isLast ? (
            <span className="text-foreground font-medium">
              {crumb.isId ? crumb.label.toUpperCase() : crumb.label}
            </span>
          ) : (
            <Link to={crumb.path} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
