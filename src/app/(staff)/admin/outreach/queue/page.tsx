import Link from "next/link";
import { QueueCard, type QueueItem } from "@/components/outreach/queue-card";
import { TYPE_LABELS } from "@/components/outreach/labels";
import { PageHeader } from "@/components/admin/ui";
import { Card, CardContent } from "@/components/ui/card";
import { aiConfigured } from "@/server/ai/client";
import { requireStaff } from "@/server/auth/session";
import { googleConfigured } from "@/server/gmail/oauth";
import { gmailStatusFor, listQueue } from "@/server/outreach/crm";
import { outreachContext, renderOutreach } from "@/server/privileged/outreach";

export const metadata = { title: "Today's queue" };

export default async function QueuePage() {
  const session = await requireStaff();
  const [queue, gmail] = await Promise.all([listQueue(session, session.email), gmailStatusFor(session)]);

  const items: QueueItem[] = [];
  for (const q of queue) {
    const ctx = await outreachContext(q.partnershipId);
    if (!ctx) continue;
    // Render with {{personal}} left in place; the card fills it live as the person types.
    const tpl = await renderOutreach(ctx, q.step, "{{personal}}");
    if (!tpl) continue;
    items.push({
      stepId: q.stepId,
      step: q.step,
      partnershipId: q.partnershipId,
      orgName: q.orgName,
      typeLabel: TYPE_LABELS[q.type],
      to: ctx.contact?.email ?? null,
      contactLabel: [ctx.contact?.name, ctx.contact?.roleTitle].filter(Boolean).join(", ") || null,
      needsVerification: ctx.org.needsVerification,
      verificationNote: ctx.org.verificationNote,
      verificationAcknowledged: Boolean(ctx.p.verificationAcknowledgedAt),
      personalLine: ctx.p.personalLine ?? "",
      subjectTemplate: tpl.subject,
      bodyTemplate: tpl.body,
      hasLetter: ctx.org.type === "district" && (q.step === "first" || q.step === "fu1"),
      aiAvailable: aiConfigured(),
    });
  }

  const needsGmail = googleConfigured() && (!gmail || gmail.status !== "active");
  return (
    <>
      <PageHeader
        title="Today's queue"
        description={`${items.length} email${items.length === 1 ? "" : "s"} to review. Approved emails go from your own Gmail a few minutes apart, at most ${gmail?.dailyCap ?? 30} a day.`}
        actions={
          <Link href="/admin/outreach" className="text-sm underline">
            Pipeline
          </Link>
        }
      />
      {needsGmail && (
        <Card className="mb-4 border-destructive">
          <CardContent className="py-4 text-sm">
            {gmail?.status === "revoked" ? "Google disconnected your Gmail. " : "Your Gmail isn't connected yet. "}
            <Link href="/admin/settings/gmail" className="font-semibold underline">
              Connect Gmail
            </Link>{" "}
            so approved emails can be sent.
          </CardContent>
        </Card>
      )}
      {!googleConfigured() && (
        <p className="mb-4 rounded-md bg-muted p-3 text-sm">
          Development mode: Google isn&apos;t configured, so approved emails are delivered to Mailpit instead of Gmail.
        </p>
      )}
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nothing due today. Schedule first emails from the{" "}
            <Link href="/admin/outreach" className="underline">
              pipeline
            </Link>
            ; follow-ups appear here automatically on day 5 and day 12.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <QueueCard key={item.stepId} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
