import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import {
  assignEpisode,
  getRequest,
  listEpisodes,
  transitionRequest,
} from "../api/endpoints";
import { ApiRequestError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Pagination,
  QualityBadge,
  RequestStatusBadge,
  Select,
  SkeletonRows,
} from "../components/ui";
import type { EpisodeQuality, RequestStatus } from "../types/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- assignment panel (operator) ---------------------------------------------

function AssignmentPanel({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const [taskName, setTaskName] = useState("");
  const [debouncedTask, setDebouncedTask] = useState("");
  const [quality, setQuality] = useState<EpisodeQuality | "">("");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);

  // Debounce the task-name filter (spec 12.7).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedTask(taskName.trim()), 400);
    return () => clearTimeout(t);
  }, [taskName]);

  const episodes = useQuery({
    queryKey: ["episodes", { debouncedTask, quality, page }],
    queryFn: () =>
      listEpisodes({
        task_name: debouncedTask || undefined,
        quality: quality || undefined,
        page,
        page_size: 10,
      }),
  });

  const assign = useMutation({
    mutationFn: (episodeId: string) => assignEpisode(requestId, episodeId),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["request", requestId] });
      queryClient.invalidateQueries({ queryKey: ["episodes"] });
    },
    onError: (err) => {
      if (err instanceof ApiRequestError && err.status === 409) {
        setActionError("Episode is no longer available. Refresh the results.");
        queryClient.invalidateQueries({ queryKey: ["episodes"] });
      } else if (err instanceof ApiRequestError) {
        setActionError(err.message);
      } else {
        setActionError("The server is currently unavailable. Please try again.");
      }
    },
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Assign episodes</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Find episodes matching the task and assign them to this request.
        </p>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-56">
            <Field label="Task name">
              <Input
                value={taskName}
                onChange={(e) => {
                  setTaskName(e.target.value);
                  setPage(1);
                }}
                placeholder="e.g. pick cup"
              />
            </Field>
          </div>
          <div className="w-full sm:w-40">
            <Field label="Quality">
              <Select
                value={quality}
                onChange={(e) => {
                  setQuality(e.target.value as EpisodeQuality | "");
                  setPage(1);
                }}
              >
                <option value="">Any quality</option>
                <option value="good">Good</option>
                <option value="usable">Usable</option>
              </Select>
            </Field>
          </div>
        </div>

        {actionError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {actionError}
          </div>
        )}

        {episodes.isLoading ? (
          <table className="min-w-full text-sm">
            <tbody>
              <SkeletonRows cols={6} rows={4} />
            </tbody>
          </table>
        ) : episodes.isError ? (
          <ErrorState
            message="Could not load episodes."
            onRetry={() => episodes.refetch()}
          />
        ) : (episodes.data?.items.length ?? 0) === 0 ? (
          <EmptyState message="No episodes match these filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Episode</th>
                    <th className="px-3 py-2">Robot</th>
                    <th className="px-3 py-2">Task</th>
                    <th className="px-3 py-2">Quality</th>
                    <th className="px-3 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {episodes.data!.items.map((ep) => (
                    <tr key={ep.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{ep.episode_id}</td>
                      <td className="px-3 py-2 text-slate-600">{ep.robot_id}</td>
                      <td className="px-3 py-2 text-slate-700">{ep.task_name}</td>
                      <td className="px-3 py-2">
                        <QualityBadge quality={ep.quality} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="secondary"
                          pending={assign.isPending && assign.variables === ep.episode_id}
                          pendingLabel="Assigning…"
                          onClick={() => assign.mutate(ep.episode_id)}
                        >
                          Assign
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {episodes.data && (
              <Pagination
                page={episodes.data.page}
                pages={episodes.data.pages}
                total={episodes.data.total}
                pageSize={episodes.data.page_size}
                onPage={setPage}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

// --- page ---------------------------------------------------------------------

const STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted",
  in_progress: "In Progress",
  delivered: "Delivered",
  accepted: "Accepted",
  rejected: "Rejected",
};

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<"accept" | "reject" | "deliver" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const request = useQuery({
    queryKey: ["request", id],
    queryFn: () => getRequest(id!),
    enabled: Boolean(id),
  });

  const transition = useMutation({
    mutationFn: ({ status, reason }: { status: RequestStatus; reason?: string }) =>
      transitionRequest(id!, status, reason),
    onSuccess: () => {
      setConfirmAction(null);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["request", id] });
      queryClient.invalidateQueries({ queryKey: ["requests"] });
    },
    onError: (err) => {
      setConfirmAction(null);
      setActionError(
        err instanceof ApiRequestError
          ? err.message
          : "The server is currently unavailable. Please try again.",
      );
    },
  });

  if (request.isLoading) return <LoadingState label="Loading request…" />;

  // Cross-client access (403/404): show nothing partial.
  if (request.isError) {
    const status = request.error instanceof ApiRequestError ? request.error.status : undefined;
    if (status === 403 || status === 404) {
      return (
        <EmptyState message="Request unavailable." />
      );
    }
    return (
      <ErrorState
        message="Something went wrong while loading this request."
        onRetry={() => request.refetch()}
      />
    );
  }
  if (!request.data) return null;

  const r = request.data;
  const isClient = user?.role === "client";
  const isOperator = user?.role === "operator" || user?.role === "admin";
  const assigned = r.assigned_episode_count;
  const pct = r.episodes_requested > 0 ? Math.min(100, Math.round((assigned / r.episodes_requested) * 100)) : 0;
  const remaining = Math.max(0, r.episodes_requested - assigned); // presentation only

  const canStartWork = isOperator && r.status === "submitted";
  const canResume = isOperator && r.status === "rejected";
  const canDeliver = isOperator && r.status === "in_progress";
  const canReview = isClient && r.status === "delivered";
  const readyForDelivery = assigned >= r.episodes_requested;

  const runTransition = (status: RequestStatus, reason?: string) => {
    transition.mutate({ status, reason });
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/requests" className="text-sm text-slate-500 hover:text-slate-700">
          ← All requests
        </Link>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{r.task_name}</h1>
            <p className="mt-1 text-sm text-slate-500">
              Deadline {formatDate(r.deadline)} · Created {formatDate(r.created_at)}
            </p>
          </div>
          <RequestStatusBadge status={r.status} />
        </div>
      </div>

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {actionError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="order-2 space-y-6 lg:order-1 lg:col-span-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-end justify-between gap-2 text-sm">
              <span className="font-medium text-slate-700">
                {assigned} / {r.episodes_requested} assigned
              </span>
              {isOperator && r.status === "in_progress" && readyForDelivery && (
                <span className="font-medium text-green-700">Ready for delivery</span>
              )}
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div
                className={`h-full rounded-full ${readyForDelivery ? "bg-green-500" : "bg-blue-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-2 text-sm text-slate-500">Remaining: {remaining}</p>
            {r.notes && <p className="mt-3 text-sm text-slate-600">{r.notes}</p>}
          </section>

          {isOperator && (r.status === "in_progress" || r.status === "submitted") && (
            <AssignmentPanel requestId={r.id} />
          )}

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Assigned episodes</h2>
            </div>
            {r.assignments.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                No episodes have been assigned yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Episode</th>
                      <th className="px-4 py-2">Robot</th>
                      <th className="px-4 py-2">Task</th>
                      <th className="px-4 py-2">Quality</th>
                      <th className="px-4 py-2">Assigned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {r.assignments.map((a) => (
                      <tr key={a.id}>
                        <td className="px-4 py-2 font-mono text-xs text-slate-700">
                          {a.episode?.episode_id ?? a.episode_id}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{a.episode?.robot_id ?? "—"}</td>
                        <td className="px-4 py-2 text-slate-700">{a.episode?.task_name ?? "—"}</td>
                        <td className="px-4 py-2">
                          {a.episode ? <QualityBadge quality={a.episode.quality} /> : "—"}
                        </td>
                        <td className="px-4 py-2 text-slate-500">{formatDateTime(a.assigned_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Status history</h2>
            </div>
            <ol className="divide-y divide-slate-100">
              {r.status_history.map((h) => (
                <li key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="text-slate-700">
                    {h.from_status ? `${STATUS_LABELS[h.from_status]} → ` : ""}
                    <span className="font-medium">{STATUS_LABELS[h.to_status]}</span>
                    {h.reason && <span className="text-slate-500"> · {h.reason}</span>}
                  </span>
                  <span className="text-slate-400">{formatDateTime(h.changed_at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="order-1 space-y-4 lg:order-2">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Actions</h2>

            <div className="mt-3 space-y-2">
              {canStartWork && (
                <Button className="w-full" pending={transition.isPending} pendingLabel="Starting…"
                  onClick={() => runTransition("in_progress")}>
                  Start Work
                </Button>
              )}
              {canResume && (
                <Button className="w-full" pending={transition.isPending} pendingLabel="Resuming…"
                  onClick={() => runTransition("in_progress")}>
                  Resume Work
                </Button>
              )}
              {canDeliver && (
                <Button
                  className="w-full"
                  onClick={() => setConfirmAction("deliver")}
                  title={readyForDelivery ? undefined : "Assign enough episodes first"}
                >
                  Deliver
                </Button>
              )}
              {canReview && (
                <>
                  <Button className="w-full" onClick={() => setConfirmAction("accept")}>
                    Accept
                  </Button>
                  <Button variant="danger" className="w-full" onClick={() => setConfirmAction("reject")}>
                    Reject
                  </Button>
                </>
              )}
              {!canStartWork && !canResume && !canDeliver && !canReview && (
                <p className="text-sm text-slate-500">
                  No actions available for this request in its current state.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <h2 className="text-sm font-semibold text-slate-900">Details</h2>
            <dl className="mt-3 space-y-2">
              <Detail label="Requested">{r.episodes_requested}</Detail>
              <Detail label="Assigned">{assigned}</Detail>
              <Detail label="Status">
                <RequestStatusBadge status={r.status} />
              </Detail>
              <Detail label="Deadline">{formatDate(r.deadline)}</Detail>
            </dl>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === "deliver"}
        title="Deliver this request?"
        message={
          readyForDelivery
            ? `All ${r.episodes_requested} episodes are assigned. Deliver to the client for review?`
            : `Only ${assigned} of ${r.episodes_requested} episodes are assigned. The backend will reject delivery until enough episodes are assigned.`
        }
        confirmLabel="Deliver"
        pending={transition.isPending}
        pendingLabel="Delivering…"
        onConfirm={() => runTransition("delivered")}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "accept"}
        title="Accept this delivery?"
        message="The request will be marked as accepted. This cannot be undone."
        confirmLabel="Accept"
        pending={transition.isPending}
        pendingLabel="Accepting…"
        onConfirm={() => runTransition("accepted")}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmDialog
        open={confirmAction === "reject"}
        title="Reject this delivery?"
        message="This will return the request to the work queue."
        confirmLabel="Reject"
        danger
        pending={transition.isPending}
        pendingLabel="Rejecting…"
        onConfirm={() => runTransition("rejected")}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{children}</dd>
    </div>
  );
}
