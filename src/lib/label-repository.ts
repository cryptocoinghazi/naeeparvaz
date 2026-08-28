import { contentLabels } from "../data/site";
import type { ContentLabel, Locale } from "../types/content";
import { getDatabase } from "./database";

interface LabelRow {
  id: string;
  kind: ContentLabel["kind"];
  name_en: string;
  name_hi: string;
  display_order: number;
}

export function labelName(label: ContentLabel, locale: Locale): string {
  return locale === "hi" ? label.nameHi : label.nameEn;
}

export async function getContentLabels(locals?: App.Locals): Promise<ContentLabel[]> {
  const database = getDatabase(locals);
  if (!database) return contentLabels.map((label) => ({ ...label }));
  try {
    const result = await database.query<LabelRow>("SELECT * FROM content_labels ORDER BY display_order");
    if (!result.rows.length) return contentLabels.map((label) => ({ ...label }));
    return result.rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      nameEn: row.name_en,
      nameHi: row.name_hi,
      displayOrder: row.display_order,
    }));
  } catch (error) {
    console.error("Unable to read content labels", error);
    return contentLabels.map((label) => ({ ...label }));
  }
}

export function validateLabelIds(values: FormDataEntryValue[]): string[] {
  const allowed = new Map<string, ContentLabel>(contentLabels.map((label) => [label.id, { ...label }]));
  const ids = [...new Set(values.filter((value): value is string => typeof value === "string"))];
  if (!ids.length || ids.some((id) => !allowed.has(id))) throw new Error("Choose valid content labels.");
  const coverage = ids.filter((id) => allowed.get(id)?.kind === "coverage");
  if (coverage.length !== 1) throw new Error("Choose exactly one coverage label.");
  if (ids.length > 8) throw new Error("Choose no more than eight labels.");
  return ids.sort((a, b) => (allowed.get(a)?.displayOrder ?? 0) - (allowed.get(b)?.displayOrder ?? 0));
}
