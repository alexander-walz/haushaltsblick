import { beforeEach, describe, expect, it, vi } from 'vitest';

const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }));
vi.mock('next/cache', () => ({ revalidateTag }));

const { POST } = await import('./route');

describe('POST /api/revalidate', () => {
  beforeEach(() => {
    revalidateTag.mockReset();
    process.env.REVALIDATE_TOKEN = 'geheim-token';
  });

  it('verwirft den Cache mit gültigem Token', async () => {
    const r = await POST(new Request('http://x/api/revalidate', { method: 'POST', headers: { authorization: 'Bearer geheim-token' } }));
    expect(r.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith('datenstand', { expire: 0 });
  });

  it('lehnt ein falsches oder fehlendes Token ab', async () => {
    expect((await POST(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer falsch' } }))).status).toBe(401);
    expect((await POST(new Request('http://x', { method: 'POST' }))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('lehnt alles ab, wenn kein Token konfiguriert ist', async () => {
    delete process.env.REVALIDATE_TOKEN;
    expect((await POST(new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer geheim-token' } }))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
