import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { CACHE_TAG } from '@/lib/daten/rpc';

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Vom Workflow ingest nach jeder Veröffentlichung aufgerufen; verwirft alle gecachten API-Antworten. */
export async function POST(request: Request): Promise<Response> {
  const erwartet = process.env.REVALIDATE_TOKEN;
  const kopf = request.headers.get('authorization') ?? '';
  const token = kopf.startsWith('Bearer ') ? kopf.slice(7) : '';
  if (!erwartet || !token || !gleich(token, erwartet)) return Response.json({ ok: false }, { status: 401 });
  revalidateTag(CACHE_TAG, { expire: 0 });
  return Response.json({ ok: true });
}
