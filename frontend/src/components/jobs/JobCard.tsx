import { useState, useEffect, useRef } from "react";
import { MapPin, DollarSign, ExternalLink, Zap, CheckCircle2, Clock, Bot, Loader2, Timer, FileEdit, Trash2, Eye } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { autoApplyApi } from "../../api/autoApply";
import type { Job } from "../../types";

interface Props {
  job: Job;
  onApply?: (job: Job) => Promise<void> | void;
  onTailor?: (job: Job) => Promise<void> | void;
  onEasyApplyAI?: (job: Job) => Promise<void> | void;
  onViewed?: (job: Job) => void;
  viewed?: boolean;
  isNew?: boolean;
  hasIssue?: boolean;
  applied?: boolean;
  queued?: boolean;
  liConfigured?: boolean;
  /** Saved tailored resume + cover letter exists for this job */
  hasTailoredDraft?: boolean;
  onDeleteLinkedin?: (job: Job) => Promise<void> | void;
  deletingLinkedin?: boolean;
  onViewTailored?: (job: Job) => Promise<void> | void;
}

function scoreColor(score?: number): "green" | "yellow" | "red" | "gray" {
  if (!score) return "gray";
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

export function JobCard({
  job,
  onApply,
  onTailor,
  onEasyApplyAI,
  onViewed,
  viewed = false,
  isNew = false,
  hasIssue = false,
  applied: initialApplied,
  queued = false,
  liConfigured,
  hasTailoredDraft = false,
  onDeleteLinkedin,
  deletingLinkedin = false,
  onViewTailored,
}: Props) {
  const [applied, setApplied] = useState(initialApplied ?? false);
  const [applying, setApplying] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [tailoring, setTailoring] = useState(false);
  const [viewingTailored, setViewingTailored] = useState(false);
  const [startingEasyApply, setStartingEasyApply] = useState(false);

  // LinkedIn Easy Apply state
  const [autoApplying, setAutoApplying] = useState(false);
  const [autoApplyStatus, setAutoApplyStatus] = useState<string | null>(null);
  const [autoApplyMessages, setAutoApplyMessages] = useState<string[]>([]);
  const [autoApplyError, setAutoApplyError] = useState<string | null>(null);
  const [autoApplyStep, setAutoApplyStep] = useState<string>("Queued");
  const [autoApplyProgress, setAutoApplyProgress] = useState<number>(0);
  const [showAutoApplyProgress, setShowAutoApplyProgress] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLinkedIn = !!(job.url && job.url.includes("linkedin.com"));
  const canEasyApply = isLinkedIn && job.is_easy_apply === true;
  const unavailable = job.is_available === false;

  const handleAutoApply = async () => {
    if (!job.id) return;
    setAutoApplying(true);
    setAutoApplyMessages([]);
    setAutoApplyStatus("starting");
    setAutoApplyStep("Queued");
    setAutoApplyProgress(0);
    setAutoApplyError(null);
    setShowAutoApplyProgress(true);
    try {
      const r = await autoApplyApi.triggerApply(job.id);
      const taskId = r.data.task_id;

      // Poll for status every 3 seconds
      pollRef.current = setInterval(async () => {
        try {
          const s = await autoApplyApi.getStatus(taskId);
          setAutoApplyMessages(s.data.messages);
          setAutoApplyStatus(s.data.status);
          if (s.data.current_step) setAutoApplyStep(s.data.current_step);
          if (typeof s.data.progress === "number") setAutoApplyProgress(s.data.progress);
          if (s.data.status === "done" || s.data.status === "error") {
            clearInterval(pollRef.current!);
            setAutoApplying(false);
            const result = s.data.result;
            if (result?.success) {
              setApplied(true);
              setAutoApplyStep("Submitted");
              setAutoApplyProgress(100);
              toast.success("LinkedIn Easy Apply submitted!");
            } else {
              setAutoApplyStep("Failed");
              setAutoApplyError(result?.message || "Auto-apply failed");
              toast.error(result?.message || "Auto-apply failed");
            }
          }
        } catch {
          clearInterval(pollRef.current!);
          setAutoApplying(false);
          toast.error("Lost connection to auto-apply task");
        }
      }, 3000);
    } catch (err: any) {
      setAutoApplying(false);
      setShowAutoApplyProgress(false);
      toast.error(err?.response?.data?.detail || "Failed to start auto-apply");
    }
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const salary =
    job.salary_min && job.salary_max
      ? `$${(job.salary_min / 1000).toFixed(0)}k–$${(job.salary_max / 1000).toFixed(0)}k`
      : job.salary_min
      ? `$${(job.salary_min / 1000).toFixed(0)}k+`
      : null;

  const handleApply = async () => {
    if (!onApply) return;
    setApplying(true);
    try {
      await onApply(job);
      setApplied(true);
      setShowConfirm(true);
    } finally {
      setApplying(false);
    }
  };

  const handleTailorClick = async () => {
    if (!onTailor || tailoring) return;
    setTailoring(true);
    try {
      await onTailor(job);
    } finally {
      setTailoring(false);
    }
  };

  const handleViewTailoredClick = async () => {
    if (!onViewTailored || viewingTailored) return;
    setViewingTailored(true);
    try {
      await onViewTailored(job);
    } finally {
      setViewingTailored(false);
    }
  };

  const handleEasyApplyClick = async () => {
    if (startingEasyApply || autoApplying) return;
    if (onEasyApplyAI) {
      setStartingEasyApply(true);
      try {
        await onEasyApplyAI(job);
      } finally {
        setStartingEasyApply(false);
      }
      return;
    }
    await handleAutoApply();
  };

  const applyUrl = canEasyApply ? job.url : (job.apply_url || job.url);
  const viewUrl = canEasyApply ? job.url : (job.apply_url || job.url);

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow relative">
        {/* Status ribbon */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5 flex-wrap justify-end">
          {queued && (
            <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold text-blue-700 animate-pulse">
              <Timer size={10} /> On Queue
            </span>
          )}
          {applied && !queued && (
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
              <CheckCircle2 size={11} /> Tracked
            </span>
          )}
          {hasIssue && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              Issue detected
            </span>
          )}
          {isNew && !queued && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              NEW
            </span>
          )}
          {viewed && !queued && !applied && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              Viewed
            </span>
          )}
        </div>

        <div className="flex items-start gap-3 pr-20">
          {job.logo_url ? (
            <img src={job.logo_url} alt={job.company} className="h-10 w-10 rounded-lg object-contain border border-gray-100 flex-shrink-0" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 flex-shrink-0">
              {(job.company || "?")[0]}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 truncate">{job.title}</h3>
            <p className="text-sm text-gray-500 truncate">{job.company}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          {job.location && (
            <span className="flex items-center gap-1"><MapPin size={12} /> {job.location}</span>
          )}
          {job.is_remote && <Badge label="Remote" color="blue" />}
          {job.job_type && <Badge label={job.job_type} color="gray" />}
          {salary && (
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <DollarSign size={12} /> {salary}
            </span>
          )}
          {job.source && (
            <span className="flex items-center gap-1 text-gray-400">
              <Clock size={12} /> via {job.source}
            </span>
          )}
          {job.match_score !== undefined && (
            <Badge label={`${job.match_score}% match`} color={scoreColor(job.match_score)} />
          )}
        </div>

        {job.tags && job.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.tags.slice(0, 6).map((tag) => (
              <span key={tag} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{tag}</span>
            ))}
          </div>
        )}

        <p className="mt-3 text-sm text-gray-600 line-clamp-2">
          {(job.description || "No description available for this job.").replace(/<[^>]+>/g, " ")}
        </p>
        {unavailable && (
          <div className="mt-3">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {job.availability_reason || "No longer accepting applications"}
            </span>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 flex-wrap">
          {!applied && onApply && (
            <Button size="sm" onClick={handleApply} loading={applying} disabled={unavailable}>
              {unavailable ? "Closed" : "Apply & Track"}
            </Button>
          )}
          {!applied && canEasyApply && liConfigured && (
            queued ? (
              <span className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-500 cursor-not-allowed select-none">
                <Timer size={13} /> Easy Apply · On Queue
              </span>
            ) : (
              <Button
                size="sm"
                onClick={handleEasyApplyClick}
                loading={autoApplying || startingEasyApply}
                disabled={unavailable || tailoring || applying}
                className="bg-[#0077b5] hover:bg-[#005f90] text-white border-0"
              >
                {autoApplying || startingEasyApply ? <Loader2 size={13} className="animate-spin" /> : <Bot size={13} />}
                Easy Apply
              </Button>
            )
          )}
          {applied && applyUrl && (
            <a href={applyUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                <ExternalLink size={13} /> Open Job Listing
              </Button>
            </a>
          )}
          {onTailor && (
            queued ? (
              <span className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-500 cursor-not-allowed select-none">
                <Timer size={13} /> {hasTailoredDraft ? "Re-tailor" : "AI Tailor"} · On Queue
              </span>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleTailorClick}
                loading={tailoring}
                disabled={applying || autoApplying || startingEasyApply}
                title={
                  hasTailoredDraft
                    ? "Saved tailored resume and cover letter — open to review or edit"
                    : "Generate a tailored resume and cover letter with AI"
                }
                className={hasTailoredDraft ? "border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100" : undefined}
              >
                {hasTailoredDraft ? <FileEdit size={13} /> : <Zap size={13} />}
                {hasTailoredDraft ? "Re-tailor" : "AI Tailor"}
              </Button>
            )
          )}
          {hasTailoredDraft && onViewTailored && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleViewTailoredClick}
              loading={viewingTailored}
              disabled={applying || autoApplying || startingEasyApply || tailoring}
              className="border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100"
              title="Open your saved tailored resume and cover letter"
            >
              <Eye size={13} /> View Tailored Resume
            </Button>
          )}
          {isLinkedIn && onDeleteLinkedin && (
            <Button
              size="sm"
              variant="ghost"
              loading={deletingLinkedin}
              disabled={applying || autoApplying || startingEasyApply || deletingLinkedin}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteLinkedin(job);
              }}
              className="text-red-600 hover:bg-red-50"
              title="Delete this LinkedIn job from database"
            >
              <Trash2 size={13} /> Delete
            </Button>
          )}
          {!applied && viewUrl && (
            <a
              href={viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onViewed?.(job)}
              className="ml-auto flex items-center gap-1 text-xs text-gray-400 hover:text-brand-600 transition-colors"
            >
              View <ExternalLink size={12} />
            </a>
          )}
        </div>

        {/* Auto-apply progress bar */}
        {showAutoApplyProgress && (
          <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
            <div className="flex items-center gap-2 mb-2">
              {autoApplying ? (
                <Loader2 size={14} className="animate-spin text-blue-600" />
              ) : autoApplyStatus === "done" ? (
                <CheckCircle2 size={14} className="text-green-600" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full bg-red-400 flex-shrink-0" />
              )}
              <span className="text-xs font-semibold text-blue-800">
                {autoApplyStatus === "done" ? "Submitted!" : autoApplyStatus === "error" ? "Failed" : "Auto-applying…"}
              </span>
              <button
                onClick={() => setShowAutoApplyProgress(false)}
                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="mb-2">
              <div className="flex items-center justify-between text-[11px] text-blue-700 mb-1">
                <span>{autoApplyStep}</span>
                <span>{Math.max(0, Math.min(100, autoApplyProgress))}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
                <div
                  className={`h-full transition-all ${autoApplyStatus === "error" ? "bg-red-400" : "bg-blue-500"}`}
                  style={{ width: `${Math.max(0, Math.min(100, autoApplyProgress))}%` }}
                />
              </div>
            </div>
            <div className="space-y-0.5 max-h-24 overflow-y-auto">
              {autoApplyStatus === "error" && autoApplyError && (
                <p className="text-xs font-medium text-red-600 mb-1">{autoApplyError}</p>
              )}
              {autoApplyMessages.map((msg, i) => (
                <p key={i} className="text-xs text-blue-700">{msg}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {showConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setShowConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl p-6 text-center"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 size={28} className="text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Application Tracked!</h3>
              <p className="text-sm text-gray-500 mb-1">
                <span className="font-medium text-gray-700">{job.title}</span> at{" "}
                <span className="font-medium text-gray-700">{job.company}</span>
              </p>
              <p className="text-xs text-gray-400 mb-5">
                Saved to your Applications tracker. Now open the listing to complete the actual application on their platform.
              </p>

              <div className="flex flex-col gap-2">
                {applyUrl && (
                  <a href={applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => setShowConfirm(false)}>
                    <Button className="w-full">
                      <ExternalLink size={14} /> Open Job Listing to Apply
                    </Button>
                  </a>
                )}
                <Button variant="ghost" className="w-full text-gray-500" onClick={() => setShowConfirm(false)}>
                  I'll do it later
                </Button>
              </div>

              <p className="mt-4 text-xs text-gray-400">
                Track your progress in the Applications page.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
