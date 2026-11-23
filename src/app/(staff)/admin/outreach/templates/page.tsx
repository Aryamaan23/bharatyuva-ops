import Link from "next/link";
import { PageHeader } from "@/components/admin/ui";
import { STEP_LABELS, TYPE_LABELS } from "@/components/outreach/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ADMIN_ROLES, hasRole, requireStaff } from "@/server/auth/session";
import { MERGE_FIELDS } from "@/server/domain/merge";
import { saveTemplateAction } from "@/server/outreach/actions";
import { listTemplates } from "@/server/outreach/crm";

export const metadata = { title: "Outreach templates" };

export default async function TemplatesPage() {
  const session = await requireStaff();
  const templates = await listTemplates(session);
  const canEdit = hasRole(session, ...ADMIN_ROLES);
  return (
    <>
      <PageHeader
        title="Outreach templates"
        description={`Merge fields: ${MERGE_FIELDS.map((f) => `{{${f}}}`).join(" ")}. {{personal}} is the one-line reason written for each partner.`}
        actions={
          <Link href="/admin/outreach" className="text-sm underline">
            Back to pipeline
          </Link>
        }
      />
      <div className="space-y-4">
        {templates.map((t) => (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {TYPE_LABELS[t.partnerType]} · {STEP_LABELS[t.step]} <span className="text-xs font-normal text-muted-foreground">v{t.version}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={saveTemplateAction} className="space-y-2">
                <input type="hidden" name="id" value={t.id} />
                <label htmlFor={`s-${t.id}`} className="text-xs font-semibold">
                  Subject
                </label>
                <Input id={`s-${t.id}`} name="subject" defaultValue={t.subject} disabled={!canEdit} />
                <label htmlFor={`b-${t.id}`} className="text-xs font-semibold">
                  Body
                </label>
                <Textarea id={`b-${t.id}`} name="body" rows={12} defaultValue={t.body} className="font-mono text-sm" disabled={!canEdit} />
                {canEdit && (
                  <Button type="submit" size="sm">
                    Save
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
