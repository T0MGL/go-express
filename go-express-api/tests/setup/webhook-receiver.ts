import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface ReceivedRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}

export interface WebhookReceiver {
  url: string;
  received: ReceivedRequest[];
  setStatus: (code: number) => void;
  close: () => Promise<void>;
}

/**
 * Receptor HTTP local para la suite de webhooks: captura headers y body CRUDO (la firma
 * HMAC se verifica sobre los bytes exactos) y responde el status configurado.
 */
export async function startWebhookReceiver(): Promise<WebhookReceiver> {
  const received: ReceivedRequest[] = [];
  let statusCode = 200;

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, rawBody: Buffer.concat(chunks) });
      res.statusCode = statusCode;
      res.end(statusCode < 400 ? 'ok' : 'receiver error');
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/hooks/goexpress`,
    received,
    setStatus: (code: number) => {
      statusCode = code;
    },
    close: () => new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
