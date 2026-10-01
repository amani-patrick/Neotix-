import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { UserRole } from "../../types/api";

interface NavItem {
  to: string;
  label: string;
  icon: (active: boolean) => JSX.Element;
  roles: UserRole[];
  end?: boolean;
}

function IconDashboard({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1.5" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconRequests({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.1" : "0"} />
      <path d="M4 6h8M4 9h5" stroke={active ? "currentColor" : "currentColor"} strokeWidth="1.4" strokeLinecap="round" opacity={active ? "1" : "0.7"} />
    </svg>
  );
}

function IconNewRequest({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.1" : "0"} />
      <path d="M8 5.5v5M5.5 8h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconEpisodes({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.4" fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.1" : "0"} />
      <path d="M6 5.5l4.5 2.5L6 10.5V5.5z" fill="currentColor" />
    </svg>
  );
}

function IconAnalytics({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="2.5" y="8" width="2.5" height="5" rx="0.75" fill={active ? "currentColor" : "currentColor"} opacity={active ? "1" : "0.5"} />
      <rect x="6.75" y="5" width="2.5" height="8" rx="0.75" fill="currentColor" opacity={active ? "1" : "0.6"} />
      <rect x="11" y="2" width="2.5" height="11" rx="0.75" fill={active ? "currentColor" : "currentColor"} opacity={active ? "1" : "0.4"} />
    </svg>
  );
}

function IconUsers({ active }: { active: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.4" fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.1" : "0"} />
      <path d="M1.5 13c0-2.485 2.015-4.5 4.5-4.5s4.5 2.015 4.5 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="12" cy="5.5" r="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M14.5 13c0-1.657-1.119-3-2.5-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (a) => <IconDashboard active={a} />,
    roles: ["client", "operator", "admin"],
  },
  {
    to: "/requests",
    label: "Requests",
    icon: (a) => <IconRequests active={a} />,
    roles: ["client", "operator", "admin"],
    end: true,
  },
  {
    to: "/requests/new",
    label: "New Request",
    icon: (a) => <IconNewRequest active={a} />,
    roles: ["client"],
  },
  {
    to: "/episodes",
    label: "Episodes",
    icon: (a) => <IconEpisodes active={a} />,
    roles: ["operator", "admin"],
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: (a) => <IconAnalytics active={a} />,
    roles: ["operator", "admin"],
  },
  {
    to: "/admin/users",
    label: "Users",
    icon: (a) => <IconUsers active={a} />,
    roles: ["admin"],
  },
];

const ROLE_COLORS: Record<UserRole, string> = {
  client: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200",
  operator: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200",
  admin: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200",
};

const WORKSPACE_LABEL: Record<UserRole, string> = {
  client: "Client Workspace",
  operator: "Operator Console",
  admin: "Admin Console",
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (!user) return null;
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-0.5 px-2 py-3" aria-label="Main navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-blue-50 text-blue-700"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={isActive ? "text-blue-600" : "text-slate-400"}>
                {item.icon(isActive)}
              </span>
              {item.label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5">
      {/* Logo mark */}
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path
            d="M2 2h4v4H2V2zM8 2h4v4H8V2zM2 8h4v4H2V8zM8 8h4v4H8V8z"
            fill="white"
            opacity="0.9"
          />
        </svg>
      </div>
      <span className="text-sm font-semibold tracking-tight text-slate-800">Neotix</span>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-100 bg-white md:flex">
        <div className="px-4 py-4">{brand}</div>
        {navLinks()}
        {/* Bottom user strip */}
        <div className="border-t border-slate-100 px-3 py-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-slate-800">{user.name}</p>
              <span className={`inline-block rounded-full px-1.5 py-px text-[10px] font-medium capitalize ${ROLE_COLORS[user.role]}`}>
                {user.role}
              </span>
            </div>
            <button
              onClick={() => { logout(); navigate("/login"); }}
              className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              title="Logout"
              aria-label="Logout"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M10.5 11L14 8l-3.5-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4">
              {brand}
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {navLinks(() => setMenuOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top header */}
        <header className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-slate-100 bg-white/90 px-4 backdrop-blur-sm md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 md:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M2.5 4.5h13M2.5 9h13M2.5 13.5h13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <span className="truncate text-sm font-semibold text-slate-800 md:hidden">Neotix</span>
            <span className="hidden text-sm font-medium text-slate-500 md:inline">
              {WORKSPACE_LABEL[user.role]}
            </span>
          </div>
          {/* Mobile user info */}
          <div className="flex items-center gap-2 md:hidden">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_COLORS[user.role]}`}>
              {user.role}
            </span>
            <button
              onClick={() => { logout(); navigate("/login"); }}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
