import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Warning, CircleNotch } from '@phosphor-icons/react';

interface ProblemaModalProps {
  isOpen: boolean;
  onClose: () => void;
  envioId: string;
  onProblemRegistered: (descripcion: string) => void;
}

export const ProblemaModal = ({ isOpen, onClose, envioId: _envioId, onProblemRegistered }: ProblemaModalProps) => {
  const [descripcion, setDescripcion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descripcion.trim()) {
      toast({
        title: 'Error',
        description: 'Debe describir el problema',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    onProblemRegistered(descripcion.trim());
    setDescripcion('');
    setSubmitting(false);
  };

  const handleClose = () => {
    if (!submitting) {
      setDescripcion('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Warning size={18} weight="duotone" className="text-amber-500" />
            <DialogTitle className="text-[15px]">Registrar Problema/Incidencia</DialogTitle>
          </div>
          <DialogDescription className="text-[12px]">
            Describe el problema encontrado con este envio
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label className="text-[12px]" htmlFor="problema-descripcion">Descripcion del problema *</Label>
              <Textarea
                id="problema-descripcion"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Ej: Direccion incorrecta, destinatario no disponible, paquete danado..."
                rows={5}
                className="mt-1 text-[13px]"
                aria-required="true"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Se especifico para facilitar la resolucion
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" size="sm" onClick={handleClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={submitting || !descripcion.trim()}>
              {submitting && <CircleNotch size={14} weight="bold" className="animate-spin mr-1.5" />}
              Registrar Problema
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
