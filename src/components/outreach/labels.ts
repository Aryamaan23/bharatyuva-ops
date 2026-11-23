import type { PartnerStage, PartnerType, Temperature } from "@/server/db/schema";

export const STAGE_LABELS: Record<PartnerStage, string> = {
  not_contacted: "Not contacted",
  email_sent: "Email sent",
  follow_up_1: "Follow-up 1",
  follow_up_2: "Follow-up 2",
  in_discussion: "In discussion",
  confirmed: "Confirmed",
  declined: "Declined",
  do_not_contact: "Do not contact",
};

export const TYPE_LABELS: Record<PartnerType, string> = {
  university: "University · Day 1",
  district: "District · Day 2",
  embassy: "Embassy · Day 3",
  other: "Other",
};

export const TEMP_CLASS: Record<Temperature, string> = {
  hot: "bg-red-100 text-red-900 border-red-300",
  warm: "bg-amber-100 text-amber-900 border-amber-300",
  cold: "bg-sky-100 text-sky-900 border-sky-300",
};

export const STEP_LABELS: Record<string, string> = { first: "First email", fu1: "Follow-up 1", fu2: "Follow-up 2", call: "Call the office", thank_you: "Thank you" };
