import * as React from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  clearLabel?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder, className, inputClassName, clearLabel = 'Limpiar busqueda', ...props }, ref) => {
    const hasValue = value.length > 0;

    const handleClear = () => {
      onChange('');
    };

    return (
      <div className={cn('relative', className)}>
        <MagnifyingGlass
          size={15}
          weight="bold"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none"
        />
        <Input
          ref={ref}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn('pl-9', hasValue && 'pr-9', inputClassName)}
          {...props}
        />
        <button
          type="button"
          onClick={handleClear}
          aria-label={clearLabel}
          tabIndex={hasValue ? 0 : -1}
          className={cn(
            'absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/60 transition-all duration-200',
            'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
            hasValue ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-90 pointer-events-none',
          )}
        >
          <X size={13} weight="bold" />
        </button>
      </div>
    );
  },
);

SearchInput.displayName = 'SearchInput';
