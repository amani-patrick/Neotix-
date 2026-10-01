import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { createRequest } from "../api/endpoints";
import { ApiRequestError as ApiClientError } from "../api/client";
import { Button, Field, Input } from "../components/ui";

interface FormState {
  task_name: string;
  episodes_requested: string;
  deadline: string;
  notes: string;
}

export function CreateRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>({
    task_name: "",
    episodes_requested: "",
    deadline: "",
    notes: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createRequest,
    onSuccess: (created) => {
      // Refresh affected queries, then land on the detail page.
      queryClient.invalidateQueries({ queryKey: ["requests"] });
      navigate(`/requests/${created.id}`, { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.status === 422) {
        setFormError(err.message);
      } else if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError("The server is currently unavailable. Please try again.");
      }
    },
  });

  const set = (key: keyof FormState) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.task_name.trim()) errors.task_name = "Task name is required";
    const count = Number(form.episodes_requested);
    if (!form.episodes_requested || !Number.isInteger(count) || count <= 0) {
      errors.episodes_requested = "Enter a positive whole number of episodes";
    }
    if (!form.deadline) {
      errors.deadline = "Deadline is required";
    } else if (Number.isNaN(new Date(form.deadline).getTime())) {
      errors.deadline = "Enter a valid date";
    }
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    mutation.mutate({
      task_name: form.task_name.trim(),
      episodes_requested: count,
      deadline: new Date(`${form.deadline}T23:59:59Z`).toISOString(),
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">New dataset request</h1>
        <p className="mt-1 text-sm text-slate-500">
          Describe what you need. Operators fulfil requests by assigning existing
          episodes that match the task.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
        noValidate
      >
        {formError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {formError}
          </div>
        )}

        <Field label="Task name" error={fieldErrors.task_name}>
          <Input
            value={form.task_name}
            onChange={(e) => set("task_name")(e.target.value)}
            placeholder="e.g. pick cup"
          />
        </Field>

        <Field label="Episodes requested" error={fieldErrors.episodes_requested}>
          <Input
            type="number"
            min={1}
            step={1}
            value={form.episodes_requested}
            onChange={(e) => set("episodes_requested")(e.target.value)}
            placeholder="200"
          />
        </Field>

        <Field label="Deadline" error={fieldErrors.deadline}>
          <Input
            type="date"
            value={form.deadline}
            onChange={(e) => set("deadline")(e.target.value)}
          />
        </Field>

        <Field label="Notes (optional)" error={fieldErrors.notes}>
          <Input
            value={form.notes}
            onChange={(e) => set("notes")(e.target.value)}
            placeholder="Anything the operators should know"
          />
        </Field>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" pending={mutation.isPending} pendingLabel="Submitting…">
            Create request
          </Button>
        </div>
      </form>
    </div>
  );
}

