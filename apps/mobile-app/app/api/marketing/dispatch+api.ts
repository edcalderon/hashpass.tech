import { runMarketingBatch } from '../../../lib/server/marketing-worker';
export async function POST(request: Request) {
  try { return await runMarketingBatch(request); }
  catch { return Response.json({ error: 'Campaign dispatch is temporarily unavailable' }, { status: 503 }); }
}
