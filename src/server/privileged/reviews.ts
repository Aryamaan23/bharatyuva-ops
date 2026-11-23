import "server-only";
import { and, eq } from "drizzle-orm";
import { adminDb } from "@/server/db/admin";
import { reviewAssignments } from "@/server/db/schema";
import { audit } from "./audit";

/** Mark a reviewer's own assignment as submitted (checked by reviewer email). */
export async function markAssignmentSubmitted(assignmentId: string, reviewerEmail: string) {
  const [row] = await adminDb()
    .update(reviewAssignments)
    .set({ status: "submitted" })
    .where(and(eq(reviewAssignments.id, assignmentId), eq(reviewAssignments.reviewerEmail, reviewerEmail)))
    .returning({ applicationId: reviewAssignments.applicationId });
  if (row) await audit({ actorEmail: reviewerEmail, action: "review.submitted", entity: "application", entityId: row.applicationId });
}
