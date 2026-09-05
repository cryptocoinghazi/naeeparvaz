export const socialPlatforms = ["instagram", "facebook", "youtube"] as const;
export type SocialPlatform = (typeof socialPlatforms)[number];
export type PublisherAssetStatus = "staging" | "validated" | "retained" | "discarded";
export type PublishMode = "now" | "scheduled";
export type PublishState = "submitting" | "partial" | "scheduled" | "published" | "failed" | "cancelled" | "ambiguous";
export type PublishTargetStatus = "pending" | "submitting" | "scheduled" | "published" | "failed" | "cancelled" | "ambiguous";

export interface PublisherChannel {
  platform: SocialPlatform;
  organizationId: string;
  channelId: string;
  displayName: string;
  service: string;
  externalUrl?: string;
  enabled: boolean;
  disconnected: boolean;
  locked: boolean;
  updatedAt: string;
}

export interface DiscoveredBufferChannel {
  id: string;
  organizationId: string;
  displayName: string;
  service: string;
  externalUrl?: string;
  disconnected: boolean;
  locked: boolean;
  queuePaused: boolean;
}

export interface PublisherAsset {
  id: string;
  objectKey: string;
  originalFilename: string;
  mimeType: "video/mp4";
  byteSize: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  status: PublisherAssetStatus;
  validatedAt?: string;
  deleteAfter?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublishTarget {
  platform: SocialPlatform;
  channelId: string;
  bufferPostId?: string;
  status: PublishTargetStatus;
  publishedUrl?: string;
  providerDueAt?: string;
  providerSentAt?: string;
  errorCode?: string;
  errorMessage?: string;
  lastRefreshedAt?: string;
}

export interface PublishBatch {
  id: string;
  asset: PublisherAsset;
  publishMode: PublishMode;
  scheduledFor?: string;
  sharedText: string;
  instagramCaption?: string;
  facebookCaption?: string;
  youtubeTitle?: string;
  youtubeDescription?: string;
  clientRequestId: string;
  state: PublishState;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  targets: PublishTarget[];
}
