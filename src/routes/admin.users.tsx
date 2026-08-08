import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { UserPlus, Pencil, X, ShieldCheck, ShieldAlert, Eye, EyeOff } from "lucide-react";
import { USERS, type User, type AdminType } from "@/lib/mock-data";
import { Card, SectionTitle, PrimaryButton, GhostButton, Pill } from "@/components/verbo/ui";
import { useAuth } from "@/lib/auth";
import {
  hydrateAdminRoles, getAdminType, subscribeUsers,
  createInternalUser, updateInternalUser,
  isUserDeactivated, setUserDeactivated,
} from "@/lib/admin-roles";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({
  head: () => ({
    meta: [
      { title: "User Management — Admin" },
      { name: "description", content: "Create and manage internal Super Admin and Coordinator accounts." },
    ],
  }),
  component: UsersPage,
});

function roleLabel(u: User): string {
  if (u.role === "admin") {
    if (u.admin_type === "coordinator_ops") return "Coordinator";
    if (u.admin_type === "coordinator_fin") return "Coordinator";
    return "Super Admin";
  }
  if (u.role === "teacher") return "Teacher";
  return "Student";
}

function coordTypeLabel(u: User): string {
  if (u.admin_type === "coordinator_ops") return "Operations";
  if (u.admin_type === "coordinator_fin") return "Financial";
  return "—";
}

function UsersPage() {
  hydrateAdminRoles();
  const { user } = useAuth();
  const adminType = getAdminType(user);
  const [, force] = useState(0);
  useEffect(() => subscribeUsers(() => force((n) => n + 1)), []);

  const rows = useMemo(() => USERS.slice(), []);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  if (adminType && adminType !== "super_admin") {
    return <Navigate to="/admin" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">User Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage internal operations accounts (Super Admin, Coordinators).
            Teachers and Students are created from their dedicated flows:{" "}
            <Link to="/admin/teachers" className="underline">Teachers</Link> ·{" "}
            <Link to="/admin/students" className="underline">Students</Link>.
          </p>
        </div>
        <PrimaryButton onClick={() => setCreateOpen(true)}>
          <UserPlus className="h-4 w-4" /> Create user
        </PrimaryButton>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Name</th>
                <th className="px-4 py-3 text-left font-medium">Email</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Coordinator Type</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const deactivated = isUserDeactivated(u.id);
                const isInternal = u.role === "admin";
                return (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-foreground">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      {u.role === "admin" && u.admin_type === "super_admin" ? (
                        <Pill tone="warning">Super Admin</Pill>
                      ) : u.role === "admin" ? (
                        <Pill tone="default">Coordinator</Pill>
                      ) : (
                        <Pill tone="muted">{roleLabel(u)}</Pill>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{isInternal ? coordTypeLabel(u) : "—"}</td>
                    <td className="px-4 py-3">
                      {deactivated ? <Pill tone="danger">Deactivated</Pill> : <Pill tone="success">Active</Pill>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {isInternal && (
                          <button
                            onClick={() => setEditing(u)}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1 text-xs hover:bg-secondary"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </button>
                        )}
                        {u.id !== user?.id && (
                          <button
                            onClick={() => {
                              setUserDeactivated(u.id, !deactivated);
                              toast.success(deactivated ? "User reactivated." : "User deactivated.");
                            }}
                            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${
                              deactivated
                                ? "border border-success/40 bg-success/10 text-success hover:bg-success/15"
                                : "border border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/15"
                            }`}
                          >
                            {deactivated ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                            {deactivated ? "Reactivate" : "Deactivate"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {createOpen && (
        <CreateUserModal onClose={() => setCreateOpen(false)} />
      )}
      {editing && (
        <EditUserModal user={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function CreateUserModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Single unified "Role" field for internal users:
  //   "super_admin"  → Super Admin
  //   "coordinator"  → Coordinator (requires a type below)
  const [uiRole, setUiRole] = useState<"super_admin" | "coordinator">("super_admin");
  const [coordType, setCoordType] = useState<"operations" | "financial" | "">("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    name.trim() && email.trim() && password.length >= 6 &&
    (uiRole === "super_admin" || (uiRole === "coordinator" && coordType !== ""));

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const finalAdminType: AdminType =
      uiRole === "super_admin"
        ? "super_admin"
        : coordType === "operations" ? "coordinator_ops" : "coordinator_fin";
    const res = await createInternalUser({
      name, email, password, role: "admin", admin_type: finalAdminType,
    });
    setSubmitting(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("User created.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div className="w-full max-w-lg rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">Create user</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Password</label>
              <div className="relative mt-1">
                <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm" />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground" aria-label="Toggle password">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">At least 6 characters.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground">Role</label>
            <select value={uiRole}
              onChange={(e) => {
                const v = e.target.value as "super_admin" | "coordinator";
                setUiRole(v);
                if (v === "super_admin") setCoordType("");
              }}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="super_admin">Super Admin</option>
              <option value="coordinator">Coordinator</option>
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
              Teacher and Student accounts are created from their dedicated flows:
              Admin &gt; Teachers &gt; Register Teacher and Admin &gt; Students &gt; Register Student.
            </p>
          </div>

          {uiRole === "coordinator" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Coordinator type</label>
              <select value={coordType}
                onChange={(e) => setCoordType(e.target.value as "operations" | "financial" | "")}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="">Select a type…</option>
                <option value="operations">Operations — full nav except Financial</option>
                <option value="financial">Financial — Money Lab &amp; KPIs only</option>
              </select>
              {coordType === "" && (
                <p className="mt-1 text-xs text-destructive">Coordinator type is required.</p>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <GhostButton onClick={onClose} disabled={submitting}>Cancel</GhostButton>
          <PrimaryButton onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? "Creating…" : "Create user"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [name, setName] = useState(user.name);
  const currentType: AdminType = (user.admin_type as AdminType) ?? "super_admin";
  const [adminType, setAdminType] = useState<AdminType>(currentType);

  const save = () => {
    const res = updateInternalUser(user.id, { name, admin_type: adminType });
    if (!res.ok) { toast.error(res.error); return; }
    toast.success("User updated.");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center verbo-backdrop p-4">
      <div className="w-full max-w-md rounded-2xl bg-card shadow-elevated">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-base font-semibold">Edit user</h3>
          <button onClick={onClose} className="rounded-md p-1 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Email</label>
            <input value={user.email} disabled
              className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground">Admin type</label>
            <select value={adminType} onChange={(e) => setAdminType(e.target.value as AdminType)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="super_admin">Super Admin (full access)</option>
              <option value="coordinator_ops">Coordinator — Operations</option>
              <option value="coordinator_fin">Coordinator — Financial</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save}>Save changes</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
