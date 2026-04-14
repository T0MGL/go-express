import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NotaInterna } from '@/data/types';
import { formatTimestamp, formatTimestampTime } from '@/lib/utils';
import { ChatCircle, Clock, UserCircle } from '@phosphor-icons/react';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface NotasInternasProps {
  envioId: string;
  notas: NotaInterna[];
  onNotaAdded: (texto: string) => void;
}

export const NotasInternas = ({ envioId: _envioId, notas, onNotaAdded }: NotasInternasProps) => {
  const [nuevoTexto, setNuevoTexto] = useState('');
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nuevoTexto.trim()) {
      toast({
        title: 'Error',
        description: 'Escribe una nota antes de guardar',
        variant: 'destructive',
      });
      return;
    }
    onNotaAdded(nuevoTexto);
    setNuevoTexto('');
  };

  return (
    <div className="surface-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <ChatCircle size={16} weight="duotone" className="text-primary" />
        <h3 className="section-label">Notas Internas</h3>
      </div>

      {/* Lista de notas existentes */}
      <div className="space-y-3 mb-6">
        {notas && notas.length > 0 ? (
          notas.map((nota) => (
            <div key={nota.id} className="border-l-2 border-primary pl-4 py-2">
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <UserCircle size={14} weight="duotone" className="text-muted-foreground" />
                  <p className="text-[13px] font-medium">{nota.usuario}</p>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock size={11} weight="duotone" />
                  <p className="text-[11px] font-data">
                    {formatTimestamp(nota.creadoEn)} {formatTimestampTime(nota.creadoEn)}
                  </p>
                </div>
              </div>
              <p className="text-[13px] text-muted-foreground">{nota.texto}</p>
            </div>
          ))
        ) : (
          <p className="text-[12px] text-muted-foreground text-center py-4">
            No hay notas internas registradas
          </p>
        )}
      </div>

      {/* Formulario para nueva nota */}
      <form onSubmit={handleSubmit} className="border-t pt-4">
        <Label className="mb-2 block text-[12px]">Agregar nota nueva</Label>
        <Textarea
          value={nuevoTexto}
          onChange={(e) => setNuevoTexto(e.target.value)}
          placeholder="Escribe una nota interna sobre este envío..."
          rows={3}
          className="mb-3 text-[13px]"
        />
        <Button type="submit" size="sm">
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          Agregar Nota
        </Button>
      </form>
    </div>
  );
};
