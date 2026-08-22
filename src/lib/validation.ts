export function requiredText(value: FormDataEntryValue | null, label: string, min: number, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length < min || text.length > max) throw new Error(`${label} must be between ${min} and ${max} characters.`);
  return text;
}

export function optionalText(value: FormDataEntryValue | null, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return text;
}

export function validEmail(value: FormDataEntryValue | null): string {
  const email = requiredText(value, "Email", 3, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}

export function phoneHref(value: string): string {
  const normalized = value.replace(/[^+\d]/g, "");
  if (!/^\+?[1-9]\d{7,14}$/.test(normalized)) throw new Error("Enter a valid international telephone number.");
  return normalized.startsWith("+") ? normalized : `+${normalized}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
