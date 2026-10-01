import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAnalytics } from "../api/endpoints";
import { Button, ErrorState, Field, Input, LoadingState } from "../components/ui";
import type { RequestStatus } from "../types/api";

const STATUS_ORDER: RequestStatus[] = [
  "submitted",
  "in_progress",
  "delivered",
  "accepted",
  "rejected",
];

const STATUS_BAR_COLORS: Record<RequestStatus, string> = {
  submitted: "bg-slate-300",
  in_progress: "bg-blue-400",
  delivered: "bg-amber-400",
  accepted: "bg-emerald-400",
  rejected: "bg-red-400",
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted",
  in_progress: "In Progress",
  delivered: "Delivered",
  accepted: "Accepted",
  rejected: "Rejected",
};

function defaultFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function byRobot(rows: { robot_id: string; episodes: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.robot_id, (map.get(row.robot_id) ?? 0) + row.episodes);
  }
  return new Map([...map.entries()].sort((a, b) => b[1] - a[1]));
}

function BarRow({
  label,
  value,
  max,
  barClass,
}: {
  label: string;
  value: number;
  max: number;
  barClass: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-28 shrink-0 truncate text-xs text-slate-600">{label}</span>
      <div className="flex-1 rounded-full bg-slate-100" style={{ height: 6 }}>
        <div
          className={`h-full rounded-full transition-all ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums text-slate-700">
        {value}
      </span>
    </div>
  );
}

export function AnalyticsPage() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());

  const query = useQuery({
    queryKey: ["analytics", { from, to }],
    queryFn: () => getAnalytics(`${from}T00:00:00Z`, `${to}T23:59:59Z`),
    enabled: Boolean(from && to),
  });

  const robots = query.data ? byRobot(query.data.episodes_per_day_robot) : new Map();
  const statuses = query.data?.requests_by_status ?? {};
  const median = query.data?.median_submitted_to_delivered;

  const maxStatus = Math.max(0, ...STATUS_ORDER.map((s) => statuses[s] ?? 0));
  const maxRobot = Math.max(0, ...[...robots.values()]);
  const topTasks = query.data?.top_tasks_by_good_episodes ?? [];
  const maxTask = Math.max(0, ...topTasks.map((t) => t.good_episodes));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Aggregated metrics over the selected date range.
        </p>
      </div>

      {/* Date range filter */}
      <form
        className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3.5"
        onSubmit={(e) => e.preventDefault()}
      >
        <div className="w-full sm:w-44">
          <Field label="From">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
        </div>
        <div className="w-full sm:w-44">
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <Button variant="secondary" onClick={() => query.refetch()}>
          Apply
        </Button>
      </form>

      {query.isLoading ? (
        <LoadingState label="Loading analytics…" />
      ) : query.isError ? (
        <ErrorState
          message="Something went wrong while loading analytics."
          onRetry={() => query.refetch()}
        />
      ) : query.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Requests by status */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-800">Requests by status</h2>
            <div className="mt-4 space-y-0.5 divide-y divide-slate-50">
              {STATUS_ORDER.map((s) => (
                <BarRow
                  key={s}
                  label={STATUS_LABELS[s]}
                  value={statuses[s] ?? 0}
                  max={maxStatus}
                  barClass={STATUS_BAR_COLORS[s]}
                />
              ))}
            </div>
          </section>

          {/* Fulfilment speed */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-800">Fulfilment speed</h2>
            <div className="mt-4 space-y-2">
              <p className="text-xs text-slate-500">
                Median time from <span className="font-medium text-slate-700">submitted</span> to{" "}
                <span className="font-medium text-slate-700">delivered</span>
              </p>
              <p className="text-3xl font-semibold tabular-nums text-slate-900">
                {median?.median_hours != null
                  ? median.median_hours >= 1
                    ? `${median.median_hours.toFixed(1)}`
                    : `${Math.round(median.median_seconds ?? 0)}`
                  : "—"}
                <span className="ml-1 text-lg font-normal text-slate-400">
                  {median?.median_hours != null
                    ? median.median_hours >= 1
                      ? "hrs"
                      : "sec"
                    : ""}
                </span>
              </p>
              {median?.median_hours == null && (
                <p className="text-sm text-slate-400">No delivered requests in range</p>
              )}
              <p className="text-xs text-slate-400">
                Based on {median?.count_requests ?? 0} delivered request(s)
              </p>
            </div>
          </section>

          {/* Episodes per robot */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-800">Episodes per robot</h2>
            {robots.size === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No episodes in range.</p>
            ) : (
              <div className="mt-4 space-y-0.5 divide-y divide-slate-50">
                {[...robots.entries()].map(([robot, count]) => (
                  <BarRow
                    key={robot}
                    label={robot}
                    value={count}
                    max={maxRobot}
                    barClass="bg-blue-400"
                  />
                ))}
              </div>
            )}
          </section>

          {/* Top tasks */}
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-800">Top 5 tasks by good episodes</h2>
            {topTasks.length === 0 ? (
              <p className="mt-4 text-sm text-slate-400">No good episodes in range.</p>
            ) : (
              <div className="mt-4 space-y-0.5 divide-y divide-slate-50">
                {topTasks.map((t) => (
                  <BarRow
                    key={t.task_name}
                    label={t.task_name}
                    value={t.good_episodes}
                    max={maxTask}
                    barClass="bg-emerald-400"
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
