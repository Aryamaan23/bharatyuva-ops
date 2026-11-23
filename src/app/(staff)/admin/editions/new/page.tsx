import { EditionForm } from "@/components/admin/edition-form";
import { PageHeader } from "@/components/admin/ui";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { editionToFormValues } from "@/server/editions/form-values";

export const metadata = { title: "New edition" };

export default async function NewEditionPage() {
  await requireStaff(ADMIN_ROLES);
  return (
    <>
      <PageHeader title="New edition" />
      <div className="rounded-lg border border-border bg-white p-5">
        <EditionForm values={editionToFormValues(null)} />
      </div>
    </>
  );
}
