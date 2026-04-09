import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, PlusCircle, X, CircleNotch } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useTags, useCreateTag, useDeleteTag, type TagData } from '@/hooks/api/use-tags';



function colorToBadgeVariant(hex: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = hex.toLowerCase();
  if (lower.includes('ef4444') || lower.includes('dc2626')) return 'destructive';
  if (lower.includes('0643f7') || lower.includes('3b82f6')) return 'default';
  return 'secondary';
}

const ClienteEtiquetas = () => {
  const [newTag, setNewTag] = useState('');

  const { data: apiTags, isLoading } = useTags();
  const createTagMutation = useCreateTag();
  const deleteTagMutation = useDeleteTag();

  const tags: TagData[] = apiTags?.data ?? [];

  const addTag = () => {
    const nombre = newTag.trim();
    if (!nombre) {
      toast.error('Escribe un nombre para la etiqueta');
      return;
    }
    if (tags.find((t) => t.nombre.toLowerCase() === nombre.toLowerCase())) {
      toast.error(`Ya existe una etiqueta llamada "${nombre}"`);
      return;
    }

    createTagMutation.mutate(
      { nombre, color: '#6B7280' },
      {
        onSuccess: () => {
          setNewTag('');
          toast.success(`Etiqueta "${nombre}" creada`);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Error al crear la etiqueta';
          toast.error(msg);
        },
      }
    );
  };

  const removeTag = (tag: TagData) => {
    deleteTagMutation.mutate(tag.id, {
      onSuccess: () => {
        toast.info(`Etiqueta "${tag.nombre}" eliminada`);
      },
      onError: () => {
        toast.error('Error al eliminar la etiqueta');
      },
    });
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Etiquetas</h1>
          <p className="page-header-subtitle">Gestiona las etiquetas para organizar tus paquetes</p>
        </div>
      </div>

      <div className="surface-card p-5">
        <h3 className="text-[13px] font-semibold mb-4 flex items-center gap-2">
          <Tag size={16} weight="duotone" className="text-primary" />
          Crear nueva etiqueta
        </h3>
        <div className="flex gap-2">
          <Input
            placeholder="Nombre de la etiqueta..."
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          />
          <Button type="button" onClick={addTag} size="sm" className="gap-1.5" disabled={createTagMutation.isPending || !newTag.trim()}>
            {createTagMutation.isPending ? (
              <CircleNotch size={14} weight="bold" className="animate-spin" />
            ) : (
              <PlusCircle size={14} weight="duotone" />
            )}
            Crear
          </Button>
        </div>
      </div>

      <div className="surface-card p-5">
        <p className="section-label mb-4">Mis Etiquetas</p>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <CircleNotch size={20} weight="bold" className="animate-spin text-muted-foreground" />
          </div>
        ) : tags.length === 0 ? (
          <div className="text-center py-10">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <Tag size={18} weight="duotone" className="text-muted-foreground/50" />
            </div>
            <p className="text-[13px] font-medium">No tienes etiquetas creadas aun</p>
            <p className="text-[12px] text-muted-foreground mt-1">Crea tu primera etiqueta para organizar tus paquetes</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tags.map((tag) => (
              <div key={tag.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:border-border transition-colors">
                <div className="flex items-center gap-2">
                  <Badge variant={colorToBadgeVariant(tag.color)}>{tag.nombre}</Badge>
                  <span className="text-[11px] text-muted-foreground font-data">{tag.envioCount} paquetes</span>
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeTag(tag)} aria-label={`Eliminar etiqueta ${tag.nombre}`}>
                  <X size={12} weight="bold" className="text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClienteEtiquetas;
