import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tag, PlusCircle, X, CircleNotch } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useTags, useCreateTag, useDeleteTag, type TagData } from '@/hooks/api/use-tags';

const defaultTags: TagData[] = [
  { id: 'mock-1', clienteId: 'cli1', nombre: 'Fragil', color: '#EF4444', envioCount: 5, creadoEn: '2026-02-10' },
  { id: 'mock-2', clienteId: 'cli1', nombre: 'Urgente', color: '#0643F7', envioCount: 3, creadoEn: '2026-02-10' },
  { id: 'mock-3', clienteId: 'cli1', nombre: 'Documentos', color: '#6B7280', envioCount: 8, creadoEn: '2026-02-10' },
  { id: 'mock-4', clienteId: 'cli1', nombre: 'Electronicos', color: '#8B5CF6', envioCount: 4, creadoEn: '2026-02-10' },
  { id: 'mock-5', clienteId: 'cli1', nombre: 'Ropa', color: '#10B981', envioCount: 12, creadoEn: '2026-02-10' },
  { id: 'mock-6', clienteId: 'cli1', nombre: 'Alimentos', color: '#F59E0B', envioCount: 2, creadoEn: '2026-02-10' },
];

// Map hex color to a badge variant for display
function colorToBadgeVariant(hex: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = hex.toLowerCase();
  if (lower.includes('ef4444') || lower.includes('dc2626')) return 'destructive';
  if (lower.includes('0643f7') || lower.includes('3b82f6')) return 'default';
  return 'secondary';
}

const ClienteEtiquetas = () => {
  const [localTags, setLocalTags] = useState(defaultTags);
  const [newTag, setNewTag] = useState('');

  // API hooks
  const { data: apiTags, isLoading } = useTags();
  const createTagMutation = useCreateTag();
  const deleteTagMutation = useDeleteTag();

  const tags: TagData[] = false ? localTags : (apiTags?.data ?? localTags);

  const addTag = () => {
    const nombre = newTag.trim();
    if (!nombre || tags.find((t) => t.nombre.toLowerCase() === nombre.toLowerCase())) return;

    if (false) {
      setLocalTags((prev) => [...prev, {
        id: `mock-${Date.now()}`,
        clienteId: 'cli1',
        nombre,
        color: '#6B7280',
        envioCount: 0,
        creadoEn: new Date().toISOString(),
      }]);
      setNewTag('');
      toast.success(`Etiqueta "${nombre}" creada`);
      return;
    }

    createTagMutation.mutate(
      { nombre, color: '#6B7280' },
      {
        onSuccess: () => {
          setNewTag('');
          toast.success(`Etiqueta "${nombre}" creada`);
        },
        onError: () => {
          toast.error('Error al crear la etiqueta');
        },
      }
    );
  };

  const removeTag = (tag: TagData) => {
    if (false) {
      setLocalTags((prev) => prev.filter((t) => t.id !== tag.id));
      toast.info(`Etiqueta "${tag.nombre}" eliminada`);
      return;
    }

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
          <Button onClick={addTag} size="sm" className="gap-1.5" disabled={createTagMutation.isPending}>
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

        {isLoading && !false ? (
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
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeTag(tag)}>
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
