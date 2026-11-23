"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPartnerLinkAction } from "@/server/outreach/actions";

/** Creates a private partner-page link. The link is shown once; only its hash is stored. */
export function PartnerLinkCreator({ partnershipId, defaultEmail }: { partnershipId: string; defaultEmail: string | null }) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <label htmlFor="pl-email" className="sr-only">
          Partner contact email
        </label>
        <Input id="pl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Contact email (for your records)" />
        <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => setUrl((await createPartnerLinkAction(partnershipId, email || null)).url))}>
          Create link
        </Button>
      </div>
      {url && (
        <div className="rounded-md bg-muted p-2 text-sm">
          <p className="mb-1 font-semibold">Copy this now; it won&apos;t be shown again:</p>
          <code className="block break-all">{url}</code>
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
        </div>
      )}
    </div>
  );
}
