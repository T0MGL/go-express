export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D+/g, '');
  if (digits.startsWith('595')) return digits;
  if (digits.startsWith('0')) return `595${digits.slice(1)}`;
  return `595${digits}`;
}

export function whatsappDeepLink(phone: string, message: string): string {
  const target = normalizePhoneForWhatsApp(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${target}?text=${encoded}`;
}

export function defaultDeliveryMessage(trackingNumber: string, nombre: string): string {
  const first = nombre?.trim().split(/\s+/)[0] ?? '';
  const saludo = first ? `Hola ${first}! ` : 'Hola! ';
  return `${saludo}Soy el delivery de GO EXPRESS, estoy en camino con tu pedido #${trackingNumber}.`;
}

export function telLink(phone: string): string {
  const digits = phone.replace(/\D+/g, '');
  const withCountry = digits.startsWith('595') ? digits : digits.startsWith('0') ? `595${digits.slice(1)}` : `595${digits}`;
  return `tel:+${withCountry}`;
}
