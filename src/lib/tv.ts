import { randomUUID } from 'node:crypto';
import { getDatabase } from './database';

export interface TvVideo { video_id: string; title: string; published_at: string }
export interface TvSettings { enabled: boolean; channel_input: string; channel_id?: string; uploads_id?: string; synced_at?: string; last_error?: string }
export async function tvSettings(): Promise<TvSettings> {
  try { return (await getDatabase()?.query('SELECT * FROM tv_settings WHERE id=1'))?.rows[0] || { enabled: false, channel_input: '' }; }
  catch { return { enabled: false, channel_input: '' }; }
}
export async function tvQueue(): Promise<TvVideo[]> {
  const settings = await tvSettings();
  if (!settings.enabled) return [];
  return (await getDatabase()?.query('SELECT video_id,title,published_at FROM tv_videos WHERE channel_id=$1 ORDER BY published_at DESC,video_id', [settings.channel_id]))?.rows || [];
}
export function channelIdentifier(input: string): { id?: string; forHandle?: string } {
  let value = input.trim();
  if (/^https:\/\/(www\.)?youtube\.com\//.test(value)) {
    const path = new URL(value).pathname;
    value = path.startsWith('/channel/') ? path.split('/')[2] : path.split('/')[1];
  }
  if (/^UC[A-Za-z0-9_-]{22}$/.test(value)) return { id: value };
  if (/^@[\p{L}\p{N}_.-]{3,100}$/u.test(value)) return { forHandle: value };
  throw new Error('Use a YouTube @handle or channel ID / channel URL.');
}
async function youtube(resource: string, params: Record<string,string>) {
  if (!process.env.YOUTUBE_API_KEY) throw new Error('YouTube API key is not configured.');
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  url.search = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('YouTube synchronization unavailable. Check API access and quota.');
  return response.json();
}
export async function syncTv(maxPages = 10): Promise<{ complete: boolean }> {
  const db = getDatabase(); if (!db) throw new Error('Database unavailable.');
  const client = await db.connect();
  let locked = false;
  try {
    locked = (await client.query("SELECT pg_try_advisory_lock(hashtext('np-tv-sync')) AS locked")).rows[0].locked;
    if (!locked) throw new Error('Synchronization already running.');
    const s = (await client.query('SELECT * FROM tv_settings WHERE id=1')).rows[0];
    if (!s.channel_input) throw new Error('Configure a channel first.');
    if (!s.sync_generation) {
      const channel = (await youtube('channels', { part: 'contentDetails', ...channelIdentifier(s.channel_input) })).items?.[0];
      if (!channel?.contentDetails?.relatedPlaylists?.uploads) throw new Error('Channel not found.');
      s.channel_id = channel.id; s.uploads_id = channel.contentDetails.relatedPlaylists.uploads;
      s.sync_generation = randomUUID(); s.sync_cursor = null;
      await client.query('DELETE FROM tv_sync_items');
      await client.query('UPDATE tv_settings SET sync_generation=$1,uploads_id=$2,sync_cursor=NULL WHERE id=1', [s.sync_generation,s.uploads_id]);
    }
    // Resolve the owner for resumed syncs without replacing the active channel/cache early.
    const owner = (await youtube('channels', { part:'contentDetails', ...channelIdentifier(s.channel_input) })).items?.[0]?.id;
    if (!owner) throw new Error('Channel not found.');
    for (let page = 0; page < maxPages; page++) {
      const data = await youtube('playlistItems', { part:'snippet,contentDetails', playlistId:s.uploads_id, maxResults:'50', ...(s.sync_cursor ? {pageToken:s.sync_cursor} : {}) });
      const ids = data.items.map((item: {contentDetails:{videoId:string}}) => item.contentDetails.videoId).filter((id:string) => /^[\w-]{11}$/.test(id));
      const details = ids.length ? await youtube('videos', {part:'snippet,status',id:ids.join(',')}) : {items:[]};
      await client.query('BEGIN');
      for (const video of details.items) {
        if (video.status.privacyStatus !== 'public' || !video.status.embeddable || video.snippet.liveBroadcastContent !== 'none') continue;
        await client.query('INSERT INTO tv_sync_items(video_id,title,published_at,generation,channel_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT(video_id) DO UPDATE SET title=$2,published_at=$3,generation=$4,channel_id=$5', [video.id,video.snippet.title,video.snippet.publishedAt,s.sync_generation,owner]);
      }
      s.sync_cursor = data.nextPageToken || null;
      if (!s.sync_cursor) {
        await client.query('DELETE FROM tv_videos');
        await client.query('INSERT INTO tv_videos SELECT * FROM tv_sync_items WHERE generation=$1', [s.sync_generation]);
        await client.query('UPDATE tv_settings SET channel_id=$1,synced_at=now(),sync_cursor=NULL,sync_generation=NULL,last_error=NULL WHERE id=1',[owner]);
        await client.query('COMMIT'); return {complete:true};
      }
      await client.query('UPDATE tv_settings SET sync_cursor=$1 WHERE id=1',[s.sync_cursor]);
      await client.query('COMMIT');
    }
    return {complete:false};
  } catch (error) {
    await client.query('ROLLBACK');
    if (locked) await client.query('UPDATE tv_settings SET last_error=$1 WHERE id=1',['Synchronization failed; previous videos remain available. Check channel, API key and quota.']);
    throw error;
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtext('np-tv-sync'))");
    client.release();
  }
}
