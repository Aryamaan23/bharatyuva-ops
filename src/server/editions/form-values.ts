import type { Edition } from "@/server/privileged/editions";

const pad = (n: number) => String(n).padStart(2, "0");

/** A UTC Date as the value of an <input type="datetime-local"> in IST. */
function toIstLocal(d: Date | null): string {
  if (!d) return "";
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
}

export function editionToFormValues(e: Edition | null): Record<string, string> {
  if (!e) return { status: "draft", seatConfirmHours: "72", minAge: "18", retentionMonths: "12" };
  return {
    name: e.name,
    slug: e.slug,
    status: e.status,
    contactEmail: e.contactEmail ?? "",
    day1Date: e.day1Date ?? "",
    day2Date: e.day2Date ?? "",
    day3Date: e.day3Date ?? "",
    day1Venue: e.venues.day1?.name ?? "",
    day1City: e.venues.day1?.city ?? "",
    day2Venue: e.venues.day2?.name ?? "",
    day2City: e.venues.day2?.city ?? "",
    day3Venue: e.venues.day3?.name ?? "",
    day3City: e.venues.day3?.city ?? "",
    applicationsOpenAt: toIstLocal(e.applicationsOpenAt),
    applicationsCloseAt: toIstLocal(e.applicationsCloseAt),
    seatConfirmHours: String(e.seatConfirmHours),
    minAge: String(e.minAge),
    retentionMonths: String(e.retentionMonths),
    posterUniversity: e.posterUrls.university ?? "",
    posterDistrict: e.posterUrls.district ?? "",
    posterEmbassy: e.posterUrls.embassy ?? "",
    posterGeneral: e.posterUrls.general ?? "",
    postSelectionDocuments: e.postSelectionDocuments
      .map((d) => [d.key, d.label.en, d.label.hi, d.required ? "required" : "optional"].join(" | "))
      .join("\n"),
  };
}
