import type { DiscoveredBufferChannel, PublishMode, SocialPlatform } from "../types/publisher";
import { getRuntimeEnv } from "./runtime";

const endpoint = "https://api.buffer.com";
const maxResponseBytes = 1024 * 1024;
const requestTimeoutMs = 20_000;
const submissionTimeoutMs = 120_000;

const organizationsQuery = `
  query NaeeParvazOrganizations {
    account { organizations { id name } }
  }
`;

const channelsQuery = `
  query NaeeParvazChannels($input: ChannelsInput!) {
    channels(input: $input) {
      id displayName service organizationId externalLink
      isDisconnected isLocked isQueuePaused
    }
  }
`;

const createPostMutation = `
  mutation NaeeParvazCreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      __typename
      ... on PostActionSuccess {
        post { id status shareMode dueAt sentAt externalLink channelId }
      }
      ... on MutationError { message }
    }
  }
`;

const postQuery = `
  query NaeeParvazPost($input: PostInput!) {
    post(input: $input) { id status shareMode dueAt sentAt externalLink channelId }
  }
`;

const deletePostMutation = `
  mutation NaeeParvazDeletePost($input: DeletePostInput!) {
    deletePost(input: $input) {
      __typename
      ... on DeletePostSuccess { id }
      ... on MutationError { message }
    }
  }
`;

interface GraphqlEnvelope { data?: Record<string, unknown>; errors?: Array<{ message?: string }> }

export interface BufferPost {
  id: string;
  status: string;
  shareMode: string;
  dueAt?: string;
  sentAt?: string;
  externalLink?: string;
  channelId: string;
}

export class BufferError extends Error {
  constructor(public readonly code: string, message: string, public readonly ambiguous = false) {
    super(message);
  }
}

function key(locals?: App.Locals): string {
  const value = getRuntimeEnv(locals).BUFFER_API_KEY?.trim();
  if (!value) throw new BufferError("BUFFER_NOT_CONFIGURED", "Buffer API access is not configured.");
  return value;
}

export function bufferConfigured(locals?: App.Locals): boolean {
  try { key(locals); return true; } catch { return false; }
}

function safeMessage(value: unknown, fallback: string): string {
  const message = typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim() : fallback;
  return (message || fallback).slice(0, 240);
}

async function execute(locals: App.Locals, operationName: string, query: string, variables: Record<string, unknown>, submission = false): Promise<GraphqlEnvelope> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${key(locals)}`, "Content-Type": "application/json" },
      body: JSON.stringify({ operationName, query, variables }),
      signal: AbortSignal.timeout(submission ? submissionTimeoutMs : requestTimeoutMs),
    });
  } catch {
    throw new BufferError("BUFFER_NETWORK_ERROR", submission ? "Buffer submission outcome is unknown." : "Buffer could not be reached.", submission);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxResponseBytes) throw new BufferError("BUFFER_RESPONSE_TOO_LARGE", "Buffer returned an oversized response.", submission);
  const text = (await response.text()).slice(0, maxResponseBytes + 1);
  if (text.length > maxResponseBytes) throw new BufferError("BUFFER_RESPONSE_TOO_LARGE", "Buffer returned an oversized response.", submission);
  if (!response.ok) {
    const ambiguous = submission && response.status >= 500;
    throw new BufferError(`BUFFER_HTTP_${response.status}`, ambiguous ? "Buffer submission outcome is unknown." : "Buffer rejected the request.", ambiguous);
  }
  try {
    return JSON.parse(text) as GraphqlEnvelope;
  } catch {
    throw new BufferError("BUFFER_RESPONSE_INVALID", submission ? "Buffer submission outcome is unknown." : "Buffer returned an invalid response.", submission);
  }
}

function dataObject(envelope: GraphqlEnvelope, submission = false): Record<string, unknown> {
  if (envelope.errors?.length) throw new BufferError("BUFFER_GRAPHQL_ERROR", submission ? "Buffer submission outcome is unknown." : "Buffer rejected the request.", submission);
  if (!envelope.data || typeof envelope.data !== "object") throw new BufferError("BUFFER_RESPONSE_INVALID", "Buffer returned an invalid response.", submission);
  return envelope.data;
}

function parsePost(value: unknown): BufferPost {
  if (!value || typeof value !== "object") throw new BufferError("BUFFER_RESPONSE_INVALID", "Buffer returned an invalid post.");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.status !== "string" || typeof row.channelId !== "string") {
    throw new BufferError("BUFFER_RESPONSE_INVALID", "Buffer returned incomplete post details.");
  }
  return {
    id: row.id,
    status: row.status,
    shareMode: typeof row.shareMode === "string" ? row.shareMode : "",
    dueAt: typeof row.dueAt === "string" ? row.dueAt : undefined,
    sentAt: typeof row.sentAt === "string" ? row.sentAt : undefined,
    externalLink: typeof row.externalLink === "string" ? row.externalLink : undefined,
    channelId: row.channelId,
  };
}

export async function discoverBufferChannels(locals: App.Locals): Promise<DiscoveredBufferChannel[]> {
  const organizationsData = dataObject(await execute(locals, "NaeeParvazOrganizations", organizationsQuery, {}));
  const account = organizationsData.account as { organizations?: Array<{ id?: string }> } | undefined;
  const organizations = account?.organizations ?? [];
  const discovered: DiscoveredBufferChannel[] = [];
  for (const organization of organizations) {
    if (!organization.id) continue;
    const channelsData = dataObject(await execute(locals, "NaeeParvazChannels", channelsQuery, { input: { organizationId: organization.id } }));
    const channels = Array.isArray(channelsData.channels) ? channelsData.channels : [];
    for (const value of channels) {
      if (!value || typeof value !== "object") continue;
      const channel = value as Record<string, unknown>;
      if (typeof channel.id !== "string" || typeof channel.service !== "string") continue;
      discovered.push({
        id: channel.id,
        organizationId: typeof channel.organizationId === "string" ? channel.organizationId : organization.id,
        displayName: typeof channel.displayName === "string" && channel.displayName ? channel.displayName : channel.service,
        service: channel.service.toLowerCase(),
        externalUrl: typeof channel.externalLink === "string" ? channel.externalLink : undefined,
        disconnected: channel.isDisconnected === true,
        locked: channel.isLocked === true,
        queuePaused: channel.isQueuePaused === true,
      });
    }
  }
  return discovered;
}

function platformMetadata(platform: SocialPlatform, youtubeTitle?: string): Record<string, unknown> {
  if (platform === "instagram") return { instagram: { type: "reel", shouldShareToFeed: true } };
  if (platform === "facebook") return { facebook: { type: "reel" } };
  return {
    youtube: {
      title: youtubeTitle,
      categoryId: "25",
      embeddable: true,
      isAiGenerated: false,
      madeForKids: false,
      notifySubscribers: true,
      privacy: "public",
    },
  };
}

export async function createBufferVideoPost(locals: App.Locals, input: {
  platform: SocialPlatform;
  channelId: string;
  text: string;
  mediaUrl: string;
  mode: PublishMode;
  scheduledFor?: string;
  youtubeTitle?: string;
}): Promise<BufferPost> {
  const postInput: Record<string, unknown> = {
    channelId: input.channelId,
    schedulingType: "automatic",
    mode: input.mode === "now" ? "shareNow" : "customScheduled",
    saveToDraft: false,
    text: input.text,
    assets: [{ video: { url: input.mediaUrl } }],
    metadata: platformMetadata(input.platform, input.youtubeTitle),
    source: "naee-parvaz-editor",
  };
  if (input.mode === "scheduled") postInput.dueAt = input.scheduledFor;
  const data = dataObject(await execute(locals, "NaeeParvazCreatePost", createPostMutation, { input: postInput }, true), true);
  const result = data.createPost as Record<string, unknown> | undefined;
  if (result?.__typename === "PostActionSuccess") return parsePost(result.post);
  if (result && typeof result.message === "string") throw new BufferError(`BUFFER_${String(result.__typename ?? "REJECTED").replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`, safeMessage(result.message, "Buffer rejected the post."));
  throw new BufferError("BUFFER_RESPONSE_AMBIGUOUS", "Buffer submission outcome is unknown.", true);
}

export async function getBufferPost(locals: App.Locals, postId: string): Promise<BufferPost> {
  const data = dataObject(await execute(locals, "NaeeParvazPost", postQuery, { input: { id: postId } }));
  return parsePost(data.post);
}

export async function deleteBufferPost(locals: App.Locals, postId: string): Promise<void> {
  const data = dataObject(await execute(locals, "NaeeParvazDeletePost", deletePostMutation, { input: { id: postId } }, true), true);
  const result = data.deletePost as Record<string, unknown> | undefined;
  if (result?.__typename === "DeletePostSuccess" && result.id === postId) return;
  if (result && typeof result.message === "string") throw new BufferError("BUFFER_CANCEL_REJECTED", safeMessage(result.message, "Buffer could not cancel this post."));
  throw new BufferError("BUFFER_CANCEL_AMBIGUOUS", "Buffer cancellation outcome is unknown.", true);
}
