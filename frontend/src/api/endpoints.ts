// Typed API functions, one per backend endpoint the UI uses.
import { api } from "./client";
import type {
  Analytics,
  Assignment,
  AuthUser,
  EpisodePage,
  EpisodeQuality,
  LoginResponse,
  RequestDetail,
  RequestPage,
  RequestStatus,
  RequestSummary,
  UserRecord,
} from "../types/api";

type UserRole = "client" | "operator" | "admin";

const qs = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

// --- auth -----------------------------------------------------------------

export async function login(email: string, password: string): Promise<LoginResponse> {
  return api.post<LoginResponse>("/auth/login", { email, password });
}

export async function getCurrentUser(): Promise<AuthUser> {
  return api.get<AuthUser>("/auth/me");
}

// --- requests -------------------------------------------------------------

export interface RequestFilters {
  status?: RequestStatus;
  page?: number;
  page_size?: number;
}

export async function listRequests(filters: RequestFilters = {}): Promise<RequestPage> {
  return api.get<RequestPage>(`/requests${qs({ ...filters })}`);
}

export async function getRequest(id: string): Promise<RequestDetail> {
  return api.get<RequestDetail>(`/requests/${id}`);
}

export interface CreateRequestInput {
  task_name: string;
  episodes_requested: number;
  deadline: string;
  notes?: string;
}

export async function createRequest(input: CreateRequestInput): Promise<RequestSummary> {
  return api.post<RequestSummary>("/requests", input);
}

export async function transitionRequest(
  id: string,
  status: RequestStatus,
  reason?: string,
): Promise<RequestDetail> {
  return api.post<RequestDetail>(`/requests/${id}/transition`, {
    status,
    reason,
  });
}

export async function listRequestEpisodes(requestId: string): Promise<Assignment[]> {
  return api.get<Assignment[]>(`/requests/${requestId}/episodes`);
}

export interface AssignEpisodeInput {
  requestId: string;
  episodeId: string;
}

export async function assignEpisode(requestId: string, episodeId: string): Promise<Assignment> {
  return api.post<Assignment>(`/requests/${requestId}/assignments`, {
    episode_id: episodeId,
  });
}

// --- episodes -------------------------------------------------------------

export interface EpisodeFilters {
  task_name?: string;
  quality?: EpisodeQuality;
  robot_id?: string;
  page?: number;
  page_size?: number;
}

export async function listEpisodes(filters: EpisodeFilters): Promise<EpisodePage> {
  return api.get<EpisodePage>(`/episodes${qs({ ...filters })}`);
}

// --- analytics ------------------------------------------------------------

export async function getAnalytics(from: string, to: string): Promise<Analytics> {
  return api.get<Analytics>(`/analytics${qs({ from, to })}`);
}

// --- users (admin) ----------------------------------------------------------

export async function listUsers(): Promise<UserRecord[]> {
  return api.get<UserRecord[]>("/users");
}

export interface CreateUserInput {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  organization?: string;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  return api.post<UserRecord>("/users", input);
}

export async function updateUser(
  id: string,
  patch: { is_active?: boolean; role?: UserRole },
): Promise<UserRecord> {
  return api.patch<UserRecord>(`/users/${id}`, patch);
}
