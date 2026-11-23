import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EditionForm } from "@/components/admin/edition-form";
import { PageHeader } from "@/components/admin/ui";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { getEdition } from "@/server/editions/admin";
import { editionToFormValues } from "@/server/editions/form-values";

export const metadata = { title: "Edition settings" };

export default async function EditionPage({ params }: PageProps<"/admin/editions/[id]">) {
  const session = await requireStaff(ADMIN_ROLES);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const edition = await getEdition(session, id);
  if (!edition) notFound();
  return (
    <>
      <PageHeader
        title={edition.name}
        description={edition.isCurrent ? "This is the current edition." : undefined}
        actions={
          <Link href={`/admin/editions/${id}/form`} className="text-sm underline">
            Edit application form
          </Link>
        }
      />
      <div className="rounded-lg border border-border bg-white p-5">
        <EditionForm id={id} values={editionToFormValues(edition)} />
      </div>
    </>
  );
}
