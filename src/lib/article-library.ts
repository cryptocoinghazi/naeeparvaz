import type { ContentLabel, ResolvedArticle } from "../types/content";

export const articleLibraryPageSize = 9;

export interface ArticleLibraryView {
  activeLabel?: ContentLabel;
  currentPage: number;
  totalPages: number;
  totalArticles: number;
  firstVisible: number;
  lastVisible: number;
  articles: ResolvedArticle[];
  counts: Record<string, number>;
}

function validPage(value: string | null): number {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number.parseInt(value, 10);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function createArticleLibraryView(
  articles: ResolvedArticle[],
  labels: ContentLabel[],
  labelValue: string | null,
  pageValue: string | null,
  pageSize = articleLibraryPageSize,
): ArticleLibraryView {
  const activeLabel = labels.find((label) => label.id === labelValue);
  const filtered = activeLabel ? articles.filter((article) => article.labels.some((label) => label.id === activeLabel.id)) : articles;
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : articleLibraryPageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize));
  const currentPage = Math.min(validPage(pageValue), totalPages);
  const offset = (currentPage - 1) * safePageSize;
  const visible = filtered.slice(offset, offset + safePageSize);
  return {
    activeLabel,
    currentPage,
    totalPages,
    totalArticles: filtered.length,
    firstVisible: visible.length ? offset + 1 : 0,
    lastVisible: offset + visible.length,
    articles: visible,
    counts: Object.fromEntries(labels.map((label) => [label.id, articles.filter((article) => article.labels.some((item) => item.id === label.id)).length])),
  };
}
