import type { APIRoute } from 'astro';
import { channelIdentifier, syncTv } from '../../../lib/tv';
import { getDatabase, withTransaction } from '../../../lib/database';
import { requireSameOrigin } from '../../../lib/editor-api';
export const POST: APIRoute = async ({request,locals,redirect}) => {
  if (!locals.adminEmail) return new Response('Unauthorized',{status:401});
  try {
    requireSameOrigin(request);
    const form = await request.formData();
    if (form.get('action') === 'sync') {
      const result = await syncTv(3);
      return redirect(`/editor/tv/?status=${result.complete ? 'synced' : 'continue'}`,303);
    }
    const input = String(form.get('channel') || '').trim(); channelIdentifier(input);
    await withTransaction(locals,async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('np-tv-sync'))");
      await client.query('UPDATE tv_settings SET enabled=$1,sync_generation=CASE WHEN channel_input=$2 THEN sync_generation ELSE NULL END,sync_cursor=CASE WHEN channel_input=$2 THEN sync_cursor ELSE NULL END,channel_input=$2,updated_at=now() WHERE id=1',[form.get('enabled')==='on',input]);
    });
    if (!getDatabase()) throw new Error('Database unavailable');
    return redirect('/editor/tv/?status=saved',303);
  } catch { return redirect('/editor/tv/?status=error',303); }
};
