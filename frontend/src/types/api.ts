// Types mirroring the backend API contract (UUID ids, ISO datetime strings).
// Keep aligned with backend/app/schemas/*.

export type UserRole = "client" | "operator" | "admin";

export type RequestStatus =
  | "submitted"
  | "in_progress"
  | "delivered"
  | "accepted"
  | "rejected";

export type EpisodeQuality = "good" | "usable" | "bad";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organization: string | null;
  is_active: boolean;
  created_at: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface RequestSummary {
  id: string;
  client_id: string;
  task_name: string;
  episodes_requested: number;
  deadline: string;
  notes: string | null;
  status: RequestStatus;
  created_at: string;
  updated_at: string;
  assigned_episode_count: number;
}

export interface Assignment {
  id: string;
  episode_id: string;
  assigned_by: string;
  assigned_at: string;
  episode?: {
    episode_id: string;
    robot_id: string;
    task_name: string;
    quality: EpisodeQuality;
  } | null;
}

export interface StatusHistoryEntry {
  id: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  changed_by: string;
  changed_at: string;
  reason: string | null;
}

export interface RequestDetail extends RequestSummary {
  assigned_episode_count: number;
  assignments: Assignment[];
  status_history: StatusHistoryEntry[];
}

export interface Episode {
  id: string;
  episode_id: string;
  robot_id: string;
  task_name: string;
  recorded_at: string;
  duration_seconds: number;
  operator_name: string;
  quality: EpisodeQuality;
}

export interface RequestPage {
  items: RequestSummary[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface EpisodePage {
  items: Episode[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface AnalyticsRow {
  day: string;
  robot_id: string;
  episodes: number;
}

export interface Analytics {
  range_start: string;
  range_end: string;
  episodes_per_day_robot: AnalyticsRow[];
  requests_by_status: Partial<Record<RequestStatus, number>>;
  median_submitted_to_delivered: {
    count_requests: number;
    median_seconds: number | null;
    median_hours: number | null;
  };
  top_tasks_by_good_episodes: { task_name: string; good_episodes: number }[];
}

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organization: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ApiError {
  message: string;
  status?: number;
}
