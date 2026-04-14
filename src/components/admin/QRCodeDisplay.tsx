import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { QrCode, DownloadSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';

interface QRCodeDisplayProps {
  value: string;
  size?: number;
  label?: string;
  showDownload?: boolean;
}

export function QRCodeDisplay({
  value,
  size = 200,
  label,
  showDownload = true
}: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      },
      (err) => {
        if (err) {
          setError(true);
        }
      }
    );
  }, [value, size]);

  const handleDownload = () => {
    if (!canvasRef.current) return;

    canvasRef.current.toBlob((blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `qr-${value}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Código QR descargado');
    });
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-4 border border-destructive/20 rounded-lg bg-destructive/5">
        <QrCode size={24} weight="duotone" className="text-destructive mb-2" />
        <p className="text-[12px] text-destructive">Error generando código QR</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {label && (
        <p className="text-[12px] font-medium text-foreground">{label}</p>
      )}
      <div className="surface-card p-3">
        <canvas ref={canvasRef} />
      </div>
      {value && (
        <p className="text-[11px] text-muted-foreground font-data">{value}</p>
      )}
      {showDownload && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownload}
        >
          <DownloadSimple size={14} weight="duotone" className="mr-1.5" />
          Descargar QR
        </Button>
      )}
    </div>
  );
}
