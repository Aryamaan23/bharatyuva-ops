import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { RubricEditor } from "@/components/selection/rubric-editor";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { getCurrentEditionForStaff } from "@/server/editions/admin";
import { ensureRubric } from "@/server/privileged/selection";

export const metadata = { title: "Rubric" };

export default async function RubricPage() {
  const session = await requireStaff(ADMIN_ROLES);
  const edition = await getCurrentEditionForStaff(session);
  if (!edition) return <PageHeader title="Rubric" description="No current edition." />;
  const rubric = await ensureRubric(edition.id);
  return (
    <>
      <PageHeader
        title="Scoring rubric"
        description="Each reviewer scores every criterion; totals are weighted and shown as a percentage. Reviewers see the guidance text."
        actions={
          <Link href="/admin/selection" className="text-sm underline">
            Back to selection
          </Link>
        }
      />
      <RubricEditor initial={rubric.criteria} />
    </>
  );
}
