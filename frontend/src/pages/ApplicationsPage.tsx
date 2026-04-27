import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Send, ExternalLink, ChevronDown } from "lucide-react";
import { getAbExperimentMetrics, getApplications, updateApplication, deleteApplication } from "../api/applications";
import { Modal } from "../components/ui/Modal";
import type { Application, ApplicationStatus } from "../types";

const STATUSES: ApplicationStatus[] = ["applied", "interview", "offer", "rejected", "withdrawn"];

const statusColor: Record<string, string> = {
  applied:   "bg-blue-100 text-blue-700",
  interview: "bg-green-100 text-green-700",
  offer:     "bg-purple-100 text-purple-700",
  rejected:  "bg-red-100 text-red-700",
  withdrawn: "bg-gray-100 text-gray-500",
  skipped:   "bg-gray-100 text-gray-400",
  pending:   "bg-yellow-100 text-yellow-700",
};

const autoApplyStatusColor: Record<string, string> = {
  queued: "bg-amber-100 text-amber-700",
  running: "bg-blue-100 text-blue-700",
  done: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};

function formatDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "";
  }
}

export function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [abRows, setAbRows] = useState<Array<{ role_type: string; variant: "A" | "B"; total: number; responses: number; response_rate: number }>>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [viewingApp, setViewingApp] = useState<Application | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([getApplications(), getAbExperimentMetrics()])
      .then(([appsRes, abRes]) => {
        setApps(appsRes.data as Application[]);
        setAbRows(abRes.data?.rows || []);
      })
      .catch(() => toast.error("Failed to load applications"))
      .finally(() => setLoading(false));
  }, []);

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await updateApplication(id, { status });
      setApps((as) => as.map((a) => (a.id === id ? { ...a, status: status as ApplicationStatus } : a)));
    } catch {
      toast.error("Update failed");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this application?")) return;
    await deleteApplication(id);
    setApps((as) => as.filter((a) => a.id !== id));
    toast.success("Removed");
  };

  const filtered =
    filter === "all"
      ? apps.filter((a) => a.status !== "skipped")
      : apps.filter((a) => a.status === filter);

  const counts = STATUSES.reduce(
    (acc, s) => ({ ...acc, [s]: apps.filter((a) => a.status === s).length }),
    {} as Record<string, number>
  );

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
        <p className="mt-1 text-gray-500">Track every job application in one place</p>
      </div>

      {/* Pipeline summary */}
      <div className="mb-6 grid grid-cols-5 gap-3">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(filter === s ? "all" : s)}
            className={`rounded-xl p-3 text-left transition-all border ${
              filter === s ? "border-brand-400 bg-brand-50" : "border-gray-200 bg-white hover:bg-gray-50"
            }`}
          >
            <p className="text-xl font-bold text-gray-900">{counts[s] || 0}</p>
            <p className="text-xs text-gray-500 capitalize">{s}</p>
          </button>
        ))}
      </div>

      {abRows.length > 0 && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Resume A/B Experiments</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {abRows.map((r) => (
              <div key={`${r.role_type}-${r.variant}`} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                <p className="font-medium text-gray-800">{r.role_type} · Variant {r.variant}</p>
                <p className="text-xs text-gray-500">
                  Response rate: <span className="font-semibold text-gray-700">{r.response_rate}%</span>
                  {" "}({r.responses}/{r.total})
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <Send size={32} className="mx-auto mb-2 opacity-30" />
          <p>No applications {filter !== "all" ? `with status "${filter}"` : "yet — start swiping!"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => (
            <div key={app.id} className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm flex items-center gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">
                {(app.job?.company || "?")[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 truncate">{app.job?.title ?? "Unknown Role"}</p>
                <p className="text-sm text-gray-500 truncate">
                  {app.job?.company ?? "—"} · {app.job?.location || (app.job?.is_remote ? "Remote" : "—")}
                </p>
              </div>

              {app.match_score != null && (
                <span className="text-xs font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {app.match_score}% match
                </span>
              )}

              {app.is_auto_applied && (
                <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                  auto
                </span>
              )}
              {app.auto_apply_status && (
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${autoApplyStatusColor[app.auto_apply_status] || "bg-gray-100 text-gray-600"}`}>
                  {app.auto_apply_status}
                </span>
              )}

              {app.applied_at && (
                <span className="text-xs text-gray-400 hidden sm:block whitespace-nowrap">
                  {formatDate(app.applied_at)}
                </span>
              )}

              <div className="relative flex-shrink-0">
                <select
                  value={app.status}
                  onChange={(e) => handleStatusChange(app.id, e.target.value)}
                  className={`appearance-none rounded-lg border-0 pl-2 pr-6 py-1 text-xs font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 ${statusColor[app.status] || "bg-gray-100 text-gray-600"}`}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
                <ChevronDown size={11} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 opacity-50" />
              </div>

              {app.job?.url && (
                <a href={app.job.url} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-brand-600 transition-colors flex-shrink-0">
                  <ExternalLink size={15} />
                </a>
              )}
              <button
                onClick={() => setViewingApp(app)}
                className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                View
              </button>

              <button
                onClick={() => handleDelete(app.id)}
                className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none flex-shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={!!viewingApp}
        onClose={() => setViewingApp(null)}
        title="Applied Job Details"
        size="lg"
      >
        {viewingApp && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">{viewingApp.job?.title || "Unknown role"}</p>
              <p className="text-sm text-gray-500">{viewingApp.job?.company || "Unknown company"}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Resume used</p>
                <p className="text-sm text-gray-800">{viewingApp.resume?.name || "No resume linked"}</p>
                {viewingApp.resume?.full_name && (
                  <p className="text-xs text-gray-500 mt-1">Candidate: {viewingApp.resume.full_name}</p>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Status</p>
                <p className="text-sm text-gray-800">{viewingApp.status}</p>
                {viewingApp.auto_apply_status && (
                  <p className="text-xs text-gray-500 mt-1">Auto apply: {viewingApp.auto_apply_status}</p>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Cover letter</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {viewingApp.cover_letter?.trim() || "No cover letter saved for this application."}
              </p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
