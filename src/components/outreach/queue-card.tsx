"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { approveStepAction, skipStepAction, suggestLineAction } from "@/server/outreach/actions";
import { STEP_LABELS } from "./labels";

export type QueueItem = {
  stepId: string;
  step: string;
  partnershipId: string;
  orgName: string;
  typeLabel: string;
  to: string | null;
  contactLabel: string | null;
  needsVerification: boolean;
  verificationNote: string | null;
  verificationAcknowledged: boolean;
  personalLine: string;
  subjectTemplate: string;
  bodyTemplate: string;
  hasLetter: boolean;
  aiAvailable: boolean;
};

const ERRORS: Record<string, string> = {
  not_found: "This step is no longer pending.",
  halted: "This partner is in discussion or closed; the sequence has stopped.",
  do_not_contact: "This partner asked not to be contacted.",
  needs_verification: "Tick “I've checked these details” first.",
  personal_required: "Write a personal line (at least a short sentence).",
  no_contact: "No email address for this partner. Add a contact on the partner page.",
  unmerged: "Some {{fields}} are still empty.",
  cap_reached: "You've reached today's sending cap. It will be in tomorrow's queue.",
  no_sender: "Connect your Gmail first (Settings → Gmail).",
};

/** Fill {{personal}} live as the person types, so the preview is exactly what will be sent. */
const withPersonal = (text: string, personal: string) => text.replaceAll("{{personal}}", personal.trim() || "{{personal}}");

export function QueueCard({ item }: { item: QueueItem }) {
  const [personal, setPersonal] = useState(item.personalLine);
  const [subject, setSubject] = useState(item.subjectTemplate);
  const [body, setBody] = useState(item.bodyTemplate);
  const [edited, setEdited] = useState(false);
  const [ack, setAck] = useState(item.verificationAcknowledged);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const [suggesting, startSuggest] = useTransition();

  const finalSubject = edited ? subject : withPersonal(item.subjectTemplate, personal);
  const finalBody = edited ? body : withPersonal(item.bodyTemplate, personal);
  const id = `q-${item.stepId}`;

  if (done) {
    return (
      <div className="rounded-lg border border-green-700 bg-green-50 p-4 text-sm" role="status">
        <strong>{item.orgName}</strong>: {status?.text}
      </div>
    );
  }

  return (
    <article className="rounded-lg border border-border bg-white p-4" aria-labelledby={`${id}-h`}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`${id}-h`} className="font-bold text-brand-navy">
            <Link href={`/admin/outreach/${item.partnershipId}`} className="hover:underline">
              {item.orgName}
            </Link>
          </h2>
          <p className="text-xs text-muted-foreground">
            {item.typeLabel} · {STEP_LABELS[item.step]} · to {item.to ?? "no email"} {item.contactLabel ? `(${item.contactLabel})` : ""}
            {item.hasLetter && " · formal letter attached"}
          </p>
        </div>
        {item.needsVerification && <Badge className="border-amber-500 bg-amber-100 text-amber-900">Check before sending</Badge>}
      </header>

      {item.needsVerification && (
        <div className="mt-3 rounded-md border border-amber-400 bg-amber-50 p-3 text-sm">
          <p>
            <strong>Source note:</strong> {item.verificationNote ?? "Details may be out of date."}
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4" />
            I&apos;ve checked the name and email are current
          </label>
        </div>
      )}

      <div className="mt-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={`${id}-p`} className="text-sm font-semibold">
            Personal line (required)
          </label>
          {item.aiAvailable && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={suggesting}
              onClick={() =>
                startSuggest(async () => {
                  const r = await suggestLineAction(item.partnershipId);
                  if (r.ok) setPersonal(r.text);
                  else setStatus({ kind: "error", text: r.error });
                })
              }
            >
              {suggesting ? "Thinking…" : "✨ Suggest a line"}
            </Button>
          )}
        </div>
        <Textarea id={`${id}-p`} rows={2} value={personal} onChange={(e) => setPersonal(e.target.value)} placeholder="Why we're writing to them specifically, in one sentence." />
        {item.aiAvailable && <p className="text-xs text-muted-foreground">AI suggestions are drafts. Read and edit before sending.</p>}
      </div>

      <details className="mt-3" open={edited}>
        <summary className="cursor-pointer text-sm font-semibold">Preview and edit the email</summary>
        <div className="mt-2 space-y-2">
          <label htmlFor={`${id}-s`} className="sr-only">
            Subject
          </label>
          <Input id={`${id}-s`} value={finalSubject} onChange={(e) => { setEdited(true); setSubject(e.target.value); setBody(finalBody); }} />
          <label htmlFor={`${id}-b`} className="sr-only">
            Body
          </label>
          <Textarea id={`${id}-b`} rows={14} value={finalBody} onChange={(e) => { setEdited(true); setSubject(finalSubject); setBody(e.target.value); }} className="font-mono text-sm" />
          {edited && <p className="text-xs text-muted-foreground">You&apos;ve edited this email by hand; changes to the personal line above won&apos;t update it.</p>}
        </div>
      </details>

      {status && (
        <p role={status.kind === "error" ? "alert" : "status"} className={`mt-3 text-sm ${status.kind === "error" ? "font-semibold text-destructive" : "text-green-800"}`}>
          {status.text}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={pending || !item.to}
          onClick={() =>
            start(async () => {
              const r = await approveStepAction({ stepId: item.stepId, personalLine: personal, subject: finalSubject, body: finalBody, verificationAcknowledged: ack });
              if (r.ok) {
                const t = new Date(r.scheduledFor);
                setStatus({ kind: "ok", text: `Approved. Sends from your Gmail at about ${t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}.` });
                setDone(true);
              } else {
                setStatus({ kind: "error", text: r.detail ?? ERRORS[r.error] ?? r.error });
              }
            })
          }
        >
          {pending ? "Approving…" : "Approve & send"}
        </Button>
        <form action={skipStepAction}>
          <input type="hidden" name="stepId" value={item.stepId} />
          <Button type="submit" variant="outline">
            Skip
          </Button>
        </form>
      </div>
    </article>
  );
}
