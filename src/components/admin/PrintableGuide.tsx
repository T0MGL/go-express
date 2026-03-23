import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Envio } from '@/data/types';
import { formatCurrency } from '@/lib/utils';
import { Package } from '@phosphor-icons/react';

interface PrintableGuideProps {
  envio: Envio;
}

export const PrintableGuide = ({ envio }: PrintableGuideProps) => {
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  useEffect(() => {
    QRCode.toDataURL(`https://goexpress.com.py/track?id=${envio.trackingNumber}`)
      .then((url) => setQrCodeUrl(url))
      .catch(() => {});
  }, [envio.trackingNumber]);

  return (
    <div className="print:block hidden">
      <div className="p-8 bg-white text-black" style={{ width: '210mm', minHeight: '297mm' }}>
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-black pb-4 mb-6">
          <div className="flex items-center gap-3">
            <Package size={32} weight="duotone" />
            <div>
              <h1 className="text-2xl font-bold">GO EXPRESS</h1>
              <p className="text-sm">Envios rapidos y seguros</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs">Fecha: {new Date().toLocaleDateString('es-PY')}</p>
          </div>
        </div>

        {/* Tracking Number Grande */}
        <div className="text-center mb-6">
          <p className="text-sm text-gray-600 mb-1">Numero de Seguimiento</p>
          <p className="text-4xl font-bold tracking-wide font-data">{envio.trackingNumber}</p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-6">
          {qrCodeUrl && <img src={qrCodeUrl} alt="QR Code" className="w-32 h-32" />}
        </div>

        {/* Informacion en 2 columnas */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          {/* Origen */}
          <div className="border-2 border-black p-4">
            <h3 className="text-lg font-bold mb-3 border-b border-gray-300 pb-2">ORIGEN</h3>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-600">Remitente</p>
                <p className="font-semibold">{envio.clienteNombre}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Ciudad</p>
                <p className="font-semibold text-lg">{envio.origen}</p>
              </div>
            </div>
          </div>

          {/* Destino */}
          <div className="border-2 border-black p-4 bg-yellow-50">
            <h3 className="text-lg font-bold mb-3 border-b border-gray-300 pb-2">DESTINO</h3>
            <div className="space-y-2">
              <div>
                <p className="text-xs text-gray-600">Destinatario</p>
                <p className="font-semibold">{envio.destinatarioNombre}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Direccion</p>
                <p className="font-medium">{envio.destinatarioDireccion}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Telefono</p>
                <p className="font-medium font-data">{envio.destinatarioTelefono}</p>
              </div>
              <div>
                <p className="text-xs text-gray-600">Ciudad</p>
                <p className="font-semibold text-lg">{envio.destino}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Detalles del Paquete */}
        <div className="border border-gray-300 p-4 mb-6">
          <h3 className="font-bold mb-3">DETALLES DEL PAQUETE</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-600">Peso</p>
              <p className="font-semibold font-data">{envio.peso} kg</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Dimensiones</p>
              <p className="font-semibold font-data">
                {envio.dimensiones.largo}x{envio.dimensiones.ancho}x{envio.dimensiones.alto} cm
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Tipo de Pago</p>
              <p className="font-semibold">{envio.tipoPago}</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Costo</p>
              <p className="font-semibold text-lg font-data">{formatCurrency(envio.costo)}</p>
            </div>
          </div>
        </div>

        {/* Notas */}
        {envio.notas && (
          <div className="border border-gray-300 p-4 mb-6">
            <h3 className="font-bold mb-2">NOTAS ESPECIALES</h3>
            <p className="text-sm">{envio.notas}</p>
          </div>
        )}

        {/* Firma */}
        <div className="border-t-2 border-black pt-4 mt-12">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-sm mb-8">Recibido por:</p>
              <div className="border-t border-gray-400 pt-1">
                <p className="text-xs text-gray-600">Firma del destinatario</p>
              </div>
            </div>
            <div>
              <p className="text-sm mb-8">Fecha y hora de entrega:</p>
              <div className="border-t border-gray-400 pt-1">
                <p className="text-xs text-gray-600">____/____/______  ____:____</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-500 mt-8">
          <p>Rastrea tu envio en: www.goexpress.com.py/track</p>
          <p>Contacto: +595 21 123 4567 | info@goexpress.com.py</p>
        </div>
      </div>
    </div>
  );
};
