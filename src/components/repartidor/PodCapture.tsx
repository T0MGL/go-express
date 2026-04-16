import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Camera, CheckCircle, ArrowsClockwise, X } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { useCreatePodSignedUrl } from '@/hooks/api/use-repartidor-envios';

interface PodCaptureProps {
  envioId: string;
  onUploaded: (path: string) => void;
  onClear: () => void;
  currentPath: string | null;
}

type Status = 'idle' | 'compressing' | 'uploading' | 'ready' | 'error';

const TARGET_MAX_BYTES = 500 * 1024;

export function PodCapture({ envioId, onUploaded, onClear, currentPath }: PodCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const signedUrlMut = useCreatePodSignedUrl();

  async function handleFile(file: File) {
    setErrorMsg(null);
    setStatus('compressing');

    let uploadFile: File | Blob = file;
    let ext: 'jpg' | 'jpeg' | 'png' | 'webp' = 'webp';

    try {
      if (file.size > TARGET_MAX_BYTES) {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 1600,
          useWebWorker: true,
          fileType: 'image/webp',
        });
        uploadFile = compressed;
      } else if (file.type === 'image/jpeg') {
        ext = 'jpg';
      } else if (file.type === 'image/png') {
        ext = 'png';
      }
    } catch (err) {
      // Compression failed: upload the original if reasonable
      if (file.size > 2 * 1024 * 1024) {
        setStatus('error');
        setErrorMsg('La foto es muy pesada. Probá con otra.');
        return;
      }
      uploadFile = file;
      ext = file.type === 'image/png' ? 'png' : 'jpg';
    }

    setPreview(URL.createObjectURL(uploadFile));
    setStatus('uploading');

    try {
      const { path, token } = await signedUrlMut.mutateAsync({ id: envioId, ext });

      const uploadUrl = await (async () => {
        const { data: bucket } = await import('@/lib/supabase').then((m) =>
          m.supabase.storage.from('pod-entregas').uploadToSignedUrl(path, token, uploadFile),
        );
        return bucket;
      })();

      if (!uploadUrl) {
        throw new Error('upload failed');
      }

      onUploaded(path);
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setErrorMsg('No se pudo subir la foto. Podés reintentar o confirmar la entrega sin foto.');
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    e.target.value = '';
  }

  const hasFoto = !!currentPath || status === 'ready' || (status as Status) === 'uploading';

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleInputChange}
      />

      {!hasFoto ? (
        <Button
          type="button"
          variant="outline"
          className="w-full h-14 text-[14px] gap-2"
          onClick={() => inputRef.current?.click()}
          disabled={status === 'compressing' || status === 'uploading'}
        >
          <Camera size={20} weight="duotone" />
          {status === 'compressing' ? 'Procesando foto...' :
            status === 'uploading' ? 'Subiendo...' :
            'Sacar foto del paquete'}
        </Button>
      ) : (
        <div className="rounded-lg border bg-muted/30 p-3 flex items-center gap-3">
          {preview ? (
            <img src={preview} alt="POD" className="w-14 h-14 rounded object-cover flex-shrink-0" />
          ) : (
            <div className="w-14 h-14 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={24} weight="fill" className="text-emerald-500" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            {(status as Status) === 'uploading' ? (
              <>
                <div className="text-[13px] font-medium">Subiendo foto...</div>
                <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                  <div className="h-full w-1/2 bg-primary animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <div className="text-[13px] font-medium text-emerald-600">Foto lista</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Registrada al enviar</div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setPreview(null); setStatus('idle'); onClear(); }}
            className="p-2 text-muted-foreground hover:text-destructive"
            aria-label="Quitar foto"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-[12px] text-destructive flex items-start gap-2">
          <span className="flex-1">{errorMsg}</span>
          <button
            type="button"
            onClick={() => { setStatus('idle'); setErrorMsg(null); inputRef.current?.click(); }}
            className="inline-flex items-center gap-1 font-semibold"
          >
            <ArrowsClockwise size={12} weight="bold" /> Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
