import type { APIRoute } from 'astro';
import { tvQueue } from '../../lib/tv';
import { json } from '../../lib/editor-api';
export const GET: APIRoute = async () => json(await tvQueue());
