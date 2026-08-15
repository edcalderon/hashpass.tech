export async function health(): Promise<Response> {
  return Response.json({ status: 'ok', service: 'hashpass-links-api' }, { headers: { 'cache-control': 'no-store' } });
}
