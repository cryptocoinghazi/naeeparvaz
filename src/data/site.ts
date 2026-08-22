import type {
  ArticleSummary,
  EditableSiteSettings,
  EditableSocialLink,
  SiteConfig,
} from "../types/content";

export const siteConfig: SiteConfig = {
  publication: {
    name: "Naee Parvaz News",
    hindiName: "नई परवाज़ न्यूज़",
    domain: "naeeparvaz.com",
    url: "https://naeeparvaz.com",
    motto: "सच • संविधान • समाज",
    supportingLine: "News With Purpose",
    description:
      "Independent public-interest journalism grounded in accuracy, constitutional values and responsible public dialogue.",
    logoPath: "/assets/naee-parvaz-masthead.png",
    bannerPath: "/assets/naee-parvaz-primary-banner.png",
  },
  editor: {
    name: "Mohd. Asim Ali",
    title: "मुख्य संपादक, नई परवाज़ न्यूज़",
    email: "editor@naeeparvaz.com",
    phoneDisplay: "+91 982 330 3222",
    phoneHref: "+919823303222",
  },
  navigation: [
    { label: "Home", href: "/" },
    { label: "About", href: "/about/" },
    { label: "Vision & Mission", href: "/vision-mission/" },
    { label: "Newsroom", href: "/#newsroom" },
    { label: "Contact", href: "/contact/" },
  ],
  socials: [
    { platform: "Instagram", identity: "naeeparvaznewsofficial" },
    { platform: "Facebook", identity: "Naee Parvaz News" },
    { platform: "X / Twitter", identity: "@Naee Parvaz News" },
    { platform: "YouTube", identity: "@NaeeParvazNews" },
  ],
  enquiries: [
    {
      title: "Editorial enquiries",
      description: "Questions about coverage, editorial work or the newsroom.",
      subject: "Editorial enquiry",
    },
    {
      title: "Corrections",
      description: "Flag a possible factual error with the relevant page or context.",
      subject: "Correction request",
    },
    {
      title: "News tips",
      description: "Share a lead, document or public-interest issue for consideration.",
      subject: "Confidential news tip",
    },
    {
      title: "Partnerships",
      description: "Discuss responsible editorial, civic or institutional collaboration.",
      subject: "Partnership enquiry",
    },
    {
      title: "General enquiries",
      description: "For other professional and public communication.",
      subject: "General enquiry",
    },
  ],
  categories: [
    { name: "Latest", description: "Timely reporting with verification and context." },
    { name: "Maharashtra", description: "State institutions, communities and public life." },
    { name: "Local / Regional", description: "Stories rooted in places and people often overlooked." },
    { name: "India", description: "National developments and their public consequences." },
    { name: "Politics / Public Affairs", description: "Governance, policy, rights and accountability." },
    { name: "Society", description: "Communities, change, health and civic life." },
    { name: "Education", description: "Learning, access, institutions and young people." },
    { name: "Economy / Business", description: "Livelihoods, enterprise, markets and opportunity." },
    { name: "Technology", description: "Innovation and its effect on society." },
    { name: "Culture", description: "Ideas, language, heritage and creative life." },
    { name: "Opinion", description: "Clearly labelled, responsible argument and perspective." },
    { name: "Explainers", description: "Complex subjects made useful and understandable." },
    { name: "Investigations", description: "Evidence-led reporting in the public interest." },
    { name: "Video", description: "Accessible visual reporting and conversations." },
  ],
};

export const defaultSiteSettings: EditableSiteSettings = {
  editorName: "Mohd. Asim Ali",
  editorTitleEn: "Editor-in-Chief, Naee Parvaz News",
  editorTitleHi: "मुख्य संपादक, नई परवाज न्यूज़",
  email: "editor@naeeparvaz.com",
  phoneDisplay: "+91 982 330 3222",
  phoneHref: "+919823303222",
};

export const defaultSocialLinks: EditableSocialLink[] = [
  { platform: "instagram", identity: "naeeparvaznewsofficial", enabled: true, displayOrder: 1 },
  { platform: "youtube", identity: "@NaeeParvazNews", enabled: true, displayOrder: 2 },
  { platform: "facebook", identity: "Naee Parvaz News", enabled: true, displayOrder: 3 },
  { platform: "x", identity: "@Naee Parvaz News", enabled: true, displayOrder: 4 },
];

export const videoCategories = [
  "maharashtra",
  "local",
  "india",
  "politics",
  "society",
  "education",
  "interviews",
  "explainers",
  "ground-reports",
  "video-reports",
] as const;

// Real reporting can populate this typed collection when publishing begins.
export const articles: ArticleSummary[] = [];

export function editorialMailto(subject?: string): string {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : "";
  return `mailto:${siteConfig.editor.email}${query}`;
}
