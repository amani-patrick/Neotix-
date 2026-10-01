import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listEpisodes } from "../api/endpoints";
import {
  EmptyState,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Pagination,
  QualityBadge,
  Select,
} from "../components/ui";
import type { EpisodeQuality } from "../types/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
}

/** Read a positive integer from a param, defaulting to fallback. */
function pageParam(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function EpisodesPage() {
  const [params, setParams] = useSearchParams();

  // URL state: /episodes?task_name=pick%20cup&quality=good&page=2
  const taskName = params.get("task_name") ?? "";
  const quality = (params.get("quality") ?? "") as EpisodeQuality | "";
  const robotId = params.get("robot_id") ?? "";
  const page = pageParam(params.get("page"), 1);

  const [taskInput, setTaskInput] = useState(taskName);
  const [debouncedTask, setDebouncedTask] = useState(taskName);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedTask(taskInput.trim()), 400);
    return () => clearTimeout(t);
  }, [taskInput]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page"); // filter change resets page
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (debouncedTask !== taskName) setParam("task_name", debouncedTask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedTask]);

  const query = useQuery({
    queryKey: ["episodes", { debouncedTask, quality, robotId, page }],
    queryFn: () =>
      listEpisodes({
        task_name: debouncedTask || undefined,
        quality: quality || undefined,
        robot_id: robotId || undefined,
        page,
        page_size: 50,
      }),
    placeholderData: (prev) => prev, // keep previous page visible while loading
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Episodes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Browse recorded episode metadata. Filter by task and quality.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="w-full sm:w-64">
          <Field label="Task name">
            <Input
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              placeholder="e.g. pick cup"
            />
          </Field>
        </div>
        <div className="w-full sm:w-44">
          <Field label="Quality">
            <Select
              value={quality}
              onChange={(e) => setParam("quality", e.target.value)}
            >
              <option value="">Any quality</option>
              <option value="good">Good</option>
              <option value="usable">Usable</option>
              <option value="bad">Bad</option>
            </Select>
          </Field>
        </div>
        <div className="w-full sm:w-44">
          <Field label="Robot">
            <Select value={robotId} onChange={(e) => setParam("robot_id", e.target.value)}>
              <option value="">Any robot</option>
              <option value="arm-01">arm-01</option>
              <option value="arm-02">arm-02</option>
              <option value="arm-03">arm-03</option>
              <option value="mobile-01">mobile-01</option>
              <option value="humanoid-01">humanoid-01</option>
            </Select>
          </Field>
        </div>
      </div>

      {query.isLoading ? (
        <LoadingState label="Loading episodes…" />
      ) : query.isError ? (
        <ErrorState
          message="Something went wrong while loading episodes. Try again."
          onRetry={() => query.refetch()}
        />
      ) : (query.data?.items.length ?? 0) === 0 ? (
        <EmptyState message="No episodes match these filters." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Episode</th>
                  <th className="px-4 py-2.5">Robot</th>
                  <th className="px-4 py-2.5">Task</th>
                  <th className="px-4 py-2.5">Recorded</th>
                  <th className="px-4 py-2.5">Duration</th>
                  <th className="px-4 py-2.5">Operator</th>
                  <th className="px-4 py-2.5">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data!.items.map((ep) => (
                  <tr key={ep.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{ep.episode_id}</td>
                    <td className="px-4 py-2.5 text-slate-600">{ep.robot_id}</td>
                    <td className="px-4 py-2.5 text-slate-700">{ep.task_name}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDate(ep.recorded_at)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{formatDuration(ep.duration_seconds)}</td>
                    <td className="px-4 py-2.5 text-slate-600">{ep.operator_name}</td>
                    <td className="px-4 py-2.5">
                      <QualityBadge quality={ep.quality} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data && (
            <Pagination
              page={query.data.page}
              pages={query.data.pages}
              total={query.data.total}
              pageSize={query.data.page_size}
              onPage={(p) => setParam("page", String(p))}
            />
          )}
        </div>
      )}
    </div>
  );
}
