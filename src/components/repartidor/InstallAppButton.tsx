import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { DownloadSimple, Share, Plus, House, DotsThreeVertical } from '@phosphor-icons/react';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { useIsStandalone } from '@/hooks/use-is-standalone';
import { toast } from 'sonner';

export function InstallAppButton() {
  const isStandalone = useIsStandalone();
  const { canInstall, isIos, platform, promptInstall } = useInstallPrompt();
  const [sheetOpen, setSheetOpen] = useState(false);

  if (isStandalone) return null;

  const isAndroid = platform === 'android';
  if (!isIos && !isAndroid && !canInstall) return null;

  async function handleNativeInstall() {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      toast.success('App instalada');
      setSheetOpen(false);
    } else if (outcome === 'unavailable') {
      toast.error('Tu navegador no permite instalar. Seguí los pasos manuales.');
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full h-11 gap-2 mt-3"
        onClick={() => setSheetOpen(true)}
      >
        <DownloadSimple size={16} weight="bold" />
        Instalar como app
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh]">
          <SheetHeader className="text-left">
            <SheetTitle>{isIos ? 'Instalar en iPhone' : 'Instalar en Android'}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {isIos ? (
              <>
                <Step
                  n={1}
                  title="Tocá el botón Compartir"
                  body="Está en la barra inferior del navegador."
                  icon={<Share size={18} weight="bold" className="text-primary" />}
                />
                <Step
                  n={2}
                  title="Elegí 'Agregar a pantalla de inicio'"
                  body="Deslizá hacia abajo si no lo ves."
                  icon={<Plus size={18} weight="bold" className="text-primary" />}
                />
                <Step
                  n={3}
                  title="Tocá 'Agregar'"
                  body="Va a aparecer el ícono de GO EXPRESS en tu pantalla."
                  icon={<House size={18} weight="bold" className="text-primary" />}
                />
                <Button className="w-full h-11 mt-2" onClick={() => setSheetOpen(false)}>
                  Listo
                </Button>
              </>
            ) : (
              <>
                {canInstall ? (
                  <>
                    <p className="text-[13px] text-muted-foreground">
                      Vas a instalar GO EXPRESS en tu pantalla principal. Se abre como una app, sin barra del navegador.
                    </p>
                    <Button className="w-full h-11" onClick={handleNativeInstall}>
                      <DownloadSimple size={16} weight="bold" className="mr-2" />
                      Instalar ahora
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">
                      ¿No funcionó? Usá los pasos manuales abajo.
                    </p>
                  </>
                ) : null}
                <Step
                  n={1}
                  title="Tocá el menú"
                  body="Los tres puntos arriba a la derecha del navegador."
                  icon={<DotsThreeVertical size={18} weight="bold" className="text-primary" />}
                />
                <Step
                  n={2}
                  title="Elegí 'Instalar app'"
                  body="También puede aparecer como 'Agregar a pantalla principal'."
                  icon={<DownloadSimple size={18} weight="bold" className="text-primary" />}
                />
                <Step
                  n={3}
                  title="Confirmá 'Instalar'"
                  body="Va a aparecer el ícono de GO EXPRESS en tu pantalla."
                  icon={<House size={18} weight="bold" className="text-primary" />}
                />
                {!canInstall && (
                  <Button variant="outline" className="w-full h-11 mt-2" onClick={() => setSheetOpen(false)}>
                    Listo
                  </Button>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Step({ n, title, body, icon }: { n: number; title: string; body: string; icon: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-[13px] text-primary">
        {n}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          {icon}
          {title}
        </div>
        <p className="text-[12px] text-muted-foreground mt-0.5">{body}</p>
      </div>
    </div>
  );
}
