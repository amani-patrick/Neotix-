import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listRequests } from "../api/endpoints";
import { useAuth } from "../auth/AuthProvider";
import { ErrorState, LoadingState, RequestStatusBadge } from "../components/ui";
import type { RequestStatus, RequestSummary } from "../types/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

const ACTIVE: RequestStatus[] = ["submitted", "in_progress", "rejected"];

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["requests", "dashboard"],
    queryFn: () => listRequests(),
  });

  if (isLoading) return <LoadingState label="Loading dashboard…" />;
  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : "Something went wrong while loading the dashboard."}
        onRetry={() => refetch()}
      />
    );
  }

  const requests = data ?? [];
  const counts: Record<RequestStatus, number> = {
    submitted: 0,
    in_progress: 0,
    delivered: 0,
    accepted: 0,
    rejected: 0,
  };
  for (const r of requests) counts[r.status] += 1;

  const total = requests.length;
  const active = ACTIVE.reduce((acc, s) => acc + counts[s], 0);
  const awaitingReview = counts.delivered;
  const completed = counts.accepted;

  const recent = [...requests]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5);

  const isClient = user?.role === "client";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          {isClient ? "My requests" : "Fulfilment overview"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isClient
            ? "Track your dataset requests and review deliveries."
            : "All client requests and their fulfilment status."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label={isClient ? "Total requests" : "All requests"} value={total} />
        <StatCard label="Active" value={active} />
        <StatCard label={isClient ? "Awaiting my review" : "Delivered"} value={awaitingReview} />
        <StatCard label="Completed" value={completed} />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Recent requests</h2>
        </div>
        {requests.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            {isClient ? (
              <>
                No requests yet.{" "}
                <Link to="/requests/new" className="font-medium text-blue-600 hover:underline">
                  Create your first dataset request
                </Link>
              </>
            ) : (
              "No requests have been submitted yet."
            )}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Task</th>
                <th className="px-4 py-2.5">Needed</th>
                <th className="px-4 py-2.5">Deadline</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recent.map((r: RequestSummary) => (
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
                  <td className={`px-4 py-3 ${isPast(r.deadline) ? "font-medium text-red-600" : "text-slate-700"}`}>
                    {formatDate(r.deadline)}
                  </td>
                  <td className="px-4 py-3">
                    <RequestStatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
