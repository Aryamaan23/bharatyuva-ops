"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadToSignedUrl } from "@/lib/supabase-browser";
import { createUploadAction, recordDocumentAction } from "@/server/applications/actions";

export function DocumentUpload({
  applicationId,
  kind,
  label,
  uploadedName,
  locale,
  copy,
}: {
  applicationId: string;
  kind: string;
  label: string;
  uploadedName: string | null;
  locale: string;
  copy: { upload: string; uploading: string; uploaded: string; replace: string; failed: string };
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "failed">("idle");
  const id = `doc-${kind}`;
  return (
    <div className="space-y-2 rounded-md border border-border p-4">
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      {uploadedName && (
        <p className="text-sm text-green-800">
          ✓ {copy.uploaded}: {uploadedName}
        </p>
      )}
      <input
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        disabled={state === "busy"}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:font-semibold file:text-brand-navy"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setState("busy");
          const ticket = await createUploadAction({ applicationId, kind, mime: file.type, size: file.size });
          const ok =
            ticket.ok &&
            (await uploadToSignedUrl(ticket.path, ticket.token, file)) &&
            (await recordDocumentAction({ applicationId, kind, path: ticket.path, fileName: file.name, locale })).ok;
          setState(ok ? "idle" : "failed");
          if (ok) router.refresh();
        }}
      />
      <p aria-live="polite" className="text-sm">
        {state === "busy" && copy.uploading}
        {state === "failed" && <span className="font-semibold text-destructive">{copy.failed}</span>}
      </p>
    </div>
  );
}
