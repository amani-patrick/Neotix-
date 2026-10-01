import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <p className="text-4xl font-semibold text-slate-300">404</p>
      <p className="mt-2 text-sm text-slate-500">This page does not exist.</p>
      <Link to="/dashboard" className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
