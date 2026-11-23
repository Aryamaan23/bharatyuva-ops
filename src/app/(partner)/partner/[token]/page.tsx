import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/server/domain/editions";
import { partnerRequestAction } from "@/server/privileged/partner-actions";
import { partnerPageData, resolvePartnerToken } from "@/server/privileged/partners";

export const dynamic = "force-dynamic";

const DAY: Record<string, { key: "day1Date" | "day2Date" | "day3Date"; label: string }> = {
  university: { key: "day1Date", label: "Day 1 · Learn" },
  district: { key: "day2Date", label: "Day 2 · Immerse" },
  embassy: { key: "day3Date", label: "Day 3 · Present" },
};

export default async function PartnerPage({ params, searchParams }: PageProps<"/partner/[token]">) {
  const { token } = await params;
  const sp = await searchParams;
  const access = await resolvePartnerToken(token);
  if (!access) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <h1 className="text-2xl font-bold text-brand-navy">This link isn&apos;t valid</h1>
        <p className="mt-2">It may have been replaced. Please ask your contact at Beyond the Classroom for a new one.</p>
      </main>
    );
  }
  const d = await partnerPageData(access.partnershipId);
  if (!d) return null;
  const day = DAY[d.org.type];
  const date = day && d.edition[day.key] ? formatDate(d.edition[day.key]!) : null;
  const caption = `${d.edition.name} is a three-day public policy fellowship by Beyond the Classroom${date ? ` (${date})` : ""}. Fellows learn from practitioners, spend a day with a district administration and present recommendations. Apply: ${d.applyLink}`;
  const whatsapp = `Applications are open for ${d.edition.name}, a public policy fellowship for young people across India, run by Beyond the Classroom with ${d.org.name}. Apply here: ${d.applyLink}`;

  return (
    <>
      <header className="bg-brand-navy text-white">
        <div className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-sm text-brand-gold">{d.edition.name} · Partner page</p>
          <h1 className="mt-1 text-3xl font-bold">{d.org.name}</h1>
          {day && (
            <p className="mt-2">
              {day.label}
              {date ? ` · ${date}` : ""}
            </p>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <section aria-labelledby="plan">
          <h2 id="plan" className="text-xl font-bold text-brand-navy">
            The plan
          </h2>
          <p className="mt-2 whitespace-pre-line">{d.p.dayPlan ?? "We'll share the detailed plan for your day here soon."}</p>
        </section>

        <section aria-labelledby="contacts" className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-4">
            <h2 id="contacts" className="font-bold text-brand-navy">
              Your contact at Beyond the Classroom
            </h2>
            {d.owner ? (
              <p className="mt-1">
                {d.owner.fullName}
                <br />
                <span className="select-all">{d.owner.email}</span>
                {d.owner.phone && (
                  <>
                    <br />
                    {d.owner.phone}
                  </>
                )}
              </p>
            ) : (
              <p className="mt-1">{d.edition.contactEmail ?? "Beyond the Classroom team"}</p>
            )}
          </div>
          {d.org.type === "district" && d.p.nodalOfficer.name && (
            <div className="rounded-lg border border-border p-4">
              <h2 className="font-bold text-brand-navy">Nodal officer</h2>
              <p className="mt-1">
                {d.p.nodalOfficer.name}
                {d.p.nodalOfficer.role && `, ${d.p.nodalOfficer.role}`}
                <br />
                {d.p.nodalOfficer.phone}
                {d.p.nodalOfficer.email && (
                  <>
                    <br />
                    {d.p.nodalOfficer.email}
                  </>
                )}
              </p>
            </div>
          )}
        </section>

        <section aria-labelledby="fellows">
          <h2 id="fellows" className="text-xl font-bold text-brand-navy">
            Fellows
          </h2>
          {d.p.stage !== "confirmed" ? (
            <p className="mt-2 text-muted-foreground">The fellow list is shared here once the partnership is confirmed.</p>
          ) : d.fellows.length === 0 ? (
            <p className="mt-2 text-muted-foreground">Fellows haven&apos;t been confirmed yet.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">{d.fellows.length} confirmed fellows (name and college only).</p>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {d.fellows.map((f, i) => (
                  <li key={i}>
                    {f.name} <span className="text-muted-foreground">· {f.college}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section aria-labelledby="share">
          <h2 id="share" className="text-xl font-bold text-brand-navy">
            Share kit
          </h2>
          <div className="mt-2 space-y-3 text-sm">
            {d.posterLink && (
              <p>
                Poster:{" "}
                <a href={d.posterLink} className="font-semibold underline">
                  {d.posterLink}
                </a>
              </p>
            )}
            <div>
              <p className="font-semibold">Caption</p>
              <p className="select-all rounded-md bg-muted p-3">{caption}</p>
            </div>
            <div>
              <p className="font-semibold">WhatsApp message</p>
              <p className="select-all rounded-md bg-muted p-3">{whatsapp}</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="ask">
          <h2 id="ask" className="text-xl font-bold text-brand-navy">
            Questions or changes
          </h2>
          {sp.sent && <p role="status" className="mt-2 rounded-md bg-green-50 p-3 text-green-900">Thank you. We&apos;ll get back to you shortly.</p>}
          {sp.limited && <p role="alert" className="mt-2 rounded-md bg-destructive/10 p-3 text-destructive">Too many messages. Please try again later.</p>}
          <form action={partnerRequestAction} className="mt-3 space-y-3">
            <input type="hidden" name="token" value={token} />
            <div>
              <label htmlFor="fromName" className="text-sm font-semibold">
                Your name and role
              </label>
              <Input id="fromName" name="fromName" />
            </div>
            <div>
              <label htmlFor="message" className="text-sm font-semibold">
                Message
              </label>
              <Textarea id="message" name="message" rows={4} required />
            </div>
            <Button type="submit">Send</Button>
          </form>
          {d.requests.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {d.requests.map((r) => (
                <li key={r.id}>
                  {formatDate(r.createdAt)}: {r.message.slice(0, 160)}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
