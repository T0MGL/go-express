import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, X, Scan } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose?: () => void;
  className?: string;
}

export function BarcodeScanner({ onScan, onClose, className }: BarcodeScannerProps) {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerId = 'barcode-scanner-reader';

  useEffect(() => {
    if (!isScanning) return;

    scannerRef.current = new Html5QrcodeScanner(
      scannerId,
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        supportedScanTypes: [
          Html5QrcodeScanType.SCAN_TYPE_CAMERA,
        ],
        rememberLastUsedCamera: true,
      },
      false
    );

    scannerRef.current.render(
      (decodedText) => {
        onScan(decodedText);
        handleClose();
      },
      () => {
        // Error callback - scanner fires this on every non-decoded frame, safe to ignore
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [isScanning, onScan]);

  const handleClose = () => {
    setIsScanning(false);
    if (scannerRef.current) {
      scannerRef.current.clear().catch(() => {});
    }
    onClose?.();
  };

  if (!isScanning) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsScanning(true)}
        className={className}
      >
        <Camera size={14} weight="duotone" className="mr-1.5" />
        Escanear Codigo
      </Button>
    );
  }

  return (
    <Card className={cn("relative", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <Scan size={16} weight="duotone" className="text-primary animate-pulse" />
            Escaneando...
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClose}
          >
            <X size={14} weight="duotone" />
          </Button>
        </div>
        <div id={scannerId} className="w-full" />
        <p className="text-[11px] text-muted-foreground mt-2 text-center">
          Apunta la camara al codigo QR o codigo de barras
        </p>
      </CardContent>
    </Card>
  );
}
