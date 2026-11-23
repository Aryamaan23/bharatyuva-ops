import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "No access" };

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-bold text-brand-navy">You don&apos;t have access to this page</h1>
      <p>
        Your account is signed in but doesn&apos;t have a staff role for this area. Ask an owner to add you in Team settings.
      </p>
      <div className="flex gap-3">
        <form action="/auth/signout" method="post">
          <input type="hidden" name="next" value="/login" />
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
        <Link href="/en" className="self-center underline">
          Public site
        </Link>
      </div>
    </main>
  );
}
