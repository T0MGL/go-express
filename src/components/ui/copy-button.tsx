import { useState } from 'react';
import { Copy, CheckCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface CopyButtonProps {
  value: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
}

export function CopyButton({ value, label, className, children }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label || 'Tracking'} copiado`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('No se pudo copiar');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'group/copy inline-flex items-center gap-1.5 transition-colors',
        className,
      )}
      title="Click para copiar"
    >
      {children}
      <span className="opacity-0 group-hover/copy:opacity-100 transition-opacity">
        {copied ? (
          <CheckCircle size={12} weight="fill" className="text-success" />
        ) : (
          <Copy size={12} weight="duotone" className="text-muted-foreground" />
        )}
      </span>
    </button>
  );
}
