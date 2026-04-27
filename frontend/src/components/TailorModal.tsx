import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Save, Download, Send, Plus, Trash2, ChevronDown, ChevronUp, RefreshCw,
  CheckCircle2, AlertCircle, ExternalLink, Briefcase, GraduationCap,
  Wrench, FileText, User, Folder,
} from "lucide-react";
import toast from "react-hot-toast";
import type { DocumentTemplate, Job } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpItem {
  title?: string;
  company?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  dates?: string;
  bullets?: string[];
}

interface EduItem {
  degree?: string;
  school?: string;
  year?: string;
  gpa?: string;
}

interface ProjectItem {
  name?: string;
  description?: string;
  tech?: string[];
  url?: string;
}

export interface TailoredResume {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  github_url?: string;
  portfolio_url?: string;
  summary?: string;
  experience?: ExpItem[];
  education?: EduItem[];
  skills?: string[];
  certifications?: string[];
  projects?: ProjectItem[];
  [key: string]: unknown;
}

interface Props {
  open: boolean;
  job: Job;
  initialResume: TailoredResume;
  initialCoverLetter: string;
  resumeTemplates: DocumentTemplate[];
  coverTemplates: DocumentTemplate[];
  resumeTemplateId: number | null;
  coverTemplateId: number | null;
  onResumeTemplateChange: (id: number | null) => void;
  onCoverTemplateChange: (id: number | null) => void;
  onClose: () => void;
  onSave: (resume: TailoredResume, coverLetter: string) => Promise<void>;
  onDownload: (resume: TailoredResume, coverLetter: string) => Promise<void>;
  onRetailor?: () => Promise<void> | void;
  onApply: () => void;
  saving: boolean;
  downloading: boolean;
  retailoring?: boolean;
}

type Tab = "resume" | "cover";

// ─── Auto-grow textarea ──────────────────────────────────────────────────────

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className = "",
  minRows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={minRows}
      className={`w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm leading-relaxed focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 transition-colors overflow-hidden ${className}`}
    />
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-brand-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-800">{title}</span>
        </div>
        {open ? (
          <ChevronUp size={15} className="text-gray-400" />
        ) : (
          <ChevronDown size={15} className="text-gray-400" />
        )}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t border-gray-100">{children}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TailorModal({
  open,
  job,
  initialResume,
  initialCoverLetter,
  resumeTemplates,
  coverTemplates,
  resumeTemplateId,
  coverTemplateId,
  onResumeTemplateChange,
  onCoverTemplateChange,
  onClose,
  onSave,
  onDownload,
  onRetailor,
  onApply,
  saving,
  downloading,
  retailoring = false,
}: Props) {
  const [tab, setTab] = useState<Tab>("resume");
  const [resume, setResume] = useState<TailoredResume>(initialResume);
  const [coverLetter, setCoverLetter] = useState(initialCoverLetter);
  const [isDirty, setIsDirty] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  // Sync when AI produces new content
  useEffect(() => {
    setResume(initialResume);
    setCoverLetter(initialCoverLetter);
    setIsDirty(false);
    setSavedOnce(false);
  }, [initialResume, initialCoverLetter]);

  const mark = () => { setIsDirty(true); setSavedOnce(false); };

  // ── Resume mutators ────────────────────────────────────────────────────────

  const setField = (key: keyof TailoredResume, value: unknown) => {
    setResume((r) => ({ ...r, [key]: value }));
    mark();
  };

  const setExpBullet = (ei: number, bi: number, val: string) => {
    setResume((r) => {
      const exp = (r.experience ?? []).map((e, i) => {
        if (i !== ei) return e;
        const bullets = [...(e.bullets ?? [])];
        bullets[bi] = val;
        return { ...e, bullets };
      });
      return { ...r, experience: exp };
    });
    mark();
  };

  const addBullet = (ei: number) => {
    setResume((r) => {
      const exp = (r.experience ?? []).map((e, i) =>
        i === ei ? { ...e, bullets: [...(e.bullets ?? []), ""] } : e
      );
      return { ...r, experience: exp };
    });
    mark();
  };

  const removeBullet = (ei: number, bi: number) => {
    setResume((r) => {
      const exp = (r.experience ?? []).map((e, i) => {
        if (i !== ei) return e;
        const bullets = (e.bullets ?? []).filter((_, j) => j !== bi);
        return { ...e, bullets };
      });
      return { ...r, experience: exp };
    });
    mark();
  };

  const removeSkill = (idx: number) => {
    setResume((r) => {
      const skills = (r.skills ?? []).filter((_, i) => i !== idx);
      return { ...r, skills };
    });
    mark();
  };

  const setProjectDesc = (pi: number, val: string) => {
    setResume((r) => {
      const projects = (r.projects ?? []).map((p, i) =>
        i === pi ? { ...p, description: val } : p
      );
      return { ...r, projects };
    });
    mark();
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const dateRange = (exp: ExpItem) => {
    if (exp.dates) return exp.dates;
    const s = exp.start_date || "";
    const e = exp.end_date || "Present";
    return s ? `${s} – ${e}` : "";
  };

  const wordCount = coverLetter.trim()
    ? coverLetter.trim().split(/\s+/).length
    : 0;

  const handleSave = async () => {
    await onSave(resume, coverLetter);
    setIsDirty(false);
    setSavedOnce(true);
  };

  const handleDownload = () => onDownload(resume, coverLetter);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 flex w-full max-w-4xl flex-col rounded-2xl bg-gray-50 shadow-2xl"
            style={{ maxHeight: "92vh" }}
          >
            {/* ── Header ── */}
            <div className="flex items-start justify-between gap-4 rounded-t-2xl border-b border-gray-200 bg-white px-6 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-gray-900 truncate">
                    Tailored Resume
                  </h2>
                  <span className="text-gray-400">·</span>
                  <span className="text-sm font-medium text-gray-700 truncate">
                    {job.title}
                    {job.company ? ` at ${job.company}` : ""}
                  </span>
                  {savedOnce && !isDirty && (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      <CheckCircle2 size={11} />
                      Saved
                    </span>
                  )}
                  {isDirty && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      <AlertCircle size={11} />
                      Unsaved changes
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Edit inline · changes are saved to this job only · used by Chrome Extension
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex-shrink-0 rounded-lg p-1.5 hover:bg-gray-100 transition-colors"
              >
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            {/* ── Tabs ── */}
            <div className="flex gap-1 border-b border-gray-200 bg-white px-6">
              {(
                [
                  { key: "resume", label: "Resume", icon: FileText },
                  { key: "cover", label: "Cover Letter", icon: User },
                ] as { key: Tab; label: string; icon: React.ElementType }[]
              ).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px ${
                    tab === key
                      ? "border-brand-600 text-brand-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* ═══ RESUME TAB ═══ */}
              {tab === "resume" && (
                <>
                  {/* Contact card — read-only */}
                  <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Contact · read-only
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">
                      {resume.full_name && <span className="font-semibold">{resume.full_name}</span>}
                      {resume.email && <span>{resume.email}</span>}
                      {resume.phone && <span>{resume.phone}</span>}
                      {resume.location && <span>📍 {resume.location}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
                      {resume.linkedin_url && (
                        <a href={resume.linkedin_url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:text-brand-600">
                          LinkedIn <ExternalLink size={10} />
                        </a>
                      )}
                      {resume.github_url && (
                        <a href={resume.github_url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:text-brand-600">
                          GitHub <ExternalLink size={10} />
                        </a>
                      )}
                      {resume.portfolio_url && (
                        <a href={resume.portfolio_url} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 hover:text-brand-600">
                          Portfolio <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  <Section icon={FileText} title="Professional Summary">
                    <AutoTextarea
                      value={resume.summary ?? ""}
                      onChange={(v) => setField("summary", v)}
                      placeholder="Write a compelling summary for this role…"
                      minRows={3}
                    />
                  </Section>

                  {/* Experience */}
                  {(resume.experience ?? []).length > 0 && (
                    <Section icon={Briefcase} title="Experience">
                      <div className="space-y-5">
                        {(resume.experience ?? []).map((exp, ei) => (
                          <div key={ei} className={ei > 0 ? "border-t border-gray-100 pt-5" : ""}>
                            {/* Job header — read-only */}
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {exp.title || "Role"}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {[exp.company, exp.location, dateRange(exp)]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </p>
                              </div>
                            </div>

                            {/* Bullets */}
                            <div className="space-y-2 pl-1">
                              {(exp.bullets ?? []).map((bullet, bi) => (
                                <div key={bi} className="flex items-start gap-2">
                                  <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-400" />
                                  <AutoTextarea
                                    value={bullet}
                                    onChange={(v) => setExpBullet(ei, bi, v)}
                                    placeholder="Describe what you did and the impact…"
                                    minRows={1}
                                    className="flex-1 bg-gray-50 text-gray-800"
                                  />
                                  <button
                                    onClick={() => removeBullet(ei, bi)}
                                    className="mt-2 flex-shrink-0 rounded p-0.5 text-gray-300 hover:bg-red-50 hover:text-red-400 transition-colors"
                                    title="Remove bullet"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>

                            <button
                              onClick={() => addBullet(ei)}
                              className="mt-2 ml-3 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
                            >
                              <Plus size={12} />
                              Add bullet
                            </button>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Skills */}
                  {(resume.skills ?? []).length > 0 && (
                    <Section icon={Wrench} title="Skills">
                      <div className="flex flex-wrap gap-2">
                        {(resume.skills ?? []).map((skill, i) => (
                          <span
                            key={i}
                            className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 group"
                          >
                            {skill}
                            <button
                              onClick={() => removeSkill(i)}
                              className="ml-0.5 text-gray-300 hover:text-red-400 transition-colors"
                              title="Remove skill"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-gray-400">
                        Skills are reordered by relevance. Remove any that don't apply.
                      </p>
                    </Section>
                  )}

                  {/* Education */}
                  {(resume.education ?? []).length > 0 && (
                    <Section icon={GraduationCap} title="Education" defaultOpen={false}>
                      <div className="space-y-2">
                        {(resume.education ?? []).map((edu, i) => (
                          <div key={i} className="flex items-start justify-between rounded-lg bg-gray-50 px-3 py-2">
                            <div>
                              <p className="text-sm font-medium text-gray-800">{edu.degree}</p>
                              <p className="text-xs text-gray-500">
                                {[edu.school, edu.year].filter(Boolean).join(" · ")}
                                {edu.gpa ? ` · GPA ${edu.gpa}` : ""}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Projects */}
                  {(resume.projects ?? []).length > 0 && (
                    <Section icon={Folder} title="Projects" defaultOpen={false}>
                      <div className="space-y-4">
                        {(resume.projects ?? []).map((proj, pi) => (
                          <div key={pi} className={pi > 0 ? "border-t border-gray-100 pt-4" : ""}>
                            <div className="mb-1.5 flex items-center gap-2">
                              <p className="text-sm font-semibold text-gray-800">{proj.name}</p>
                              {proj.url && (
                                <a
                                  href={proj.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-gray-400 hover:text-brand-600"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                            {(proj.tech ?? []).length > 0 && (
                              <div className="mb-1.5 flex flex-wrap gap-1">
                                {(proj.tech ?? []).map((t, ti) => (
                                  <span key={ti} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                                    {t}
                                  </span>
                                ))}
                              </div>
                            )}
                            <AutoTextarea
                              value={proj.description ?? ""}
                              onChange={(v) => setProjectDesc(pi, v)}
                              placeholder="Describe this project…"
                              minRows={2}
                              className="bg-gray-50"
                            />
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  {/* Certifications */}
                  {(resume.certifications ?? []).length > 0 && (
                    <Section icon={CheckCircle2} title="Certifications" defaultOpen={false}>
                      <ul className="space-y-1">
                        {(resume.certifications ?? []).map((c, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                            <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                            {String(c)}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}
                </>
              )}

              {/* ═══ COVER LETTER TAB ═══ */}
              {tab === "cover" && (
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                    <p className="text-xs text-gray-500">
                      This cover letter is linked to <strong>{job.title}{job.company ? ` at ${job.company}` : ""}</strong>.
                      Save the draft and the Chrome Extension will auto-fill this into application forms.
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Cover Letter
                      </span>
                      <span className={`text-xs font-medium ${wordCount > 280 ? "text-red-500" : "text-gray-400"}`}>
                        {wordCount} / 280 words
                      </span>
                    </div>
                    <div className="p-4">
                      <AutoTextarea
                        value={coverLetter}
                        onChange={(v) => { setCoverLetter(v); mark(); }}
                        placeholder="Your tailored cover letter will appear here…"
                        minRows={16}
                        className="border-0 p-0 focus:ring-0 text-gray-800 leading-7"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Footer / Actions ── */}
            <div className="flex flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4 rounded-b-2xl sm:flex-row sm:items-center sm:justify-between">
              {/* Template selectors */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Resume:</label>
                  <select
                    value={resumeTemplateId ?? ""}
                    onChange={(e) => onResumeTemplateChange(e.target.value ? Number(e.target.value) : null)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {resumeTemplates.length === 0 && <option value="">No templates</option>}
                    {resumeTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Cover:</label>
                  <select
                    value={coverTemplateId ?? ""}
                    onChange={(e) => onCoverTemplateChange(e.target.value ? Number(e.target.value) : null)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
                  >
                    {coverTemplates.length === 0 && <option value="">No templates</option>}
                    {coverTemplates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                {onRetailor && (
                  <button
                    onClick={onRetailor}
                    disabled={retailoring}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw size={14} className={retailoring ? "animate-spin" : ""} />
                    {retailoring ? "Re-tailoring…" : "Re-tailor"}
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <Save size={14} />
                  {saving ? "Saving…" : savedOnce && !isDirty ? "Saved ✓" : "Save Draft"}
                </button>

                <button
                  onClick={handleDownload}
                  disabled={downloading || resumeTemplateId == null || coverTemplateId == null || !resumeTemplates.length}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  <Download size={14} />
                  {downloading ? "Building…" : "Download PDF"}
                </button>

                <button
                  onClick={onApply}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
                >
                  <Send size={14} />
                  Apply
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
