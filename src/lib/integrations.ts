/**
 * GO EXPRESS Integration Architecture
 *
 * Documents planned third-party integrations.
 * None are implemented yet: this serves as architectural documentation.
 *
 * 1. SHOPIFY
 *    Auto-create Envios from Shopify orders.
 *    Shopify order.created webhook > POST /api/webhooks/shopify/orders
 *    > Validate HMAC > Map to Envio > Create via envio.service > Sync tracking back.
 *    Config: SHOPIFY_WEBHOOK_SECRET, SHOPIFY_API_KEY, SHOPIFY_API_SECRET
 *    Frontend: "Conectar Shopify" in ClienteImportar, sync status in ClienteDashboard.
 *
 * 2. WHATSAPP NOTIFICATIONS
 *    Push status updates to destinatarios via WhatsApp templates.
 *    Provider: Meta Cloud API (Twilio fallback).
 *    Templates: envio_creado, cambio_estado, entregado, problema.
 *    Config: WHATSAPP_API_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_TEMPLATE_NAMESPACE
 *    Frontend: toggle in Configuracion, delivery status in EnvioDetail timeline.
 *
 * 3. SUPABASE AUTH
 *    Admin/Operador: email+password > usuarios table.
 *    Cliente portal: email+password > clientes table.
 *    Public tracking: no auth required.
 *    Frontend: login pages, route guards, auth context, JWT via Supabase.
 */

export {};
