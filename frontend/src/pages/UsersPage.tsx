import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, listUsers, updateUser } from "../api/endpoints";
import { ApiRequestError } from "../api/client";
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Select,
} from "../components/ui";
import type { UserRecord, UserRole } from "../types/api";

const ROLES: UserRole[] = ["client", "operator", "admin"];

const EMPTY_FORM = {
  name: "",
  email: "",
  password: "",
  role: "client" as UserRole,
  organization: "",
};

export function UsersPage() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ["users"], queryFn: listUsers });

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<UserRecord | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users"] });

  const create = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setFormError(null);
      invalidate();
    },
    onError: (err) =>
      setFormError(err instanceof ApiRequestError ? err.message : "Could not create the user."),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { is_active?: boolean; role?: UserRole } }) =>
      updateUser(id, body),
    onSuccess: () => {
      setActionError(null);
      setDeactivateTarget(null);
      invalidate();
    },
    onError: (err) => {
      setDeactivateTarget(null);
      setActionError(err instanceof ApiRequestError ? err.message : "Could not update the user.");
    },
  });

  const onCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || form.password.length < 8) {
      setFormError("Name, email, and a password of at least 8 characters are required.");
      return;
    }
    create.mutate({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      organization: form.organization.trim() || undefined,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Manage accounts and roles.</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Close" : "New user"}
        </Button>
      </div>

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {actionError}
        </div>
      )}

      {showCreate && (
        <form
          onSubmit={onCreate}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-4"
          noValidate
        >
          <h2 className="text-sm font-semibold text-slate-900">Create a user</h2>
          {formError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {formError}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </Field>
            <Field label="Password (min 8 characters)">
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </Field>
            <Field label="Role">
              <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as UserRole }))}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Organization (optional)">
              <Input
                value={form.organization}
                onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button type="submit" pending={create.isPending} pendingLabel="Creating…">
              Create user
            </Button>
          </div>
        </form>
      )}

      {users.isLoading ? (
        <LoadingState label="Loading users…" />
      ) : users.isError ? (
        <ErrorState message="Could not load users." onRetry={() => users.refetch()} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Name</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Organization</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(users.data ?? []).map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                    <td className="px-4 py-2.5">
                      <Select
                        aria-label={`Role for ${u.name}`}
                        className="w-32"
                        value={u.role}
                        onChange={(e) =>
                          patch.mutate({ id: u.id, body: { role: e.target.value as UserRole } })
                        }
                        disabled={patch.isPending}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{u.organization ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
                          u.is_active
                            ? "bg-green-50 text-green-700 ring-green-200"
                            : "bg-slate-100 text-slate-500 ring-slate-200"
                        }`}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.is_active ? (
                        <Button
                          variant="secondary"
                          onClick={() => setDeactivateTarget(u)}
                          disabled={patch.isPending}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => patch.mutate({ id: u.id, body: { is_active: true } })}
                          disabled={patch.isPending}
                        >
                          Reactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deactivateTarget !== null}
        title="Deactivate this user?"
        message={`${deactivateTarget?.name ?? "This user"} will no longer be able to log in or use the system.`}
        confirmLabel="Deactivate"
        danger
        pending={patch.isPending}
        pendingLabel="Deactivating…"
        onConfirm={() => {
          if (deactivateTarget) patch.mutate({ id: deactivateTarget.id, body: { is_active: false } });
        }}
        onCancel={() => setDeactivateTarget(null)}
      />
    </div>
  );
}
