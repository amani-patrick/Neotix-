import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { listRequests } from "../api/endpoints";
import { useAuth } from "../auth/AuthProvider";
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Pagination,
  RequestStatusBadge,
  Select,
  SkeletonRows,
} from "../components/ui";
import type { RequestStatus } from "../types/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "in_progress", label: "In Progress" },
  { value: "delivered", label: "Delivered" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
];

function pageParam(value: string | null): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function RequestsPage() {
  const { user } = useAuth();
  const isClient = user?.role === "client";
  const [params, setParams] = useSearchParams();

  // URL state: /requests?status=submitted&page=2 (refresh-safe, shareable)
  const status = params.get("status") ?? "";
  const page = pageParam(params.get("page"));

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page"); // filter change resets page
    setParams(next, { replace: true });
  };

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["requests", "list", { status, page }],
    queryFn: () =>
      listRequests({
        status: (status || undefined) as RequestStatus | undefined,
        page,
        page_size: 20,
      }),
    placeholderData: (prev) => prev,
  });

  const requests = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Requests</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isClient ? "Your dataset requests." : "All client requests."}
          </p>
        </div>
        {isClient && (
          <Link to="/requests/new">
            <Button>New Request</Button>
          </Link>
        )}
      </div>        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="w-full sm:w-48">
            <label htmlFor="status-filter" className="mb-1 block text-sm font-medium text-slate-700">
              Status
            </label>
            <Select
              id="status-filter"
              value={status}
              onChange={(e) => setParam("status", e.target.value)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

      {isLoading ? (
        <LoadingState label="Loading requests…" />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : "Something went wrong while loading requests."}
          onRetry={() => refetch()}
        />
      ) : requests.length === 0 ? (
        <EmptyState
          message={
            status
              ? "No requests match your filters."
              : isClient
                ? "No requests yet. Create your first dataset request."
                : "No requests have been submitted yet."
          }
          action={
            isClient && !status ? (
              <Link to="/requests/new">
                <Button>Create request</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Desktop table (md and up) */}
          <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Task</th>
                    <th className="px-4 py-2.5">Requested</th>
                    <th className="px-4 py-2.5">Assigned</th>
                    {!isClient && <th className="px-4 py-2.5">Remaining</th>}
                    <th className="px-4 py-2.5">Deadline</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Created</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isFetching && <SkeletonRows cols={isClient ? 7 : 8} rows={3} />}
                  {!isFetching &&
                    requests.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <Link
                            to={`/requests/${r.id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            {r.task_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{r.episodes_requested}</td>
                        <td className="px-4 py-3 text-slate-700">{r.assigned_episode_count}</td>
                        {!isClient && (
                          <td className="px-4 py-3 text-slate-700">
                            {Math.max(0, r.episodes_requested - r.assigned_episode_count)}
                          </td>
                        )}
                        <td className="px-4 py-3 text-slate-700">{formatDate(r.deadline)}</td>
                        <td className="px-4 py-3">
                          <RequestStatusBadge status={r.status} />
                        </td>
                        <td className="px-4 py-3 text-slate-500">{formatDate(r.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/requests/${r.id}`}
                            className="text-sm font-medium text-blue-600 hover:underline"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {data && (
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                pageSize={data.page_size}
                onPage={(p) => setParam("page", String(p))}
              />
            )}
          </div>

          {/* Mobile cards (below md) */}
          <div className="space-y-3 md:hidden">
            {isFetching && <LoadingState label="Loading requests…" />}
            {!isFetching &&
              requests.map((r) => (
                <Link
                  key={r.id}
                  to={`/requests/${r.id}`}
                  className="block rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-blue-600">{r.task_name}</span>
                    <RequestStatusBadge status={r.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Requested</dt>
                      <dd className="font-medium text-slate-800">{r.episodes_requested}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Assigned</dt>
                      <dd className="font-medium text-slate-800">{r.assigned_episode_count}</dd>
                    </div>
                    {!isClient && (
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Remaining</dt>
                        <dd className="font-medium text-slate-800">
                          {Math.max(0, r.episodes_requested - r.assigned_episode_count)}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Deadline</dt>
                      <dd className="font-medium text-slate-800">{formatDate(r.deadline)}</dd>
                    </div>
                  </dl>
                </Link>
              ))}
            {data && (
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                pageSize={data.page_size}
                onPage={(p) => setParam("page", String(p))}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
