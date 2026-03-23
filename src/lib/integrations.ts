/**
 * GO EXPRESS — Integration Architecture
 *
 * This module documents planned third-party integrations.
 * None are implemented yet — this serves as architectural documentation.
 *
 * ─── 1. SHOPIFY ──────────────────────────────────────────────────
 *
 * Purpose: Auto-create Envios from Shopify orders
 * Flow:
 *   Shopify order.created webhook → POST /api/webhooks/shopify/orders
 *   → Validate HMAC signature
 *   → Map Shopify order to Envio fields
 *   → Create Envio via envio.service
 *   → Sync tracking number back to Shopify fulfillment
 *
 * Config (backend only):
 *   SHOPIFY_WEBHOOK_SECRET — HMAC validation
 *   SHOPIFY_API_KEY — REST Admin API
 *   SHOPIFY_API_SECRET — REST Admin API
 *
 * Frontend impact:
 *   - ClienteImportar page: add "Conectar Shopify" option alongside CSV
 *   - ClienteDashboard: show Shopify sync status
 *
 * ─── 2. WHATSAPP NOTIFICATIONS ───────────────────────────────────
 *
 * Purpose: Push status updates to destinatarios via WhatsApp templates
 * Provider: Meta Cloud API (or Twilio as fallback)
 * Flow:
 *   Envio status change → email.service checks notification config
 *   → If WhatsApp enabled, send template message to destinatario phone
 *
 * Templates needed:
 *   - envio_creado: "Tu paquete de {empresa} esta en camino. Tracking: {tracking}"
 *   - cambio_estado: "Tu paquete {tracking} ahora esta: {estado}"
 *   - entregado: "Tu paquete {tracking} fue entregado exitosamente"
 *   - problema: "Hubo un problema con tu paquete {tracking}: {descripcion}"
 *
 * Config (backend only):
 *   WHATSAPP_API_TOKEN — Meta Cloud API token
 *   WHATSAPP_PHONE_ID — Business phone number ID
 *   WHATSAPP_TEMPLATE_NAMESPACE — Template namespace
 *
 * Frontend impact:
 *   - Configuracion page: toggle WhatsApp notifications on/off
 *   - EnvioDetail: show WhatsApp delivery status in timeline
 *
 * ─── 3. SUPABASE AUTH ────────────────────────────────────────────
 *
 * Purpose: Authentication for admin users and client portal
 * Pools:
 *   - Admin/Operador: email+password → usuarios table
 *   - Cliente portal: email+password → clientes table
 *   - Public tracking: no auth required
 *
 * Frontend impact:
 *   - Add login pages for /admin and /cliente
 *   - Route guards (ProtectedRoute component)
 *   - Auth context provider
 *   - Token management (Supabase handles JWT)
 */

export {};
