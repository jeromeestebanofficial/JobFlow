import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { Layers, RefreshCw, Zap } from "lucide-react";
import { SwipeCard } from "../components/jobs/SwipeCard";
import { Button } from "../components/ui/Button";
import { getSwipeQueue } from "../api/jobs";
import { swipe } from "../api/applications";
import { useJobStore } from "../store/jobStore";
import type { Job } from "../types";

export function SwipePage() {
  const { swipeQueue, currentSwipeIndex, setSwipeQueue, advanceSwipe } = useJobStore();
  const [loading, setLoading] = useState(false);
  const [appliedCount, setAppliedCount] = useState(0);
  const [autoAppliedCount, setAutoAppliedCount] = useState(0);

  const loadQueue = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const { data } = await getSwipeQueue(15);
      const jobs = Array.isArray(data) ? data : (data.jobs ?? []);
      const autoCount = data.auto_applied_count ?? 0;
      setSwipeQueue(jobs);
      if (autoCount > 0) {
        setAutoAppliedCount((c) => c + autoCount);
        toast.success(`Auto-applied to ${autoCount} high-match job${autoCount > 1 ? "s" : ""}!`, { icon: "⚡" });
      }
    } catch {
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, []);

  const handleSwipe = async (job: Job, direction: "right" | "left") => {
    advanceSwipe();

    if (direction === "right") {
      setAppliedCount((c) => c + 1);
      toast.success(`Applied to ${job.title}!`, { icon: "🎉" });
    } else {
      toast(`Skipped`, { icon: "👋", duration: 1500 });
    }

    // Fire-and-forget — don't block the UI
    swipe({ job_id: job.id, action: direction }).catch(() => {});

    // Reload when near end of queue
    const remaining = swipeQueue.length - (currentSwipeIndex + 1);
    if (remaining <= 3) {
      loadQueue();
    }
  };

  const remaining = swipeQueue.slice(currentSwipeIndex);
  const current = remaining[0];
  const next = remaining[1];

  return (
    <div className="flex flex-1 flex-col items-center overflow-auto p-8">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Layers size={20} className="text-brand-600" />
            <h1 className="text-xl font-bold text-gray-900">Job Swipe</h1>
          </div>
          <p className="text-sm text-gray-500">Swipe right to apply · left to skip</p>
          <div className="mt-2 flex justify-center gap-4 text-xs">
            {appliedCount > 0 && (
              <span className="text-green-600 font-medium">{appliedCount} applied</span>
            )}
            {autoAppliedCount > 0 && (
              <span className="text-brand-600 font-medium flex items-center gap-1">
                <Zap size={11} /> {autoAppliedCount} auto-applied
              </span>
            )}
          </div>
        </div>

        {loading && remaining.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
            <RefreshCw size={32} className="animate-spin opacity-50" />
            <p className="text-sm">Finding jobs for you…</p>
          </div>
        ) : remaining.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-20 text-center">
            <div className="text-5xl">🎉</div>
            <p className="font-semibold text-gray-800">You've reviewed all jobs!</p>
            <p className="text-sm text-gray-500">New listings are added regularly</p>
            <Button onClick={loadQueue} loading={loading} variant="secondary">
              <RefreshCw size={14} /> Refresh queue
            </Button>
          </div>
        ) : (
          <div className="relative">
            {next && (
              <div className="absolute inset-x-3 top-3 -z-10 h-32 rounded-2xl bg-gray-100 border border-gray-200 opacity-60" />
            )}
            <AnimatePresence mode="wait">
              {current && (
                <SwipeCard
                  key={`${current.id}-${currentSwipeIndex}`}
                  job={current}
                  onSwipe={(dir) => handleSwipe(current, dir)}
                  isTop={true}
                />
              )}
            </AnimatePresence>
          </div>
        )}

        {remaining.length > 0 && (
          <p className="mt-4 text-center text-xs text-gray-400">
            {remaining.length} job{remaining.length !== 1 ? "s" : ""} remaining
          </p>
        )}
      </div>
    </div>
  );
}
