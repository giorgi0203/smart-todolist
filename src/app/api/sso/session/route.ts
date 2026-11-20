import { z } from 'zod';
import { identityRole, externalClient, externalSession, digestToken } from '@/lib/server/sso';
import { body, json, clientIp } from '@/lib/server/http';
import { takeRateLimit } from '@/lib/server/store';
import { AppError } from '@/lib/server/errors';

// This endpoint accepts only an app-scoped bearer grant, never an identity cookie.
export async function POST(req: Request) {
  if (!identityRole()) return json({ error: 'Not found' }, 404);
  try {
    takeRateLimit('sso-session:' + digestToken(clientIp(req)), 300, 60000);
    const data = await body(req, z.object({ client_id: z.literal(externalClient), session_token: z.string().regex(/^[a-f0-9]{64}$/) }).strict());
    return json({ user: externalSession(data.client_id, data.session_token) });
  } catch (error) {
    const response = json({ error: error instanceof AppError ? error.message : 'Could not check sign-in.' }, error instanceof AppError ? error.status : 500);
    if (error instanceof AppError && error.retryAfter) response.headers.set('Retry-After', String(error.retryAfter));
    return response;
  }
}
