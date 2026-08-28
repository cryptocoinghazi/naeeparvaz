import { escapeHtml } from "./validation";

function safeLink(input: string): string | undefined {
  if (input.startsWith("/")) return input;
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function inlineMarkdown(value: string): string {
  const links: string[] = [];
  const withTokens = value.replace(/\[([^\]\n]{1,200})\]\(([^)\s]{1,1000})\)/g, (whole, label: string, href: string) => {
    const safeHref = safeLink(href);
    if (!safeHref) return whole;
    const token = `\u0000LINK${links.length}\u0000`;
    links.push(`<a href="${escapeHtml(safeHref)}"${safeHref.startsWith("/") ? "" : ' target="_blank" rel="noopener"'}>${escapeHtml(label)}</a>`);
    return token;
  });
  let html = escapeHtml(withTokens)
    .replace(/`([^`\n]{1,200})`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]{1,500})\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_\n]{1,500})_/g, "<em>$1</em>");
  html = html.replace(/\u0000LINK(\d+)\u0000/g, (_whole, index: string) => links[Number(index)] ?? "");
  return html;
}

export function renderSafeMarkdown(markdown: string): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const output: string[] = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }

    const heading = line.match(/^(#{2,4})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quote.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote><p>${inlineMarkdown(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    const unordered = /^[-*]\s+/.test(line);
    const ordered = /^\d+\.\s+/.test(line);
    if (unordered || ordered) {
      const items: string[] = [];
      const pattern = unordered ? /^[-*]\s+(.+)$/ : /^\d+\.\s+(.+)$/;
      while (index < lines.length) {
        const match = lines[index].trim().match(pattern);
        if (!match) break;
        items.push(`<li>${inlineMarkdown(match[1])}</li>`);
        index += 1;
      }
      const tag = ordered ? "ol" : "ul";
      output.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next || /^(#{2,4})\s+|^>\s?|^[-*]\s+|^\d+\.\s+/.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    output.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
  }
  return output.join("\n");
}
