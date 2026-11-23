import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { ImportWizard } from "@/components/outreach/import-wizard";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";

export const metadata = { title: "Import partners" };

export default async function ImportPage() {
  await requireStaff(ADMIN_ROLES);
  return (
    <>
      <PageHeader
        title="Import partners"
        description="The file is read on the server and never stored. Contacts flagged “re-confirm” get a Check-before-sending gate."
        actions={
          <Link href="/admin/outreach" className="text-sm underline">
            Back to pipeline
          </Link>
        }
      />
      <ImportWizard />
    </>
  );
}
