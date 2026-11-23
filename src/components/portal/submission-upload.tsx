"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadToSignedUrl } from "@/lib/supabase-browser";
import { createSubmissionUploadAction, recordSubmissionAction } from "@/server/applications/event-actions";

export function SubmissionUpload({ applicationId, locale, copy }: { applicationId: string; locale: string; copy: { title: string; abstract: string; upload: string; uploading: string; failed: string } }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || title.trim().length < 3) return;
        setState("busy");
        const ticket = await createSubmissionUploadAction({ applicationId, size: file.size, mime: file.type });
        const ok = ticket && (await uploadToSignedUrl(ticket.path, ticket.token, file)) && (await recordSubmissionAction({ applicationId, path: ticket.path, fileName: file.name, title, abstract, locale })).ok;
        setState(ok ? "idle" : "failed");
        if (ok) {
          setFile(null);
          setTitle("");
          setAbstract("");
          router.refresh();
        }
      }}
    >
      <div>
        <label htmlFor="sub-title" className="text-sm font-semibold">
          {copy.title}
        </label>
        <Input id="sub-title" value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} />
      </div>
      <div>
        <label htmlFor="sub-abstract" className="text-sm font-semibold">
          {copy.abstract}
        </label>
        <Textarea id="sub-abstract" rows={3} value={abstract} onChange={(e) => setAbstract(e.target.value)} />
      </div>
      <input type="file" accept="application/pdf" aria-label="PDF" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-semibold" />
      {state === "failed" && <p role="alert" className="text-sm font-semibold text-destructive">{copy.failed}</p>}
      <Button type="submit" disabled={state === "busy" || !file}>
        {state === "busy" ? copy.uploading : copy.upload}
      </Button>
    </form>
  );
}
