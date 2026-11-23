"use client";

import { del, get, set } from "idb-keyval";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkInAction } from "@/server/event/actions";

type Fellow = { id: string; name: string | null; college: string | null };
type Result = { tone: "ok" | "warn" | "error"; title: string; lines: string[] };
type Pending = { clientId: string; token?: string; applicationId?: string; day: number };

const QUEUE_KEY = "by-checkin-queue";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => Detector;
  }
}

/**
 * Phone check-in. Scans the QR pass with the camera (native BarcodeDetector, or ZXing as a
 * fallback), or lets staff search by name. Scans made offline are queued in IndexedDB and synced
 * when the connection returns; the server ignores duplicates.
 */
export function Scanner({ fellows, defaultDay }: { fellows: Fellow[]; defaultDay: number }) {
  const [day, setDay] = useState(defaultDay);
  const [result, setResult] = useState<Result | null>(null);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [queued, setQueued] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const lastRef = useRef<{ value: string; at: number } | null>(null);

  const refreshQueue = useCallback(async () => setQueued(((await get<Pending[]>(QUEUE_KEY)) ?? []).length), []);

  const submit = useCallback(
    async (p: Pending): Promise<boolean> => {
      try {
        const r = await checkInAction(p);
        if (r.ok) {
          setResult({
            tone: r.already ? "warn" : "ok",
            title: r.already ? `Already checked in: ${r.name}` : `✓ ${r.name}`,
            lines: [r.college ?? "", r.team ? `Team: ${r.team}` : "No team yet", r.emergency ? `Emergency: ${r.emergency}` : "No emergency contact on file", r.photoHint ? `Notes: ${r.photoHint}` : ""].filter(Boolean),
          });
        } else {
          const msg = { invalid_pass: "Not a valid pass", not_a_fellow: "Not a confirmed fellow", wrong_edition: "Pass is for a different edition" }[r.error];
          setResult({ tone: "error", title: `✕ ${msg}`, lines: [] });
        }
        return true;
      } catch {
        // Offline or server unreachable: queue it.
        const q = (await get<Pending[]>(QUEUE_KEY)) ?? [];
        await set(QUEUE_KEY, [...q, p]);
        await refreshQueue();
        setResult({ tone: "warn", title: "Saved offline", lines: ["Will sync when the connection is back."] });
        return false;
      }
    },
    [refreshQueue],
  );

  const sync = useCallback(async () => {
    const q = (await get<Pending[]>(QUEUE_KEY)) ?? [];
    const remaining: Pending[] = [];
    for (const p of q) {
      try {
        await checkInAction(p);
      } catch {
        remaining.push(p);
      }
    }
    if (remaining.length) await set(QUEUE_KEY, remaining);
    else await del(QUEUE_KEY);
    await refreshQueue();
  }, [refreshQueue]);

  useEffect(() => {
    // Initialise the offline count once, and sync whenever the connection comes back.
    void get<Pending[]>(QUEUE_KEY).then((q) => setQueued((q ?? []).length));
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  const onCode = useCallback(
    (value: string) => {
      const now = Date.now();
      if (lastRef.current && lastRef.current.value === value && now - lastRef.current.at < 4000) return;
      lastRef.current = { value, at: now };
      void submit({ clientId: crypto.randomUUID(), token: value, day });
      navigator.vibrate?.(80);
    },
    [day, submit],
  );

  const start = async () => {
    setResult(null);
    setScanning(true);
    const video = videoRef.current!;
    if (window.BarcodeDetector) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      let active = true;
      const tick = async () => {
        if (!active) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]) onCode(codes[0].rawValue);
        } catch {
          /* frame not ready */
        }
        setTimeout(tick, 250);
      };
      void tick();
      stopRef.current = () => {
        active = false;
        stream.getTracks().forEach((t) => t.stop());
      };
    } else {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const reader = new BrowserQRCodeReader();
      const controls = await reader.decodeFromVideoDevice(undefined, video, (res) => {
        if (res) onCode(res.getText());
      });
      stopRef.current = () => controls.stop();
    }
  };

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setScanning(false);
  };

  useEffect(() => () => stopRef.current?.(), []);

  const matches = query.trim().length >= 2 ? fellows.filter((f) => `${f.name} ${f.college}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Event day">
        {[1, 2, 3].map((d) => (
          <Button key={d} variant={d === day ? "default" : "outline"} onClick={() => setDay(d)} aria-pressed={d === day}>
            Day {d}
          </Button>
        ))}
        {queued > 0 && (
          <Button variant="outline" onClick={sync}>
            Sync {queued} offline scan{queued === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} className={`aspect-square w-full object-cover ${scanning ? "" : "hidden"}`} muted playsInline />
      </div>
      {scanning ? (
        <Button variant="outline" className="w-full" onClick={stop}>
          Stop camera
        </Button>
      ) : (
        <Button size="lg" className="w-full" onClick={() => void start()}>
          Scan passes for Day {day}
        </Button>
      )}

      {result && (
        <div
          role="status"
          aria-live="assertive"
          className={`rounded-lg p-4 text-white ${result.tone === "ok" ? "bg-green-700" : result.tone === "warn" ? "bg-amber-600" : "bg-red-700"}`}
        >
          <p className="text-2xl font-bold">{result.title}</p>
          {result.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="manual" className="text-sm font-semibold">
          No pass? Find by name
        </label>
        <Input id="manual" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Type at least 2 letters" autoComplete="off" />
        <ul className="space-y-1">
          {matches.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="w-full rounded-md border border-border px-3 py-2 text-left hover:bg-secondary"
                onClick={() => {
                  setQuery("");
                  void submit({ clientId: crypto.randomUUID(), applicationId: f.id, day });
                }}
              >
                <span className="font-semibold">{f.name}</span> <span className="text-sm text-muted-foreground">· {f.college}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
