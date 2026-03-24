import { Readability } from "@mozilla/readability";

export interface ParsedArticle {
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  siteName: string | null;
}

export function parseArticle(
  html: string,
  url: string
): ParsedArticle | null {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const base = doc.createElement("base");
  base.href = url;
  doc.head.appendChild(base);

  const reader = new Readability(doc);
  const article = reader.parse();

  if (!article) return null;

  return {
    title: article.title ?? "",
    content: article.content ?? "",
    textContent: article.textContent ?? "",
    excerpt: article.excerpt ?? "",
    siteName: article.siteName ?? null,
  };
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return url;
  }
}
