import { motion, useMotionValue, useTransform, useAnimationControls } from "framer-motion";
import { MapPin, DollarSign, ExternalLink, Heart, X } from "lucide-react";
import { Badge } from "../ui/Badge";
import type { Job } from "../../types";
import { useRef } from "react";

interface Props {
  job: Job;
  onSwipe: (direction: "right" | "left") => void;
  isTop: boolean;
}

export function SwipeCard({ job, onSwipe, isTop }: Props) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-18, 18]);
  const likeOpacity = useTransform(x, [20, 100], [0, 1]);
  const skipOpacity = useTransform(x, [-100, -20], [1, 0]);
  const controls = useAnimationControls();
  const isDragging = useRef(false);

  const handleDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    const threshold = 120;
    if (info.offset.x > threshold) {
      controls.start({ x: 600, opacity: 0, transition: { duration: 0.3 } }).then(() => onSwipe("right"));
    } else if (info.offset.x < -threshold) {
      controls.start({ x: -600, opacity: 0, transition: { duration: 0.3 } }).then(() => onSwipe("left"));
    } else {
      controls.start({ x: 0, rotate: 0, transition: { type: "spring", stiffness: 300 } });
    }
  };

  const swipeRight = () =>
    controls.start({ x: 600, opacity: 0, transition: { duration: 0.3 } }).then(() => onSwipe("right"));
  const swipeLeft = () =>
    controls.start({ x: -600, opacity: 0, transition: { duration: 0.3 } }).then(() => onSwipe("left"));

  const salary =
    job.salary_min && job.salary_max
      ? `$${(job.salary_min / 1000).toFixed(0)}k–$${(job.salary_max / 1000).toFixed(0)}k`
      : null;

  return (
    <div className="relative flex flex-col items-center">
      <motion.div
        drag={isTop ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        style={{ x, rotate }}
        animate={controls}
        onDragEnd={handleDragEnd}
        className="w-full max-w-sm cursor-grab active:cursor-grabbing select-none"
      >
        {/* Like / Skip overlays */}
        <motion.div
          style={{ opacity: likeOpacity }}
          className="pointer-events-none absolute left-4 top-6 z-10 rotate-[-15deg] rounded-xl border-4 border-green-400 px-3 py-1 text-xl font-extrabold text-green-400"
        >
          APPLY
        </motion.div>
        <motion.div
          style={{ opacity: skipOpacity }}
          className="pointer-events-none absolute right-4 top-6 z-10 rotate-[15deg] rounded-xl border-4 border-red-400 px-3 py-1 text-xl font-extrabold text-red-400"
        >
          SKIP
        </motion.div>

        <div className="rounded-2xl bg-white shadow-2xl border border-gray-100 overflow-hidden">
          {/* Header gradient */}
          <div className="h-24 bg-gradient-to-br from-brand-500 to-purple-600 flex items-end px-5 pb-3">
            <div className="h-14 w-14 rounded-xl bg-white shadow flex items-center justify-center text-xl font-bold text-brand-700">
              {job.logo_url ? (
                <img src={job.logo_url} alt="" className="h-10 w-10 object-contain" />
              ) : (
                (job.company || "?")[0]
              )}
            </div>
          </div>

          <div className="p-5">
            <h2 className="text-xl font-bold text-gray-900">{job.title}</h2>
            <p className="text-brand-600 font-medium">{job.company}</p>

            <div className="mt-3 flex flex-wrap gap-2 text-sm text-gray-500">
              {job.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={13} /> {job.location}
                </span>
              )}
              {job.is_remote && <Badge label="Remote" color="blue" />}
              {salary && (
                <span className="flex items-center gap-1 text-green-600 font-semibold">
                  <DollarSign size={13} /> {salary}
                </span>
              )}
            </div>

            {job.tags && job.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {job.tags.slice(0, 5).map((t) => (
                  <span key={t} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {job.match_score !== undefined && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Match score</span>
                  <span className="font-semibold text-brand-600">{job.match_score}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100">
                  <div
                    className="h-1.5 rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-all"
                    style={{ width: `${job.match_score}%` }}
                  />
                </div>
              </div>
            )}

            {job.description && (
              <p className="mt-3 text-sm text-gray-600 line-clamp-3">
                {job.description.replace(/<[^>]+>/g, " ")}
              </p>
            )}

            {job.url && (
              <a
                href={job.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                View full listing <ExternalLink size={11} />
              </a>
            )}
          </div>

          {/* Action buttons */}
          {isTop && (
            <div className="border-t border-gray-100">
              <div className="flex">
                <button
                  onClick={swipeLeft}
                  className="flex flex-1 items-center justify-center gap-2 py-4 text-gray-500 hover:bg-red-50 hover:text-red-500 transition-colors font-medium text-sm"
                >
                  <X size={18} /> Skip
                </button>
                <div className="w-px bg-gray-100" />
                <button
                  onClick={swipeRight}
                  className="flex flex-1 items-center justify-center gap-2 py-4 text-gray-500 hover:bg-green-50 hover:text-green-600 transition-colors font-medium text-sm"
                >
                  <Heart size={18} /> Track & Apply
                </button>
              </div>
              <p className="text-center text-xs text-gray-400 pb-2 -mt-1">
                "Track & Apply" saves to your tracker — then open the listing to submit
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
