"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

/** A button that runs a server action returning { message } and shows the result. */
export function RunButton({ action, label, variant = "default" }: { action: () => Promise<{ message: string }>; label: string; variant?: "default" | "outline" }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant={variant} disabled={pending} onClick={() => start(async () => setMsg((await action()).message))}>
        {pending ? "Working…" : label}
      </Button>
      {msg && (
        <span role="status" className="text-sm">
          {msg}
        </span>
      )}
    </div>
  );
}
