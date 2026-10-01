import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import type { EpisodeQuality, RequestStatus } from "../../types/api";

// --- primitives -------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  variant = "primary",
  pending = false,
  pendingLabel,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  pending?: boolean;
  pendingLabel?: string;
}) {
  const styles: Record<ButtonVariant, string> = {
    primary:
      "bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 focus-visible:outline-blue-600",
    secondary:
      "bg-white text-slate-700 border border-slate-200 shadow-sm hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-slate-400",
    danger:
      "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:outline-red-600",
    ghost:
      "text-slate-600 hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-slate-400",
  };
  const isPending = pending && pendingLabel !== undefined;
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      disabled={disabled || pending}
      {...props}
    >
      {isPending && <Spinner className="h-3.5 w-3.5" />}
      {isPending ? pendingLabel : children}
    </button>
  );
}

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-80"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z"
      />
    </svg>
  );
}

// --- states ------------------------------------------------------------------

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-400" role="status">
      <Spinner className="h-5 w-5" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className="px-4 py-3">
              <div
                className="h-3.5 animate-pulse rounded-full bg-slate-100"
                style={{ width: `${60 + ((i * 3 + j * 7) % 35)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-6 py-10 text-center"
      role="alert"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
        <svg
          className="h-4 w-4 text-red-600"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-.75-9.25a.75.75 0 0 1 1.5 0v3.5a.75.75 0 0 1-1.5 0v-3.5zm.75 6a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <p className="text-sm text-red-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
        <svg
          className="h-4 w-4 text-slate-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2H3V4zm0 4h14v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z" />
        </svg>
      </div>
      <p className="text-sm text-slate-500">{message}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

// --- badges -------------------------------------------------------------------

const STATUS_STYLES: Record<RequestStatus, string> = {
  submitted: "bg-slate-100 text-slate-600",
  in_progress: "bg-blue-50 text-blue-700",
  delivered: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-600",
};

const STATUS_DOT: Record<RequestStatus, string> = {
  submitted: "bg-slate-400",
  in_progress: "bg-blue-500",
  delivered: "bg-amber-500",
  accepted: "bg-emerald-500",
  rejected: "bg-red-500",
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted",
  in_progress: "In Progress",
  delivered: "Delivered",
  accepted: "Accepted",
  rejected: "Rejected",
};

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

const QUALITY_STYLES: Record<EpisodeQuality, string> = {
  good: "bg-emerald-50 text-emerald-700",
  usable: "bg-amber-50 text-amber-700",
  bad: "bg-red-50 text-red-600",
};

const QUALITY_LABELS: Record<EpisodeQuality, string> = {
  good: "Good",
  usable: "Usable",
  bad: "Bad",
};

export function QualityBadge({ quality }: { quality: EpisodeQuality }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${QUALITY_STYLES[quality]}`}
    >
      {QUALITY_LABELS[quality]}
    </span>
  );
}

// --- dialogs / pagination -------------------------------------------------------

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  pending = false,
  pendingLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  pendingLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/5">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            pending={pending}
            pendingLabel={pendingLabel}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const windowStart = Math.max(1, Math.min(page - 2, pages - 4));
  const windowEnd = Math.min(pages, windowStart + 4);
  const pageNumbers: number[] = [];
  for (let p = windowStart; p <= windowEnd; p++) pageNumbers.push(p);

  return (
    <nav
      className="flex flex-col items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm sm:flex-row sm:justify-between"
      aria-label="Pagination"
    >
      <span className="text-xs text-slate-400">
        Showing <span className="font-medium text-slate-600">{from}–{to}</span> of{" "}
        <span className="font-medium text-slate-600">{total.toLocaleString()}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="secondary"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1 text-xs"
        >
          ← Prev
        </Button>
        {pageNumbers.map((p) => (
          <Button
            key={p}
            variant={p === page ? "primary" : "ghost"}
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className="hidden px-2.5 py-1 text-xs sm:inline-flex"
          >
            {p}
          </Button>
        ))}
        <Button
          variant="secondary"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className="px-2.5 py-1 text-xs"
        >
          Next →
        </Button>
      </div>
    </nav>
  );
}
