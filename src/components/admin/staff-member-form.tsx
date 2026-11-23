"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveStaffMember, type TeamFormState } from "@/server/team/actions";

const ROLES = [
  ["owner", "Owner"],
  ["admin", "Admin"],
  ["staff", "Staff / volunteer"],
  ["reviewer", "Reviewer (no contact details)"],
] as const;

export function StaffMemberForm({
  member,
}: {
  member?: { email: string; fullName: string; phone: string | null; roles: string[]; active: boolean };
}) {
  const [state, action, pending] = useActionState<TeamFormState, FormData>(saveStaffMember, {});
  const idp = member ? member.email.replace(/\W/g, "") : "new";
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_1fr_8rem_auto] md:items-end">
      <div className="space-y-1">
        <label htmlFor={`${idp}-email`} className="text-xs font-semibold">
          Email
        </label>
        <Input id={`${idp}-email`} name="email" type="email" required defaultValue={member?.email} readOnly={Boolean(member)} />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idp}-name`} className="text-xs font-semibold">
          Name
        </label>
        <Input id={`${idp}-name`} name="fullName" required defaultValue={member?.fullName} />
      </div>
      <div className="space-y-1">
        <label htmlFor={`${idp}-phone`} className="text-xs font-semibold">
          Phone
        </label>
        <Input id={`${idp}-phone`} name="phone" defaultValue={member?.phone ?? ""} />
      </div>
      <Button type="submit" disabled={pending}>
        {member ? "Save" : "Add"}
      </Button>
      <fieldset className="flex flex-wrap gap-4 md:col-span-4">
        <legend className="sr-only">Roles</legend>
        {ROLES.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="roles" value={value} defaultChecked={member?.roles.includes(value)} className="size-4" />
            {label}
          </label>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={member ? member.active : true} className="size-4" /> Active
        </label>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-sm text-destructive md:col-span-4">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm text-green-800 md:col-span-4">
          Saved.
        </p>
      )}
    </form>
  );
}
