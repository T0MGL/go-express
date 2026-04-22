import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Star } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { Ciudad } from '@/hooks/api/use-ciudades';
import { useCiudades, useCiudadesCliente } from '@/hooks/api/use-ciudades';

export interface CiudadPickerProps {
  value: string | undefined;
  onChange: (ciudadId: string, ciudad: Ciudad) => void;
  /**
   * Si es true, todas las ciudades son seleccionables, incluso las que no tienen
   * cobertura. Solo para el modal de Tarifas: es el unico lugar donde puede crear
   * la primera tarifa de una ciudad y "habilitarla".
   */
  allowDisabled?: boolean;
  source?: 'admin' | 'cliente';
  placeholder?: string;
  label?: string;
  labelHint?: string;
  id?: string;
  disabled?: boolean;
  error?: string;
  className?: string;
}

export function CiudadPicker({
  value,
  onChange,
  allowDisabled = false,
  source = 'admin',
  placeholder = 'Seleccionar ciudad',
  label,
  labelHint,
  id,
  disabled,
  error,
  className,
}: CiudadPickerProps) {
  const adminQuery = useCiudades();
  const clienteQuery = useCiudadesCliente();
  const query = source === 'cliente' ? clienteQuery : adminQuery;
  const { data: ciudades, isLoading } = query;

  const grupos = useMemo(() => {
    if (!ciudades) return [];
    const map = new Map<string, { nombre: string; items: Ciudad[] }>();
    for (const c of ciudades) {
      const key = c.departamentoId;
      const g = map.get(key) ?? { nombre: c.departamentoNombre, items: [] };
      g.items.push(c);
      map.set(key, g);
    }
    return Array.from(map.values()).map((g) => ({
      ...g,
      items: g.items.slice().sort((a, b) => a.orden - b.orden),
    }));
  }, [ciudades]);

  const ciudadById = useMemo(() => {
    const m = new Map<string, Ciudad>();
    if (ciudades) {
      for (const c of ciudades) m.set(c.id, c);
    }
    return m;
  }, [ciudades]);

  const handleChange = (id: string) => {
    const ciudad = ciudadById.get(id);
    if (ciudad) onChange(id, ciudad);
  };

  if (isLoading) {
    return (
      <div className={cn('space-y-1.5', className)}>
        {label && <Label className="text-[12px]">{label}</Label>}
        <div className="h-10 w-full rounded-md bg-muted/40 animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={id} className="text-[12px] flex items-center gap-2">
          {label}
          {labelHint && <span className="text-[11px] text-muted-foreground font-normal">{labelHint}</span>}
        </Label>
      )}
      <Select value={value ?? ''} onValueChange={handleChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className={cn('w-full', error && 'border-destructive focus:ring-destructive')}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[360px]">
          {grupos.map((g) => (
            <SelectGroup key={g.nombre}>
              <SelectLabel className="pl-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {g.nombre}
              </SelectLabel>
              {g.items.map((c) => {
                const isDisabled = !allowDisabled && !c.habilitada;
                return (
                  <SelectItem
                    key={c.id}
                    value={c.id}
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    title={isDisabled ? 'Sin cobertura en esta ciudad' : undefined}
                  >
                    <span className="flex items-center justify-between gap-3 w-full">
                      <span className="flex items-center gap-1.5">
                        {c.esCapital && (
                          <Star size={11} weight="duotone" className="text-primary/70" aria-hidden />
                        )}
                        <span>{c.nombre}</span>
                      </span>
                      {!c.habilitada && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          sin cobertura
                        </span>
                      )}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-[12px] text-destructive">{error}</p>}
    </div>
  );
}
