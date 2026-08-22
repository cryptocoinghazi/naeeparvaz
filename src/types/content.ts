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
