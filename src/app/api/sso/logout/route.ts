import { z } from 'zod';
import { identityRole, externalClient, revokeExternalSession, digestToken } from '@/lib/server/sso';
import { body, json, clientIp } from '@/lib/server/http';
import { takeRateLimit } from '@/lib/server/store';
import { AppError } from '@/lib/server/errors';

export async function POST(req: Request) {
  if (!identityRole()) return json({ error: 'Not found' }, 404);
  try {
    takeRateLimit('sso-logout:' + digestToken(clientIp(req)), 100, 60000);
    const data = await body(req, z.object({ client_id: z.literal(externalClient), session_token: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
    revokeExternalSession(data.client_id, data.session_token);
    return json({ ok: true });
  } catch (error) {
    const response = json({ error: error instanceof AppError ? error.message : 'Could not sign out.' }, error instanceof AppError ? error.status : 500);
    if (error instanceof AppError && error.retryAfter) response.headers.set('Retry-After', String(error.retryAfter));
    return response;
  }
}
