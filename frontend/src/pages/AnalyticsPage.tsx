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

function defaultFrom(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Aggregate per-day rows into per-robot totals for display. */
function byRobot(rows: { robot_id: string; episodes: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.robot_id, (map.get(row.robot_id) ?? 0) + row.episodes);
  }
  return new Map([...map.entries()].sort((a, b) => b[1] - a[1]));
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Aggregated in the database over the selected range.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
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
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Requests by status</h2>
            <table className="mt-3 min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {STATUS_ORDER.map((s) => (
                  <tr key={s}>
                    <td className="py-2 capitalize text-slate-600">{s.replace("_", " ")}</td>
                    <td className="py-2 text-right font-medium text-slate-900">
                      {statuses[s] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Fulfilment speed</h2>
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-slate-600">
                Median time from <span className="font-medium">submitted</span> to{" "}
                <span className="font-medium">delivered</span>:
              </p>
              <p className="text-2xl font-semibold text-slate-900">
                {median?.median_hours != null
                  ? median.median_hours >= 1
                    ? `${median.median_hours.toFixed(1)} h`
                    : `${Math.round(median.median_seconds ?? 0)} s`
                  : "No delivered requests in range"}
              </p>
              <p className="text-xs text-slate-400">
                Based on {median?.count_requests ?? 0} delivered request(s).
              </p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">Episodes per robot</h2>
            <table className="mt-3 min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {[...robots.entries()].map(([robot, count]) => (
                  <tr key={robot}>
                    <td className="py-2 font-mono text-xs text-slate-600">{robot}</td>
                    <td className="py-2 text-right font-medium text-slate-900">{count}</td>
                  </tr>
                ))}
                {robots.size === 0 && (
                  <tr>
                    <td className="py-2 text-slate-400">No episodes in range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Top 5 tasks by good episodes
            </h2>
            <table className="mt-3 min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {query.data.top_tasks_by_good_episodes.map((t) => (
                  <tr key={t.task_name}>
                    <td className="py-2 text-slate-700">{t.task_name}</td>
                    <td className="py-2 text-right font-medium text-slate-900">
                      {t.good_episodes}
                    </td>
                  </tr>
                ))}
                {query.data.top_tasks_by_good_episodes.length === 0 && (
                  <tr>
                    <td className="py-2 text-slate-400">No good episodes in range.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </div>
      ) : null}
    </div>
  );
}
