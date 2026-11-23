import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { FormBuilder } from "@/components/admin/form-builder";
import { PageHeader } from "@/components/admin/ui";
import { DEFAULT_FORM } from "@/lib/forms/default-form";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { formatDateTime } from "@/server/domain/editions";
import { getEdition, listFormVersions } from "@/server/editions/admin";

export const metadata = { title: "Application form" };

export default async function FormBuilderPage({ params }: PageProps<"/admin/editions/[id]/form">) {
  const session = await requireStaff(ADMIN_ROLES);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const edition = await getEdition(session, id);
  if (!edition) notFound();
  const versions = await listFormVersions(session, id);
  const latest = versions[0];

  return (
    <>
      <PageHeader
        title={`Application form · ${edition.name}`}
        description={
          latest
            ? `Editing from version ${latest.version}${latest.publishedAt ? " (published)" : " (draft)"}. Saving creates a new version.`
            : "No form yet: starting from the default questions."
        }
        actions={
          <Link href={`/admin/editions/${id}`} className="text-sm underline">
            Edition settings
          </Link>
        }
      />
      <FormBuilder editionId={id} initial={latest?.definition ?? DEFAULT_FORM} />
      {versions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 font-semibold text-brand-navy">Version history</h2>
          <ul className="space-y-1 text-sm">
            {versions.map((v) => (
              <li key={v.id}>
                v{v.version} · {v.publishedAt ? `published ${formatDateTime(v.publishedAt)}` : "draft"} · by {v.createdBy ?? "—"}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
