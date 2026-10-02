import type { ApiError } from "../types/api";

const BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const TIMEOUT_MS = 15_000;

export class ApiRequestError extends Error implements ApiError {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

type Listener = (status: number) => void;
const unauthorizedListeners: Listener[] = [];

/** Register a callback fired once per unauthorized (401) response. */
export function onUnauthorized(listener: Listener): () => void {
  unauthorizedListeners.push(listener);
  return () => {
    const i = unauthorizedListeners.indexOf(listener);
    if (i >= 0) unauthorizedListeners.splice(i, 1);
  };
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

async function parseError(res: Response): Promise<ApiRequestError> {
  let message = `Request failed with status ${res.status}`;
  try {
    const body = (await res.json()) as { detail?: unknown };
    const detail = body?.detail;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      // FastAPI/Pydantic validation errors: show field-level messages.
      const parts = detail
        .map((d) => {
          const loc = (d as { loc?: (string | number)[] }).loc ?? [];
          const field = loc.filter((p) => p !== "body").join(".");
          const msg = (d as { msg?: string }).msg ?? "invalid value";
          return field ? `${field}: ${msg}` : msg;
        })
        .slice(0, 3);
      message = parts.join("; ");
    }
  } catch {
    // non-JSON error body; keep the generic message
  }
  return new ApiRequestError(message, res.status);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, signal } = options;

  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  // Allow caller-provided abort signals to compose with the timeout.
  signal?.addEventListener("abort", () => controller.abort(), { once: true });

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiRequestError(
        "The server is currently unavailable. Please try again.",
      );
    }
    throw new ApiRequestError(
      "The server is currently unavailable. Please try again.",
    );
  }
  clearTimeout(timer);

  if (res.status === 401) {
    const err = await parseError(res);
    for (const listener of unauthorizedListeners) listener(401);
    throw err;
  }
  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  postForm: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", formData }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
};
