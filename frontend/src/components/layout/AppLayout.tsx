import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import type { UserRole } from "../../types/api";

interface NavItem {
  to: string;
  label: string;
  roles: UserRole[];
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", roles: ["client", "operator", "admin"] },
  { to: "/requests", label: "Requests", roles: ["client", "operator", "admin"], end: true },
  { to: "/requests/new", label: "New Request", roles: ["client"] },
  { to: "/episodes", label: "Episodes", roles: ["operator", "admin"] },
  { to: "/analytics", label: "Analytics", roles: ["operator", "admin"] },
  { to: "/admin/users", label: "Users", roles: ["admin"] },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  if (!user) return null;
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `block rounded-md px-3 py-2 text-sm font-medium ${
              isActive
                ? "bg-blue-50 text-blue-700"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Desktop sidebar (hidden on mobile) */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="border-b border-slate-200 px-4 py-4">
          <span className="text-sm font-semibold text-slate-900">
            Dataset Request Desk
          </span>
        </div>
        {navLinks()}
      </aside>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
              <span className="text-sm font-semibold text-slate-900">
                Dataset Request Desk
              </span>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                ✕
              </button>
            </div>
            {navLinks(() => setMenuOpen(false))}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {/* Hamburger (mobile only) */}
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              aria-expanded={menuOpen}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 md:hidden"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
            <span className="truncate text-sm font-semibold text-slate-900 md:hidden">
              Dataset Request Desk
            </span>
            <span className="hidden text-sm font-medium text-slate-900 md:inline">
              {user.role === "client"
                ? "Client Workspace"
                : user.role === "operator"
                  ? "Operator Console"
                  : "Admin Console"}
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-3">
            <span className="hidden truncate text-slate-700 sm:inline">{user.name}</span>
            <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600 ring-1 ring-inset ring-slate-200">
              {user.role}
            </span>
            <button
              onClick={() => {
                logout();
                navigate("/login");
              }}
              className="whitespace-nowrap text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
