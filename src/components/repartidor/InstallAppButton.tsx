import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { DownloadSimple, Share, Plus, House } from '@phosphor-icons/react';
import { useInstallPrompt } from '@/hooks/use-install-prompt';
import { useIsStandalone } from '@/hooks/use-is-standalone';
import { toast } from 'sonner';

export function InstallAppButton() {
  const isStandalone = useIsStandalone();
  const { canInstall, isIos, promptInstall } = useInstallPrompt();
  const [iosSheetOpen, setIosSheetOpen] = useState(false);

  if (isStandalone) return null;

  const available = canInstall || isIos;
  if (!available) return null;

  async function handleAndroidInstall() {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      toast.success('App instalada');
    } else if (outcome === 'unavailable') {
      toast.error('Tu navegador no permite instalar. Usá Chrome o abrí desde el menú compartir.');
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full h-11 gap-2 mt-3"
        onClick={() => (isIos ? setIosSheetOpen(true) : handleAndroidInstall())}
      >
        <DownloadSimple size={16} weight="bold" />
        Instalar como app
      </Button>

      <Sheet open={iosSheetOpen} onOpenChange={setIosSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85vh]">
          <SheetHeader className="text-left">
            <SheetTitle>Instalar en iPhone</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 py-4">
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
            <Button className="w-full h-11 mt-2" onClick={() => setIosSheetOpen(false)}>
              Listo
            </Button>
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
