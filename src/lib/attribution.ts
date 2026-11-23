/**
 * First-touch attribution captured by the proxy on a visitor's first landing (UTM parameters and
 * an ambassador referral code), stored in a cookie for 30 days and copied onto the application.
 */
export const ATTRIBUTION_COOKIE = "by_attr";
export const REFERRAL_COOKIE = "by_ref";
export const ATTRIBUTION_MAX_AGE = 60 * 60 * 24 * 30;

export type AttributionCookie = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landingPath?: string;
  firstSeenAt?: string;
};

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;
const SAFE = /^[\w\-.~ %+@]{1,100}$/;
const REFERRAL_RE = /^[A-Za-z0-9-]{3,32}$/;

function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const v = value.trim().slice(0, 100);
  return SAFE.test(v) ? v : undefined;
}

export function attributionFromUrl(url: URL, now: Date): AttributionCookie | null {
  const out: AttributionCookie = {};
  for (const key of UTM_KEYS) {
    const v = clean(url.searchParams.get(`utm_${key}`));
    if (v) out[key] = v;
  }
  if (Object.keys(out).length === 0) return null;
  out.landingPath = url.pathname.slice(0, 200);
  out.firstSeenAt = now.toISOString();
  return out;
}

export function referralFromUrl(url: URL): string | null {
  const ref = url.searchParams.get("ref");
  return ref && REFERRAL_RE.test(ref) ? ref.toUpperCase() : null;
}

export function parseAttributionCookie(value: string | undefined): AttributionCookie {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    const out: AttributionCookie = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && [...UTM_KEYS, "landingPath", "firstSeenAt"].includes(k)) {
        out[k as keyof AttributionCookie] = v.slice(0, 200);
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function sanitizeReferral(value: string | undefined): string | null {
  return value && REFERRAL_RE.test(value) ? value.toUpperCase() : null;
}
