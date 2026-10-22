import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { connection } from 'next/server';
import { resolveEvidence } from '@/lib/results';

const TYPES: Record<string, string> = {
  webm: 'video/webm',
  png: 'image/png',
  zip: 'application/zip',
  json: 'application/json',
  jsonl: 'text/plain; charset=utf-8',
  log: 'text/plain; charset=utf-8',
};

/** Serves video, screenshots, trace and logs of one run, with Range support so the video can seek. */
export async function GET(req: Request, ctx: RouteContext<'/api/runs/[id]/files/[...path]'>): Promise<Response> {
  await connection();
  const { id, path } = await ctx.params;
  const file = resolveEvidence(id, path.join('/'));
  const info = file ? await stat(file).catch(() => undefined) : undefined;
  if (!file || !info?.isFile()) return new Response('Not found', { status: 404 });

  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  const headers: Record<string, string> = {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  if (ext === 'zip') headers['content-disposition'] = `attachment; filename="${id}-trace.zip"`;

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${String(info.size)}` } });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
      status: 206,
      headers: { ...headers, 'content-range': `bytes ${String(start)}-${String(end)}/${String(info.size)}`, 'content-length': String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...headers, 'content-length': String(info.size) } });
}
