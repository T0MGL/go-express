/**
 * GO EXPRESS Shipping Label Generator
 * Generates 4x6 inch (10x15cm) PDF labels with Code128 barcodes
 * for handheld laser scanner compatibility.
 *
 * Adapted from ORDEFY's label system, customized for logistics use.
 */

import { jsPDF } from 'jspdf';
import JsBarcode from 'jsbarcode';
import { type Envio } from '@/data/types';

// Page dimensions in inches (4x6 thermal label, portrait)
const PAGE_W = 4;
const PAGE_H = 6;
const MARGIN = 0.12;
const CONTENT_W = PAGE_W - MARGIN * 2;

/**
 * Renders a Code128 barcode to a data URL via an offscreen canvas.
 */
function generateBarcodeDataUrl(
  value: string,
  opts: { width?: number; height?: number; fontSize?: number } = {},
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

/**
 * Formats a date string (YYYY-MM-DD) to a human readable format.
 */
function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${parseInt(day)} ${months[parseInt(month) - 1]} ${year}`;
}

/**
 * Formats currency for Guaranies.
 */
function fmtCurrency(amount: number): string {
  return `Gs. ${amount.toLocaleString('es-PY')}`;
}

/**
 * Draw a single shipping label on the current PDF page.
 */
function drawLabel(pdf: jsPDF, envio: Envio): void {
  const barcodeDataUrl = generateBarcodeDataUrl(envio.trackingNumber, {
    width: 2,
    height: 60,
  });

  pdf.setDrawColor(0, 0, 0);

  // ========================================================================
  // ZONE A: HEADER (0.55in)
  // ========================================================================
  const headerH = 0.55;

  // Outer border
  pdf.setLineWidth(0.025);
  pdf.rect(MARGIN, MARGIN, CONTENT_W, PAGE_H - MARGIN * 2);

  // Brand name
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(6, 67, 247); // GO EXPRESS blue #0643F7
  pdf.text('GO EXPRESS', MARGIN + 0.1, MARGIN + 0.25);

  // Tagline
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text('Envios rapidos y seguros', MARGIN + 0.1, MARGIN + 0.4);

  // Date (right side)
  pdf.setFontSize(8);
  pdf.setTextColor(80, 80, 80);
  const dateText = fmtDate(envio.fecha) || new Date().toLocaleDateString('es-PY');
  pdf.text(dateText, PAGE_W - MARGIN - 0.1, MARGIN + 0.2, { align: 'right' });

  // Shipment type badge (right side)
  const tipoPagoLabel = envio.tipoPago === 'contra_entrega' ? 'CONTRA ENTREGA'
    : envio.tipoPago === 'cuenta_corriente' ? 'CTA. CORRIENTE'
    : 'ANTICIPADO';
  pdf.setFontSize(7);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(0, 0, 0);
  const badgeW = pdf.getTextWidth(tipoPagoLabel) + 0.16;
  const badgeX = PAGE_W - MARGIN - 0.1 - badgeW;
  const badgeY = MARGIN + 0.3;
  pdf.setLineWidth(0.015);
  pdf.rect(badgeX, badgeY, badgeW, 0.18);
  pdf.text(tipoPagoLabel, badgeX + 0.08, badgeY + 0.13);

  // Header separator
  pdf.setTextColor(0, 0, 0);
  pdf.setLineWidth(0.02);
  pdf.line(MARGIN, MARGIN + headerH, PAGE_W - MARGIN, MARGIN + headerH);

  // ========================================================================
  // ZONE B: BARCODE (1.15in)
  // ========================================================================
  const barcodeZoneY = MARGIN + headerH;
  const barcodeZoneH = 1.15;

  // Barcode image (centered, large)
  const barcodeImgW = 3.2;
  const barcodeImgH = 0.6;
  const barcodeX = (PAGE_W - barcodeImgW) / 2;
  pdf.addImage(barcodeDataUrl, 'PNG', barcodeX, barcodeZoneY + 0.1, barcodeImgW, barcodeImgH);

  // Tracking number below barcode (human readable, large font)
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(16);
  pdf.text(envio.trackingNumber, PAGE_W / 2, barcodeZoneY + 0.88, { align: 'center' });

  // Client reference code if available
  if (envio.codigoReferencia) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Ref: ${envio.codigoReferencia}`, PAGE_W / 2, barcodeZoneY + 1.02, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
  }

  // Barcode zone separator
  pdf.setLineWidth(0.02);
  pdf.line(MARGIN, barcodeZoneY + barcodeZoneH, PAGE_W - MARGIN, barcodeZoneY + barcodeZoneH);

  // ========================================================================
  // ZONE C: ORIGIN + DESTINATION (2.1in, split into two columns)
  // ========================================================================
  const addrZoneY = barcodeZoneY + barcodeZoneH;
  const addrZoneH = 2.1;
  const colW = CONTENT_W / 2;

  // Vertical divider
  pdf.setLineWidth(0.01);
  pdf.setDrawColor(180, 180, 180);
  pdf.line(MARGIN + colW, addrZoneY + 0.05, MARGIN + colW, addrZoneY + addrZoneH - 0.05);
  pdf.setDrawColor(0, 0, 0);

  // --- LEFT COLUMN: ORIGEN ---
  const leftX = MARGIN + 0.1;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text('ORIGEN', leftX, addrZoneY + 0.18);

  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  pdf.text(envio.origen.toUpperCase(), leftX, addrZoneY + 0.38);

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.text('Remitente:', leftX, addrZoneY + 0.58);
  pdf.setFont('helvetica', 'bold');

  // Wrap client name
  const clientNameLines = pdf.splitTextToSize(envio.clienteNombre, colW - 0.2);
  pdf.text(clientNameLines.slice(0, 2), leftX, addrZoneY + 0.72);

  // --- RIGHT COLUMN: DESTINO ---
  const rightX = MARGIN + colW + 0.1;
  const rightMaxW = colW - 0.2;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(100, 100, 100);
  pdf.text('DESTINO', rightX, addrZoneY + 0.18);

  // City (prominent)
  pdf.setTextColor(0, 0, 0);
  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'bold');
  const destCity = (envio.destinatarioCiudad || envio.destino).toUpperCase();
  pdf.text(destCity, rightX, addrZoneY + 0.38);

  // Department
  if (envio.destinatarioDepartamento) {
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
    pdf.text(envio.destinatarioDepartamento, rightX, addrZoneY + 0.52);
    pdf.setTextColor(0, 0, 0);
  }

  // Recipient name
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  const recipNameLines = pdf.splitTextToSize(envio.destinatarioNombre.toUpperCase(), rightMaxW);
  let recipY = addrZoneY + 0.7;
  pdf.text(recipNameLines.slice(0, 2), rightX, recipY);
  recipY += recipNameLines.slice(0, 2).length * 0.15;

  // Address
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  let fullAddr = envio.destinatarioDireccion;
  if (envio.destinatarioBarrio) {
    fullAddr += `, ${envio.destinatarioBarrio}`;
  }
  const addrLines = pdf.splitTextToSize(fullAddr, rightMaxW);
  pdf.text(addrLines.slice(0, 3), rightX, recipY + 0.08);
  recipY += addrLines.slice(0, 3).length * 0.12 + 0.08;

  // Address reference
  if (envio.destinatarioReferencia) {
    pdf.setFontSize(7);
    pdf.setTextColor(80, 80, 80);
    const refLines = pdf.splitTextToSize(`Ref: ${envio.destinatarioReferencia}`, rightMaxW);
    pdf.text(refLines[0] || '', rightX, recipY + 0.04);
    pdf.setTextColor(0, 0, 0);
    recipY += 0.14;
  }

  // Phone (boxed, prominent)
  pdf.setFont('courier', 'bold');
  pdf.setFontSize(9);
  const phoneText = envio.destinatarioTelefono;
  const phoneW = pdf.getTextWidth(phoneText) + 0.14;
  const phoneBoxY = addrZoneY + addrZoneH - 0.35;
  pdf.setLineWidth(0.015);
  pdf.rect(rightX, phoneBoxY, phoneW, 0.2);
  pdf.text(phoneText, rightX + 0.07, phoneBoxY + 0.14);

  // Second phone if available
  if (envio.destinatarioTelefono2) {
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(8);
    pdf.text(envio.destinatarioTelefono2, rightX + phoneW + 0.08, phoneBoxY + 0.14);
  }

  // Address zone separator
  pdf.setLineWidth(0.02);
  pdf.line(MARGIN, addrZoneY + addrZoneH, PAGE_W - MARGIN, addrZoneY + addrZoneH);

  // ========================================================================
  // ZONE D: PACKAGE DETAILS + PAYMENT (1.1in)
  // ========================================================================
  const detailZoneY = addrZoneY + addrZoneH;
  const detailZoneH = 1.1;

  // Package info (left side)
  const detailLeftX = MARGIN + 0.1;
  let detailY = detailZoneY + 0.18;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(100, 100, 100);
  pdf.text('PAQUETE', detailLeftX, detailY);
  pdf.setTextColor(0, 0, 0);
  detailY += 0.16;

  // Weight
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Peso:', detailLeftX, detailY);
  pdf.setFont('helvetica', 'bold');
  pdf.text(`${envio.peso} kg`, detailLeftX + 0.5, detailY);
  detailY += 0.14;

  // Dimensions
  pdf.setFont('helvetica', 'normal');
  pdf.text('Dim:', detailLeftX, detailY);
  pdf.setFont('helvetica', 'bold');
  pdf.text(
    `${envio.dimensiones.largo}x${envio.dimensiones.ancho}x${envio.dimensiones.alto} cm`,
    detailLeftX + 0.5,
    detailY,
  );
  detailY += 0.14;

  // Quantity
  if (envio.cantidad > 1) {
    pdf.setFont('helvetica', 'normal');
    pdf.text('Bultos:', detailLeftX, detailY);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${envio.cantidad}`, detailLeftX + 0.5, detailY);
    detailY += 0.14;
  }

  // Product description
  if (envio.producto) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const prodLines = pdf.splitTextToSize(envio.producto, 1.4);
    pdf.text(prodLines[0] || '', detailLeftX, detailY);
  }

  // Fragile indicator
  if (envio.fragil) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(220, 38, 38);
    pdf.text('FRAGIL', detailLeftX, detailZoneY + detailZoneH - 0.12);
    pdf.setTextColor(0, 0, 0);
  }

  // Payment / collection box (right side)
  const payBoxX = MARGIN + colW + 0.1;
  const payBoxW = colW - 0.2;
  const payBoxY = detailZoneY + 0.12;
  const payBoxH = 0.75;

  if (envio.montoACobrar > 0) {
    // COD: black filled box
    pdf.setFillColor(0, 0, 0);
    pdf.rect(payBoxX, payBoxY, payBoxW, payBoxH, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text('COBRAR AL DESTINO', payBoxX + payBoxW / 2, payBoxY + 0.22, { align: 'center' });

    pdf.setFontSize(16);
    pdf.text(fmtCurrency(envio.montoACobrar), payBoxX + payBoxW / 2, payBoxY + 0.52, { align: 'center' });

    pdf.setTextColor(0, 0, 0);
  } else {
    // Paid: green box
    pdf.setFillColor(34, 139, 34);
    pdf.rect(payBoxX, payBoxY, payBoxW, payBoxH, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('PAGADO', payBoxX + payBoxW / 2, payBoxY + 0.3, { align: 'center' });

    pdf.setFontSize(10);
    pdf.text(fmtCurrency(envio.costo), payBoxX + payBoxW / 2, payBoxY + 0.52, { align: 'center' });

    pdf.setTextColor(0, 0, 0);
  }

  // Detail zone separator
  pdf.setLineWidth(0.02);
  pdf.line(MARGIN, detailZoneY + detailZoneH, PAGE_W - MARGIN, detailZoneY + detailZoneH);

  // ========================================================================
  // ZONE E: FOOTER (remaining space ~ 0.85in)
  // ========================================================================
  const footerY = detailZoneY + detailZoneH;

  // Delivery instructions
  if (envio.instruccionesEntrega) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 100, 100);
    pdf.text('INSTRUCCIONES:', MARGIN + 0.1, footerY + 0.15);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const instrLines = pdf.splitTextToSize(envio.instruccionesEntrega, CONTENT_W - 0.2);
    pdf.text(instrLines.slice(0, 2), MARGIN + 0.1, footerY + 0.28);
  }

  // Notes (if no delivery instructions)
  if (!envio.instruccionesEntrega && envio.notas) {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 100, 100);
    pdf.text('NOTAS:', MARGIN + 0.1, footerY + 0.15);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    const notaLines = pdf.splitTextToSize(envio.notas, CONTENT_W - 0.2);
    pdf.text(notaLines.slice(0, 2), MARGIN + 0.1, footerY + 0.28);
  }

  // Bottom: tracking URL and contact
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7);
  pdf.setTextColor(120, 120, 120);
  pdf.text(
    'Rastrea tu envio: goexpress.com.py/track',
    PAGE_W / 2,
    PAGE_H - MARGIN - 0.12,
    { align: 'center' },
  );
  pdf.setTextColor(0, 0, 0);

  // Watermark
  pdf.saveGraphicsState();
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(70);
  pdf.setTextColor(240, 240, 240);
  pdf.text('GO EXPRESS', PAGE_W / 2, PAGE_H / 2, { align: 'center', angle: -45 });
  pdf.restoreGraphicsState();
  pdf.setTextColor(0, 0, 0);
}

/**
 * Generate a single shipping label PDF for one envio.
 */
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

/**
 * Generate a multi-page PDF with labels for multiple envios.
 */
export function generateBatchLabelsPDF(envios: Envio[]): Blob {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [PAGE_W, PAGE_H],
    compress: true,
  });

  envios.forEach((envio, i) => {
    if (i > 0) {
      pdf.addPage([PAGE_W, PAGE_H], 'portrait');
    }
    drawLabel(pdf, envio);
  });

  return pdf.output('blob');
}

/**
 * Opens the generated PDF in a new tab and triggers the print dialog.
 * Falls back to download if popup is blocked.
 */
export function triggerLabelPrint(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, '_blank');

  if (!printWindow) {
    // Popup blocked, fall back to download
    const a = document.createElement('a');
    a.href = url;
    a.download = 'etiqueta-go-express.pdf';
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 800);
  };

  // Clean up after 30 seconds
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 30000);
}

/**
 * One-call function: generate and print a single label.
 */
export function printShippingLabel(envio: Envio): boolean {
  try {
    const blob = generateShippingLabelPDF(envio);
    triggerLabelPrint(blob);
    return true;
  } catch {
    return false;
  }
}

/**
 * One-call function: generate and print a batch of labels.
 */
export function printBatchLabels(envios: Envio[]): boolean {
  try {
    const blob = generateBatchLabelsPDF(envios);
    triggerLabelPrint(blob);
    return true;
  } catch {
    return false;
  }
}
