import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth, RequireRole } from "../auth/ProtectedRoute";
import type { UserRole } from "../types/api";
import { AppLayout } from "../components/layout/AppLayout";
import { LoginPage } from "../pages/LoginPage";
import { DashboardPage } from "../pages/DashboardPage";
import { RequestsPage } from "../pages/RequestsPage";
import { CreateRequestPage } from "../pages/CreateRequestPage";
import { RequestDetailPage } from "../pages/RequestDetailPage";
import { EpisodesPage } from "../pages/EpisodesPage";
import { AnalyticsPage } from "../pages/AnalyticsPage";
import { UsersPage } from "../pages/UsersPage";
import { NotFoundPage } from "../pages/NotFoundPage";

const OPERATOR: UserRole[] = ["operator", "admin"];
const ADMIN: UserRole[] = ["admin"];

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      { path: "/dashboard", element: <DashboardPage /> },
      { path: "/requests", element: <RequestsPage /> },
      {
        path: "/requests/new",
        element: (
          <RequireRole roles={["client"]}>
            <CreateRequestPage />
          </RequireRole>
        ),
      },
      { path: "/requests/:id", element: <RequestDetailPage /> },
      {
        path: "/episodes",
        element: (
          <RequireRole roles={OPERATOR}>
            <EpisodesPage />
          </RequireRole>
        ),
      },
      {
        path: "/analytics",
        element: (
          <RequireRole roles={OPERATOR}>
            <AnalyticsPage />
          </RequireRole>
        ),
      },
      {
        path: "/admin/users",
        element: (
          <RequireRole roles={ADMIN}>
            <UsersPage />
          </RequireRole>
        ),
      },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
