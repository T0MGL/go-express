import { Code, FileArrowDown } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';

const ClienteApi = () => (
  <div className="space-y-5">
    <div className="page-header">
      <div>
        <h1 className="page-header-title">API para desarrolladores</h1>
        <p className="page-header-subtitle">Conectá tu sistema con GO EXPRESS y creá envíos sin cargar nada a mano</p>
      </div>
    </div>

    <div className="surface-card p-5 max-w-2xl">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Code size={20} weight="duotone" className="text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold">Guía del integrador, versión 1</h3>
          <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
            El API público permite crear envíos, consultar estados, cotizar rutas y recibir webhooks desde tu propio sistema.
            La guía lleva a tu equipo técnico de cero al primer envío en menos de 5 minutos, con modo de prueba incluido.
          </p>
          <Button asChild size="sm" className="mt-4">
            <a href="/docs/go-express-api-v1.pdf" download>
              <FileArrowDown size={16} weight="duotone" className="mr-1.5" />
              Descargar guía (PDF)
            </a>
          </Button>
        </div>
      </div>
    </div>
  </div>
);

export default ClienteApi;
