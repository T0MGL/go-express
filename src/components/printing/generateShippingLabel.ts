/**
 * GO EXPRESS Shipping Label Generator
 * Generates 4x6 inch (10x15cm) PDF labels with Code128 barcodes
 * for handheld laser scanner compatibility.
 *
 * Layout (top to bottom):
 * A. Header: brand + date + payment type
 * B. Origin / Destination (two columns)
 * C. Package details + Payment box
 * D. Notes / Instructions
 * E. Barcode (bottom, large, scannable)
 */

import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { type Envio } from '@/data/types';

const PAGE_W = 4;
const PAGE_H = 6;
const MARGIN = 0.12;
const CONTENT_W = PAGE_W - MARGIN * 2;

function generateBarcodeDataUrl(
  value: string,
  opts: { width?: number; height?: number } = {},
): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, {
    format: 'CODE128',
    width: opts.width ?? 2,
    height: opts.height ?? 50,
    displayValue: false,
    margin: 0,
    background: '#FFFFFF',
    lineColor: '#000000',
  });
  return canvas.toDataURL('image/png');
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return new Date().toLocaleDateString('es-PY', { day: 'numeric', month: 'short', year: 'numeric' });
  const [year, month, day] = dateStr.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

function fmtCurrency(amount: number | null | undefined): string {
  if (amount == null) return 'Gs. 0';
  return `Gs. ${amount.toLocaleString('es-PY')}`;
}

function fmtDimensions(envio: Envio): string {
  const l = envio.dimensiones?.largo;
  const a = envio.dimensiones?.ancho;
  const h = envio.dimensiones?.alto;
  if (!l && !a && !h) return '';
  return `${l ?? 0}x${a ?? 0}x${h ?? 0} cm`;
}

function drawLabel(pdf: jsPDF, envio: Envio): void {
  const barcodeDataUrl = generateBarcodeDataUrl(envio.trackingNumber, { width: 2.5, height: 62 });

  pdf.setDrawColor(0, 0, 0);

  // Outer border (heavier weight)
  pdf.setLineWidth(0.035);
  pdf.rect(MARGIN, MARGIN, CONTENT_W, PAGE_H - MARGIN * 2);

  // ZONE A: HEADER (0.52in)
  const headerH = 0.52;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.setTextColor(6, 67, 247);
  pdf.text('GO EXPRESS', MARGIN + 0.13, MARGIN + 0.24);

  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(130, 130, 130);
  pdf.text('Envios rapidos y seguros', MARGIN + 0.13, MARGIN + 0.38);

  // Date
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(80, 80, 80);
  pdf.text(fmtDate(envio.fecha), PAGE_W - MARGIN - 0.13, MARGIN + 0.19, { align: 'right' });

  // Payment type badge
  const tipoPagoLabel = envio.tipoPago === 'contra_entrega' ? 'CONTRA ENTREGA'
    : envio.tipoPago === 'cuenta_corriente' ? 'CTA. CORRIENTE'
    : 'ANTICIPADO';
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  const badgeTextW = pdf.getTextWidth(tipoPagoLabel);
  const badgeW = badgeTextW + 0.2;
  const badgeX = PAGE_W - MARGIN - 0.13 - badgeW;
  const badgeY = MARGIN + 0.28;
  const badgeH = 0.18;
  if (envio.tipoPago === 'contra_entrega') {
    pdf.setFillColor(220, 38, 38);
    pdf.rect(badgeX, badgeY, badgeW, badgeH, 'F');
    pdf.setTextColor(255, 255, 255);
  } else {
    pdf.setLineWidth(0.015);
    pdf.setDrawColor(0, 0, 0);
    pdf.rect(badgeX, badgeY, badgeW, badgeH);
    pdf.setTextColor(0, 0, 0);
  }
  pdf.text(tipoPagoLabel, badgeX + badgeW / 2, badgeY + 0.13, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
  pdf.setDrawColor(0, 0, 0);

  pdf.setLineWidth(0.02);
  pdf.line(MARGIN, MARGIN + headerH, PAGE_W - MARGIN, MARGIN + headerH);

  // ZONE B: ORIGIN + DESTINATION (2.0in, two columns)
  const addrZoneY = MARGIN + headerH;
  const addrZoneH = 2.0;
  const colW = CONTENT_W / 2;

  // Vertical divider
  pdf.setLineWidth(0.01);
  pdf.setDrawColor(190, 190, 190);
  pdf.line(MARGIN + colW, addrZoneY + 0.06, MARGIN + colW, addrZoneY + addrZoneH - 0.06);
  pdf.setDrawColor(0, 0, 0);

  // LEFT: ORIGEN
  const leftX = MARGIN + 0.13;
  const leftMaxW = colW - 0.26;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(140, 140, 140);
  pdf.text('ORIGEN', leftX, addrZoneY + 0.18);

  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  const origenText = (envio.origen || '').toUpperCase();
  const origenLines = pdf.splitTextToSize(origenText, leftMaxW);
  pdf.text(origenLines.slice(0, 2), leftX, addrZoneY + 0.39);
  const origenOffset = origenLines.slice(0, 2).length > 1 ? 0.17 : 0;

  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text('Remitente:', leftX, addrZoneY + 0.56 + origenOffset);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(0, 0, 0);
  const clientNameLines = pdf.splitTextToSize(envio.clienteNombre || '', leftMaxW);
  pdf.text(clientNameLines.slice(0, 2), leftX, addrZoneY + 0.70 + origenOffset);

  // RIGHT: DESTINO
  const rightX = MARGIN + colW + 0.13;
  const rightMaxW = colW - 0.26;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(140, 140, 140);
  pdf.text('DESTINO', rightX, addrZoneY + 0.18);

  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(15);
  pdf.setFont('helvetica', 'bold');
  const destCity = ((envio.destinatarioCiudad || envio.destino) ?? '').toUpperCase();
  const destCityLines = pdf.splitTextToSize(destCity, rightMaxW);
  pdf.text(destCityLines.slice(0, 2), rightX, addrZoneY + 0.39);
  const destCityOffset = destCityLines.slice(0, 2).length > 1 ? 0.17 : 0;

  if (envio.destinatarioDepartamento) {
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(110, 110, 110);
    pdf.text(envio.destinatarioDepartamento, rightX, addrZoneY + 0.53 + destCityOffset);
    pdf.setTextColor(0, 0, 0);
  }

  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  const recipName = (envio.destinatarioNombre || '').toUpperCase();
  const recipNameLines = pdf.splitTextToSize(recipName, rightMaxW);
  let recipY = addrZoneY + (envio.destinatarioDepartamento ? 0.68 : 0.56) + destCityOffset;
  pdf.text(recipNameLines.slice(0, 2), rightX, recipY);
  recipY += recipNameLines.slice(0, 2).length * 0.14;

  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'normal');
  let fullAddr = envio.destinatarioDireccion || '';
  if (envio.destinatarioBarrio) fullAddr += `, ${envio.destinatarioBarrio}`;
  if (fullAddr) {
    const addrLines = pdf.splitTextToSize(fullAddr, rightMaxW);
    pdf.text(addrLines.slice(0, 3), rightX, recipY + 0.1);
    recipY += addrLines.slice(0, 3).length * 0.12 + 0.1;
  }

  if (envio.destinatarioReferencia) {
    pdf.setFontSize(7);
    pdf.setTextColor(90, 90, 90);
    const refLines = pdf.splitTextToSize(`Ref: ${envio.destinatarioReferencia}`, rightMaxW);
    pdf.text(refLines[0] || '', rightX, recipY + 0.05);
    pdf.setTextColor(0, 0, 0);
  }

  // Phone (boxed, anchored to bottom of zone)
  const phone = envio.destinatarioTelefono || '';
  if (phone) {
    pdf.setFont('courier', 'bold');
    pdf.setFontSize(9);
    const phoneW = pdf.getTextWidth(phone) + 0.18;
    const phoneBoxY = addrZoneY + addrZoneH - 0.32;
    pdf.setLineWidth(0.015);
    pdf.rect(rightX, phoneBoxY, phoneW, 0.22);
    pdf.text(phone, rightX + 0.09, phoneBoxY + 0.15);
  }

  if (envio.destinatarioTelefono2) {
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(7.5);
    const phone1W = pdf.getTextWidth(phone) + 0.26;
    pdf.text(envio.destinatarioTelefono2, rightX + phone1W, addrZoneY + addrZoneH - 0.17);
  }

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.02);
  pdf.line(MARGIN, addrZoneY + addrZoneH, PAGE_W - MARGIN, addrZoneY + addrZoneH);

  // ZONE C: PACKAGE DETAILS + PAYMENT (0.92in)
  const detailZoneY = addrZoneY + addrZoneH;
  const detailZoneH = 0.92;
  const detailLeftX = MARGIN + 0.13;
  let detailY = detailZoneY + 0.18;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(140, 140, 140);
  pdf.text('PAQUETE', detailLeftX, detailY);
  pdf.setTextColor(0, 0, 0);
  detailY += 0.15;

  // Weight
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Peso:', detailLeftX, detailY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(`${envio.peso ?? 0} kg`, detailLeftX + 0.48, detailY);
  detailY += 0.16;

  // Dimensions
  const dims = fmtDimensions(envio);
  if (dims) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text('Dim:', detailLeftX, detailY);
    pdf.setFont('helvetica', 'bold');
    pdf.text(dims, detailLeftX + 0.48, detailY);
    detailY += 0.15;
  }

  // Quantity
  if (envio.cantidad > 1) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.5);
    pdf.text('Bultos:', detailLeftX, detailY);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${envio.cantidad}`, detailLeftX + 0.48, detailY);
    detailY += 0.15;
  }

  // FRAGIL, immediately after last detail line
  if (envio.fragil) {
    detailY += 0.06;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(220, 38, 38);
    pdf.text('FRAGIL', detailLeftX, detailY);
    pdf.setTextColor(0, 0, 0);
  }

  // Payment box (right column, vertically centered in zone)
  const payBoxX = MARGIN + colW + 0.13;
  const payBoxW = colW - 0.24;
  const payBoxY = detailZoneY + 0.12;
  const payBoxH = 0.68;

  if (envio.montoACobrar && envio.montoACobrar > 0) {
    pdf.setFillColor(15, 15, 15);
    pdf.rect(payBoxX, payBoxY, payBoxW, payBoxH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.text('COBRAR AL DESTINO', payBoxX + payBoxW / 2, payBoxY + 0.22, { align: 'center' });
    pdf.setFontSize(15);
    pdf.text(fmtCurrency(envio.montoACobrar), payBoxX + payBoxW / 2, payBoxY + 0.48, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  } else {
    pdf.setFillColor(22, 142, 55);
    pdf.rect(payBoxX, payBoxY, payBoxW, payBoxH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.text('PAGADO', payBoxX + payBoxW / 2, payBoxY + 0.28, { align: 'center' });
    pdf.setFontSize(9.5);
    pdf.text(fmtCurrency(envio.costo), payBoxX + payBoxW / 2, payBoxY + 0.48, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }

  pdf.setLineWidth(0.02);
  pdf.line(MARGIN, detailZoneY + detailZoneH, PAGE_W - MARGIN, detailZoneY + detailZoneH);

  // ZONE D: NOTES (0.42in, only if content exists)
  const notesZoneY = detailZoneY + detailZoneH;
  const notesZoneH = 0.42;
  const notesContent = envio.instruccionesEntrega || envio.notas || '';

  if (notesContent) {
    const notesLabel = envio.instruccionesEntrega ? 'INSTRUCCIONES:' : 'NOTAS:';
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(140, 140, 140);
    pdf.text(notesLabel, MARGIN + 0.13, notesZoneY + 0.14);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    const notesLines = pdf.splitTextToSize(notesContent, CONTENT_W - 0.26);
    pdf.text(notesLines.slice(0, 2), MARGIN + 0.13, notesZoneY + 0.27);
  }

  // Separator before barcode
  const barcodeZoneY = notesZoneY + notesZoneH;
  pdf.setLineWidth(0.02);
  pdf.line(MARGIN, barcodeZoneY, PAGE_W - MARGIN, barcodeZoneY);

  // ZONE E: BARCODE (bottom)
  const barcodeImgW = 3.44;
  const barcodeImgH = 0.74;
  const barcodeX = (PAGE_W - barcodeImgW) / 2;
  pdf.addImage(barcodeDataUrl, 'PNG', barcodeX, barcodeZoneY + 0.16, barcodeImgW, barcodeImgH);

  // Tracking number
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(17);
  pdf.text(envio.trackingNumber, PAGE_W / 2, barcodeZoneY + 1.06, { align: 'center' });

  // Client reference
  if (envio.codigoReferencia) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(130, 130, 130);
    pdf.text(`Ref: ${envio.codigoReferencia}`, PAGE_W / 2, barcodeZoneY + 1.22, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }

  // Tracking URL
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(150, 150, 150);
  pdf.text('goexpressparaguay.com/track', PAGE_W / 2, PAGE_H - MARGIN - 0.09, { align: 'center' });
  pdf.setTextColor(0, 0, 0);
}

export function generateShippingLabelPDF(envio: Envio): Blob {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [PAGE_W, PAGE_H],
    compress: true,
  });
  drawLabel(pdf, envio);
  return pdf.output('blob');
}

export function generateBatchLabelsPDF(envios: Envio[]): Blob {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [PAGE_W, PAGE_H],
    compress: true,
  });
  envios.forEach((envio, i) => {
    if (i > 0) pdf.addPage([PAGE_W, PAGE_H], 'portrait');
    drawLabel(pdf, envio);
  });
  return pdf.output('blob');
}

export function triggerLabelPrint(blob: Blob): void {
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  iframe.src = url;

  const cleanup = () => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    URL.revokeObjectURL(url);
  };

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
      } catch {
        const a = document.createElement('a');
        a.href = url;
        a.download = 'etiqueta-go-express.pdf';
        a.click();
      }
      setTimeout(cleanup, 5000);
    }, 600);
  };

  document.body.appendChild(iframe);
}

export function printShippingLabel(envio: Envio): boolean {
  try {
    const blob = generateShippingLabelPDF(envio);
    triggerLabelPrint(blob);
    return true;
  } catch {
    return false;
  }
}

export function printBatchLabels(envios: Envio[]): boolean {
  try {
    const blob = generateBatchLabelsPDF(envios);
    triggerLabelPrint(blob);
    return true;
  } catch {
    return false;
  }
}
