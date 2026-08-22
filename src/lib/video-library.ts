import type { ResolvedVideo, VideoProvider } from "../types/content";

export const videoLibraryPageSize = 9;
export const videoLibraryProviders = ["youtube", "facebook", "instagram"] as const satisfies readonly VideoProvider[];

export interface VideoLibraryView {
  activeProvider?: VideoProvider;
  currentPage: number;
  totalPages: number;
  totalVideos: number;
  firstVisible: number;
  lastVisible: number;
  videos: ResolvedVideo[];
  counts: Record<VideoProvider | "all", number>;
}

function validPage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number.parseInt(value, 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function createVideoLibraryView(
  videos: ResolvedVideo[],
  providerValue: string | null,
  pageValue: string | null,
  pageSize = videoLibraryPageSize,
): VideoLibraryView {
  const activeProvider = videoLibraryProviders.find((provider) => provider === providerValue);
  const filtered = activeProvider ? videos.filter((video) => video.provider === activeProvider) : videos;
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : videoLibraryPageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize));
  const currentPage = Math.min(validPage(pageValue), totalPages);
  const offset = (currentPage - 1) * safePageSize;
  const pageVideos = filtered.slice(offset, offset + safePageSize);

  return {
    activeProvider,
    currentPage,
    totalPages,
    totalVideos: filtered.length,
    firstVisible: pageVideos.length ? offset + 1 : 0,
    lastVisible: offset + pageVideos.length,
    videos: pageVideos,
    counts: {
      all: videos.length,
      youtube: videos.filter((video) => video.provider === "youtube").length,
      facebook: videos.filter((video) => video.provider === "facebook").length,
      instagram: videos.filter((video) => video.provider === "instagram").length,
    },
  };
}
