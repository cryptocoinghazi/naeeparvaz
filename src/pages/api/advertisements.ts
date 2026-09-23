import type { APIRoute } from 'astro';
import { getActiveAdvertisements } from '../../lib/ad-repository';
import { json } from '../../lib/editor-api';
export const GET: APIRoute = async ({ locals, url }) => json(await getActiveAdvertisements(locals, url.searchParams.get('locale') === 'hi' ? 'hi' : 'en'));
