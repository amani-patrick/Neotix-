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

const STAT_ACCENTS = [
  "border-l-slate-300",
  "border-l-blue-400",
  "border-l-amber-400",
  "border-l-emerald-400",
];

export function DashboardPage() {
  const { user } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["requests", "dashboard"],
    queryFn: () => listRequests({ page: 1, page_size: 100 }),
    refetchInterval: 15_000,
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

  const requests = data?.items ?? [];
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

  const stats = [
    { label: isClient ? "Total requests" : "All requests", value: total },
    { label: "Active", value: active },
    { label: isClient ? "Awaiting my review" : "Delivered", value: awaitingReview },
    { label: "Completed", value: completed },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">
          {isClient ? "My requests" : "Fulfilment overview"}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {isClient
            ? "Track your dataset requests and review deliveries."
            : "All client requests and their fulfilment status."}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <StatCard key={s.label} label={s.label} value={s.value} accent={STAT_ACCENTS[i] ?? "border-l-slate-300"} />
        ))}
      </div>

      {/* Recent requests */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-800">Recent requests</h2>
          <Link to="/requests" className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">
            View all
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {isClient ? (
              <>
                No requests yet.{" "}
                <Link to="/requests/new" className="font-medium text-blue-600 hover:underline">
                  Create your first
                </Link>
              </>
            ) : (
              "No requests have been submitted yet."
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2.5">Task</th>
                  <th className="px-5 py-2.5">Needed</th>
                  <th className="px-5 py-2.5">Deadline</th>
                  <th className="px-5 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recent.map((r: RequestSummary) => (
                  <tr key={r.id} className="group transition-colors hover:bg-slate-50/80">
                    <td className="px-5 py-3">
                      <Link
                        to={`/requests/${r.id}`}
                        className="font-medium text-slate-800 hover:text-blue-600"
                      >
                        {r.task_name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-600">{r.episodes_requested}</td>
                    <td className={`px-5 py-3 tabular-nums ${isPast(r.deadline) ? "font-medium text-red-500" : "text-slate-600"}`}>
                      {formatDate(r.deadline)}
                    </td>
                    <td className="px-5 py-3">
                      <RequestStatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 border-l-[3px] ${accent}`}>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
