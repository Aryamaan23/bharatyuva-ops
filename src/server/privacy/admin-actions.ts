"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { completeDeletion, markAccessRequestDone, rejectDataRequest } from "@/server/privileged/data-requests";

const schema = z.object({
  id: z.uuid(),
  op: z.enum(["delete", "access_done", "reject"]),
  notes: z.string().max(1000).optional(),
  confirm: z.string().optional(),
});

export async function processDataRequest(formData: FormData): Promise<void> {
  const session = await requireStaff(ADMIN_ROLES);
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { id, op } = parsed.data;
  if (op === "delete") {
    // Deletion is irreversible: the form requires typing DELETE.
    if (parsed.data.confirm !== "DELETE") return;
    await completeDeletion(id, session.email);
  } else if (op === "access_done") {
    await markAccessRequestDone(id, session.email);
  } else {
    await rejectDataRequest(id, session.email, parsed.data.notes ?? "");
  }
  revalidatePath("/admin/data-requests");
}
