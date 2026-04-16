import type { FontTokens } from "./types";

const LINK_ID = "journey-map-google-fonts";

/** Build a Google Fonts CSS2 URL for configured families (weights are general-purpose). */
export function buildGoogleFontsHref(fonts: FontTokens | undefined): string | null {
  if (!fonts?.sansGoogle && !fonts?.monoGoogle) return null;
  const parts: string[] = [];
  if (fonts.sansGoogle) {
    const fam = fonts.sansGoogle.trim().replace(/\s+/g, "+");
    parts.push(`family=${fam}:wght@400;500;600;700`);
  }
  if (fonts.monoGoogle) {
    const fam = fonts.monoGoogle.trim().replace(/\s+/g, "+");
    parts.push(`family=${fam}:wght@400;500;600`);
  }
  if (!parts.length) return null;
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

export function upsertGoogleFontLink(href: string): void {
  let el = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.id = LINK_ID;
    el.rel = "stylesheet";
    document.head.appendChild(el);
  }
  el.href = href;
}

export function removeGoogleFontLinks(): void {
  document.getElementById(LINK_ID)?.remove();
}
