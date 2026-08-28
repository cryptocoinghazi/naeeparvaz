import type { ContentLabel, ResolvedVideo, VideoProvider } from "../types/content";

export const videoLibraryPageSize = 9;
export const videoLibraryProviders = ["youtube", "facebook", "instagram"] as const satisfies readonly VideoProvider[];

export interface VideoLibraryView {
  activeProvider?: VideoProvider;
  activeLabel?: ContentLabel;
  currentPage: number;
  totalPages: number;
  totalVideos: number;
  firstVisible: number;
  lastVisible: number;
  videos: ResolvedVideo[];
  counts: Record<VideoProvider | "all", number>;
  labelCounts: Record<string, number>;
}

function validPage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number.parseInt(value, 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function createVideoLibraryView(
  videos: ResolvedVideo[],
  providerValue: string | null,
  labelValue: string | null,
  pageValue: string | null,
  labels: ContentLabel[] = [],
  pageSize = videoLibraryPageSize,
): VideoLibraryView {
  const activeProvider = videoLibraryProviders.find((provider) => provider === providerValue);
  const availableLabels = labels.length ? labels : [...new Map(videos.flatMap((video) => video.labels).map((label) => [label.id, label])).values()];
  const activeLabel = availableLabels.find((label) => label.id === labelValue);
  const labelFiltered = activeLabel ? videos.filter((video) => video.labels.some((label) => label.id === activeLabel.id)) : videos;
  const providerFiltered = activeProvider ? videos.filter((video) => video.provider === activeProvider) : videos;
  const filtered = activeProvider ? labelFiltered.filter((video) => video.provider === activeProvider) : labelFiltered;
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : videoLibraryPageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize));
  const currentPage = Math.min(validPage(pageValue), totalPages);
  const offset = (currentPage - 1) * safePageSize;
  const pageVideos = filtered.slice(offset, offset + safePageSize);

  return {
    activeProvider,
    activeLabel,
    currentPage,
    totalPages,
    totalVideos: filtered.length,
    firstVisible: pageVideos.length ? offset + 1 : 0,
    lastVisible: offset + pageVideos.length,
    videos: pageVideos,
    counts: {
      all: labelFiltered.length,
      youtube: labelFiltered.filter((video) => video.provider === "youtube").length,
      facebook: labelFiltered.filter((video) => video.provider === "facebook").length,
      instagram: labelFiltered.filter((video) => video.provider === "instagram").length,
    },
    labelCounts: Object.fromEntries(availableLabels.map((label) => [label.id, providerFiltered.filter((video) => video.labels.some((item) => item.id === label.id)).length])),
  };
}
