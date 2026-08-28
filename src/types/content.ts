export interface NavigationItem {
  label: string;
  href: string;
}

export interface SocialIdentity {
  platform: string;
  identity: string;
  url?: string;
}

export interface EnquiryCategory {
  title: string;
  description: string;
  subject: string;
}

export interface NewsCategory {
  name: string;
  description: string;
}

export interface ArticleSummary {
  title: string;
  href: string;
  category: string;
  summary: string;
  publishedAt?: string;
  image?: {
    src: string;
    alt: string;
  };
}

export interface SiteConfig {
  publication: {
    name: string;
    hindiName: string;
    domain: string;
    url: string;
    motto: string;
    supportingLine: string;
    description: string;
    logoPath: string;
    bannerPath: string;
  };
  editor: {
    name: string;
    title: string;
    email: string;
    phoneDisplay: string;
    phoneHref: string;
  };
  navigation: NavigationItem[];
  socials: SocialIdentity[];
  enquiries: EnquiryCategory[];
  categories: NewsCategory[];
}

export type Locale = "en" | "hi";

export type ContentLabelKind = "coverage" | "topic";

export interface ContentLabel {
  id: string;
  kind: ContentLabelKind;
  nameEn: string;
  nameHi: string;
  displayOrder: number;
}

export type SocialPlatform = "instagram" | "youtube" | "facebook" | "x";

export interface EditableSiteSettings {
  editorName: string;
  editorTitleEn: string;
  editorTitleHi: string;
  email: string;
  phoneDisplay: string;
  phoneHref: string;
  updatedAt?: string;
}

export interface EditableSocialLink {
  platform: SocialPlatform;
  identity: string;
  url?: string;
  enabled: boolean;
  displayOrder: number;
}

export type VideoProvider = "youtube" | "instagram" | "facebook";
export type VideoStatus = "draft" | "published";

export interface VideoTranslation {
  title: string;
  description?: string;
}

export interface VideoRecord {
  id: string;
  sourceUrl: string;
  canonicalUrl: string;
  provider: VideoProvider;
  providerId: string;
  publishedAt: string;
  category: string;
  labels: ContentLabel[];
  thumbnailDriveId?: string;
  thumbnailSourceUrl?: string;
  featured: boolean;
  status: VideoStatus;
  translations: Partial<Record<Locale, VideoTranslation>>;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedVideo extends VideoRecord {
  title: string;
  description?: string;
  translationLocale: Locale;
}

export type PublishingStatus = "draft" | "published";
export type ArticleSourceType = "original" | "external";

export interface ArticleTranslation {
  title: string;
  summary: string;
  bodyMarkdown: string;
  coverAlt?: string;
}

export interface ArticleRecord {
  id: string;
  slug: string;
  byline: string;
  publishedAt: string;
  featured: boolean;
  status: PublishingStatus;
  sourceType: ArticleSourceType;
  sourceName?: string;
  sourceUrl?: string;
  coverDriveId?: string;
  coverSourceUrl?: string;
  labels: ContentLabel[];
  videoIds: string[];
  translations: Partial<Record<Locale, ArticleTranslation>>;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedArticle extends ArticleRecord, ArticleTranslation {
  translationLocale: Locale;
  relatedVideos: ResolvedVideo[];
}

export type AdPlacement = "home" | "news-listing" | "video-listing" | "article-end";

export interface Advertisement {
  id: string;
  clientName: string;
  headlineEn?: string;
  headlineHi?: string;
  bodyEn?: string;
  bodyHi?: string;
  creativeDriveId?: string;
  creativeSourceUrl?: string;
  creativeAltEn?: string;
  creativeAltHi?: string;
  destinationUrl?: string;
  placement: AdPlacement;
  priority: number;
  startsAt: string;
  endsAt?: string;
  status: PublishingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedAdvertisement extends Advertisement {
  headline?: string;
  body?: string;
  creativeAlt?: string;
}

export interface VisitSummary {
  today: number;
  sevenDays: number;
  thirtyDays: number;
  allTime: number;
  landingPages: Array<{ path: string; visits: number }>;
  daily: Array<{ date: string; visits: number }>;
}
