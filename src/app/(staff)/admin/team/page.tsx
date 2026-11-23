import { asc } from "drizzle-orm";
import { StaffMemberForm } from "@/components/admin/staff-member-form";
import { PageHeader } from "@/components/admin/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ADMIN_ROLES, requireStaff } from "@/server/auth/session";
import { staffMembers } from "@/server/db/schema";
import { withUserDb } from "@/server/db/user";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const session = await requireStaff(ADMIN_ROLES);
  const members = await withUserDb(session.claims, (tx) => tx.select().from(staffMembers).orderBy(asc(staffMembers.fullName)));
  return (
    <>
      <PageHeader
        title="Team"
        description="People sign in with Google or an email link using the address below. Roles take effect immediately."
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Add someone</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffMemberForm />
        </CardContent>
      </Card>
      <div className="space-y-3">
        {members.map((m) => (
          <Card key={m.email} className={m.active ? "" : "opacity-60"}>
            <CardContent className="py-4">
              <StaffMemberForm member={{ email: m.email, fullName: m.fullName, phone: m.phone, roles: m.roles, active: m.active }} />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
