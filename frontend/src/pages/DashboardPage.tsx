import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Send, CheckCircle, Clock, Layers, TrendingUp } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { getApplications } from "../api/applications";
import type { Application } from "../types";

interface Stat {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bg: string;
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const [apps, setApps] = useState<Application[]>([]);

  useEffect(() => {
    getApplications().then((r) => setApps(r.data)).catch(() => {});
  }, []);

  const stats: Stat[] = [
    {
      label: "Total Applied",
      value: apps.filter((a) => a.status !== "skipped").length,
      icon: Send,
      color: "text-brand-600",
      bg: "bg-brand-50",
    },
    {
      label: "Interviews",
      value: apps.filter((a) => a.status === "interview").length,
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "Pending",
      value: apps.filter((a) => a.status === "applied").length,
      icon: Clock,
      color: "text-yellow-600",
      bg: "bg-yellow-50",
    },
    {
      label: "Offers",
      value: apps.filter((a) => a.status === "offer").length,
      icon: TrendingUp,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const recent = apps.slice(0, 5);

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          Good day, {user?.full_name?.split(" ")[0] || "there"} 👋
        </h1>
        <p className="mt-1 text-gray-500">Here's your application overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${s.bg} mb-3`}>
              <s.icon size={20} className={s.color} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <Link to="/swipe" className="group rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 shadow-md hover:shadow-lg transition-shadow">
          <Layers size={22} className="text-white mb-3" />
          <p className="font-semibold text-white">Swipe Jobs</p>
          <p className="text-sm text-brand-200 mt-0.5">Quick apply with one swipe</p>
        </Link>
        <Link to="/jobs" className="group rounded-xl bg-white border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <Briefcase size={22} className="text-brand-600 mb-3" />
          <p className="font-semibold text-gray-900">Browse All Jobs</p>
          <p className="text-sm text-gray-500 mt-0.5">Search and filter listings</p>
        </Link>
        <Link to="/resume" className="group rounded-xl bg-white border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
          <Send size={22} className="text-brand-600 mb-3" />
          <p className="font-semibold text-gray-900">Update Resume</p>
          <p className="text-sm text-gray-500 mt-0.5">Keep your profile fresh</p>
        </Link>
      </div>

      {/* Recent applications */}
      <div className="rounded-xl bg-white border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="font-semibold text-gray-900">Recent Applications</h2>
          <Link to="/applications" className="text-sm text-brand-600 hover:text-brand-700">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Send size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No applications yet — start swiping!</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {recent.map((app) => (
              <li key={app.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium text-gray-900 text-sm">{app.job?.title}</p>
                  <p className="text-xs text-gray-500">{app.job?.company}</p>
                </div>
                <StatusBadge status={app.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    applied: "bg-blue-100 text-blue-700",
    interview: "bg-green-100 text-green-700",
    offer: "bg-purple-100 text-purple-700",
    rejected: "bg-red-100 text-red-700",
    skipped: "bg-gray-100 text-gray-500",
    pending: "bg-yellow-100 text-yellow-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
