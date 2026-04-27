import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Loader2, AlertCircle, ExternalLink } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "./ui/Button";
import { autoApplyApi } from "../api/autoApply";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function LinkedInApplyModal({ open, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [showCoverLetter, setShowCoverLetter] = useState(false);
  const [running, setRunning] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [taskStatus, setTaskStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [resultMsg, setResultMsg] = useState("");
  const [currentStep, setCurrentStep] = useState("Queued");
  const [progress, setProgress] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      // Reset when closed
      if (pollRef.current) clearInterval(pollRef.current);
      setUrl("");
      setCoverLetter("");
      setShowCoverLetter(false);
      setRunning(false);
      setMessages([]);
      setTaskStatus("idle");
      setResultMsg("");
      setCurrentStep("Queued");
      setProgress(0);
    }
  }, [open]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStart = async () => {
    const trimmed = url.trim();
    if (!trimmed) { toast.error("Paste a LinkedIn job URL first"); return; }
    if (!trimmed.includes("linkedin.com")) {
      toast.error("Only LinkedIn URLs are supported");
      return;
    }

    setRunning(true);
    setMessages([]);
    setTaskStatus("running");
    setCurrentStep("Queued");
    setProgress(0);

    try {
      const r = await autoApplyApi.applyByUrl({
        job_url: trimmed,
        cover_letter: coverLetter.trim() || undefined,
      });
      const taskId = r.data.task_id;

      pollRef.current = setInterval(async () => {
        try {
          const s = await autoApplyApi.getStatus(taskId);
          setMessages(s.data.messages);
          if (s.data.current_step) setCurrentStep(s.data.current_step);
          if (typeof s.data.progress === "number") setProgress(s.data.progress);
          if (s.data.status === "done" || s.data.status === "error") {
            clearInterval(pollRef.current!);
            setRunning(false);
            const result = s.data.result;
            if (result?.success) {
              setTaskStatus("done");
              setCurrentStep("Submitted");
              setProgress(100);
              setResultMsg(result.message || "Application submitted!");
              toast.success("LinkedIn Easy Apply submitted!");
            } else {
              setTaskStatus("error");
              setCurrentStep("Failed");
              setResultMsg(result?.message || "Auto-apply failed");
            }
          }
        } catch {
          clearInterval(pollRef.current!);
          setRunning(false);
          setTaskStatus("error");
          setResultMsg("Lost connection to the automation task");
        }
      }, 2000);
    } catch (err: any) {
      setRunning(false);
      setTaskStatus("error");
      const detail = err?.response?.data?.detail || "Failed to start auto-apply";
      setResultMsg(detail);
      toast.error(detail);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !running && onClose()}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-[#0077b5]">
              <div>
                <h2 className="text-base font-bold text-white">LinkedIn Easy Apply</h2>
                <p className="text-xs text-blue-100 mt-0.5">
                  Paste a LinkedIn job URL — the bot fills and submits the form for you
                </p>
              </div>
              {!running && (
                <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                  <X size={18} />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              {/* URL input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  LinkedIn Job URL
                </label>
                <input
                  type="url"
                  placeholder="https://www.linkedin.com/jobs/view/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={running || taskStatus === "done"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0077b5] disabled:bg-gray-50 disabled:text-gray-400"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Open a LinkedIn job, copy the URL from your browser address bar, and paste it here.
                </p>
              </div>

              {/* Cover letter (optional) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowCoverLetter((s) => !s)}
                  className="text-xs text-[#0077b5] hover:underline font-medium"
                  disabled={running || taskStatus === "done"}
                >
                  {showCoverLetter ? "▾ Hide cover letter" : "▸ Add cover letter (optional)"}
                </button>
                {showCoverLetter && (
                  <textarea
                    rows={4}
                    placeholder="Dear Hiring Manager, ..."
                    value={coverLetter}
                    onChange={(e) => setCoverLetter(e.target.value)}
                    disabled={running || taskStatus === "done"}
                    className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0077b5] disabled:bg-gray-50"
                  />
                )}
              </div>

              {/* Live log */}
              {(messages.length > 0 || taskStatus !== "idle") && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-white">
                    {running && <Loader2 size={13} className="animate-spin text-[#0077b5]" />}
                    {taskStatus === "done" && <CheckCircle2 size={13} className="text-green-500" />}
                    {taskStatus === "error" && <AlertCircle size={13} className="text-red-500" />}
                    <span className="text-xs font-semibold text-gray-600">
                      {running ? "Bot is running…" : taskStatus === "done" ? "Done!" : taskStatus === "error" ? "Error" : ""}
                    </span>
                  </div>
                  <div className="px-3 pt-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-600 mb-1">
                      <span>{currentStep}</span>
                      <span>{Math.max(0, Math.min(100, progress))}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full transition-all ${taskStatus === "error" ? "bg-red-400" : "bg-[#0077b5]"}`}
                        style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                      />
                    </div>
                  </div>
                  <div
                    ref={logRef}
                    className="max-h-40 overflow-y-auto p-3 space-y-1 font-mono"
                  >
                    {messages.map((msg, i) => (
                      <p key={i} className="text-xs text-gray-600">
                        <span className="text-gray-400 select-none">&gt; </span>{msg}
                      </p>
                    ))}
                    {running && messages.length === 0 && (
                      <p className="text-xs text-gray-400 animate-pulse">Starting browser…</p>
                    )}
                  </div>
                </div>
              )}

              {/* Result */}
              {taskStatus === "done" && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-800">Application submitted!</p>
                    <p className="text-xs text-green-600 mt-0.5">{resultMsg}</p>
                  </div>
                </div>
              )}
              {taskStatus === "error" && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Auto-apply failed</p>
                    <p className="text-xs text-red-600 mt-0.5">{resultMsg}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      You can try again or{" "}
                      <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
                        apply manually <ExternalLink size={10} className="inline" />
                      </a>
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {taskStatus === "idle" || taskStatus === "error" ? (
                  <>
                    <Button
                      className="flex-1 bg-[#0077b5] hover:bg-[#005f90] text-white border-0"
                      onClick={handleStart}
                      loading={running}
                      disabled={!url.trim()}
                    >
                      {running ? "Running…" : "Start Easy Apply"}
                    </Button>
                    <Button variant="secondary" onClick={onClose} disabled={running}>
                      Cancel
                    </Button>
                  </>
                ) : taskStatus === "done" ? (
                  <Button className="flex-1" onClick={onClose}>
                    Close
                  </Button>
                ) : null}
              </div>

              <p className="text-xs text-gray-400 text-center">
                A browser window will open on this computer — you may need to complete a CAPTCHA or 2FA if LinkedIn asks.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
