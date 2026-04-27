import { useEffect, useMemo, useState } from "react";
import { Search, RefreshCw, SlidersHorizontal, X, ChevronDown, DownloadCloud, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { JobCard } from "../components/jobs/JobCard";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { TailorModal, type TailoredResume } from "../components/TailorModal";
import api from "../api/client";
import { deleteLinkedinJob, resetJobsDatabase, searchJobs, syncLinkedinJobs, type LinkedinSyncParams } from "../api/jobs";
import {
  createApplication,
  exportTailoredPdfs,
  getApplications,
  getSavedTailorDraft,
  getSavedTailorJobIds,
  saveTailorDraft,
  tailorForJob,
} from "../api/applications";
import { getDocumentTemplates } from "../api/documentTemplates";
import { autoApplyApi } from "../api/autoApply";
import { useJobStore } from "../store/jobStore";
import type { DocumentTemplate, Job } from "../types";

interface Filters {
  remote: string;       // "" | "remote" | "onsite"
  job_type: string;     // "" | "full-time" | "part-time" | "contract" | "internship"
  min_salary: string;
  max_salary: string;
  location: string;
  source: string;
  sort: string;
}

type LinkedinSyncForm = {
  limit: string;
  offset: string;
  title_filter: string;
  location_filter: string;
  description_type: "text" | "html";
  type_filter: string;
  remote: "any" | "true" | "false";
  description_filter: string;
  organization_filter: string;
  industry_filter: string;
  seniority_filter: string;
  external_apply_url: "any" | "true";
  ai_work_arrangement_filter: string;
  ai_experience_level_filter: string;
  ai_visa_sponsorship_filter: "any" | "true";
  endpoint: string;
  order: "" | "asc" | "desc";
};

type ResetJobsForm = {
  source: "" | "linkedin" | "remoteok" | "arbeitnow" | "hackernews";
  location_filter: string;
  remote: "any" | "true" | "false";
  external_apply_url: "any" | "true" | "false";
};

const EMPTY_FILTERS: Filters = {
  remote: "",
  job_type: "",
  min_salary: "",
  max_salary: "",
  location: "",
  source: "",
  sort: "match",
};

const REMOTE_OPTIONS = [
  { value: "",       label: "Any" },
  { value: "remote", label: "Remote" },
  { value: "onsite", label: "On-site" },
];

const TYPE_OPTIONS = [
  { value: "",            label: "Any type" },
  { value: "full-time",   label: "Full-time" },
  { value: "part-time",   label: "Part-time" },
  { value: "contract",    label: "Contract" },
  { value: "internship",  label: "Internship" },
];

const SORT_OPTIONS = [
  { value: "match",  label: "Best match" },
  { value: "date",   label: "Most recent" },
  { value: "salary", label: "Highest salary" },
];

const SOURCE_OPTIONS = [
  { value: "",           label: "All sources" },
  { value: "linkedin",   label: "LinkedIn (RapidAPI)" },
  { value: "remoteok",   label: "RemoteOK" },
  { value: "arbeitnow",  label: "Arbeitnow" },
  { value: "hackernews", label: "HackerNews" },
];

const SOURCE_TABS = [
  { value: "", label: "All" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "remoteok", label: "RemoteOK" },
  { value: "arbeitnow", label: "Arbeitnow" },
  { value: "hackernews", label: "HackerNews" },
];

const DEFAULT_SYNC_FORM: LinkedinSyncForm = {
  limit: "100",
  offset: "0",
  title_filter: "",
  location_filter: "",
  description_type: "text",
  type_filter: "",
  remote: "any",
  description_filter: "",
  organization_filter: "",
  industry_filter: "",
  seniority_filter: "",
  external_apply_url: "any",
  ai_work_arrangement_filter: "",
  ai_experience_level_filter: "",
  ai_visa_sponsorship_filter: "any",
  order: "",
  endpoint: "",
};
const DEFAULT_RESET_FORM: ResetJobsForm = {
  source: "",
  location_filter: "",
  remote: "any",
  external_apply_url: "any",
};
const VIEWED_JOBS_KEY = "jobflow_viewed_job_ids";
const NEW_SYNC_WINDOW_MS = 5 * 60 * 1000;

function activeFilterCount(f: Filters) {
  return [f.remote, f.job_type, f.min_salary, f.max_salary, f.location, f.source]
    .filter(Boolean).length;
}

export function JobsPage() {
  const { jobs, setJobs, isLoading, setLoading } = useJobStore();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [appliedIds, setAppliedIds] = useState<Set<number>>(new Set());
  const [queuedIds, setQueuedIds] = useState<Set<number>>(new Set());
  const [problematicIds, setProblematicIds] = useState<Set<number>>(new Set());
  const [tailorModal, setTailorModal] = useState<{
    job: Job;
    resume: TailoredResume;
    coverLetter: string;
  } | null>(null);
  const [easyApplyModal, setEasyApplyModal] = useState<{
    job: Job;
    resume: TailoredResume;
    coverLetter: string;
  } | null>(null);
  const [enhancingEasyApply, setEnhancingEasyApply] = useState(false);
  const [approvingEasyApply, setApprovingEasyApply] = useState(false);
  const [liConfigured, setLiConfigured] = useState(false);
  const [resumeTemplates, setResumeTemplates] = useState<DocumentTemplate[]>([]);
  const [coverTemplates, setCoverTemplates] = useState<DocumentTemplate[]>([]);
  const [resumeTemplateId, setResumeTemplateId] = useState<number | null>(null);
  const [coverTemplateId, setCoverTemplateId] = useState<number | null>(null);
  const [exportingZip, setExportingZip] = useState(false);
  const [savingTailorDraft, setSavingTailorDraft] = useState(false);
  const [retailoringTailorDraft, setRetailoringTailorDraft] = useState(false);
  const [syncingLinkedin, setSyncingLinkedin] = useState(false);
  const [resettingJobs, setResettingJobs] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetForm, setResetForm] = useState<ResetJobsForm>(DEFAULT_RESET_FORM);
  const [deletingLinkedinJobId, setDeletingLinkedinJobId] = useState<number | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [apiConfig, setApiConfig] = useState<{ rapidapi_path?: string; rapidapi_host?: string }>({});
  const [showAdvancedSync, setShowAdvancedSync] = useState(false);
  const [syncForm, setSyncForm] = useState<LinkedinSyncForm>({
    ...DEFAULT_SYNC_FORM,
    title_filter: query,
    location_filter: filters.location,
    remote: filters.remote === "remote" ? "true" : filters.remote === "onsite" ? "false" : "any",
  });
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [viewedIds, setViewedIds] = useState<Set<number>>(new Set());
  const [sortViewedIds, setSortViewedIds] = useState<Set<number>>(new Set());
  const [tailoredJobIds, setTailoredJobIds] = useState<Set<number>>(new Set());

  const updateJobMatchScore = (jobId: number, score?: number) => {
    if (typeof score !== "number") return;
    const next = jobs.map((j) => (j.id === jobId ? { ...j, match_score: score } : j));
    setJobs(next);
  };

  useEffect(() => {
    getSavedTailorJobIds()
      .then((r) => setTailoredJobIds(new Set(r.data.job_ids || [])))
      .catch(() => {});
  }, []);

  useEffect(() => {
    autoApplyApi.getCredentialsStatus()
      .then((r) => setLiConfigured(r.data.configured))
      .catch(() => {});
    api.get("/users/me/api-keys")
      .then((r) => { if (r.data.config) setApiConfig(r.data.config); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    Promise.all([getDocumentTemplates("resume"), getDocumentTemplates("cover_letter")])
      .then(([rRes, cRes]) => {
        setResumeTemplates(rRes.data);
        setCoverTemplates(cRes.data);
        if (rRes.data[0]) setResumeTemplateId(rRes.data[0].id);
        if (cRes.data[0]) setCoverTemplateId(cRes.data[0].id);
      })
      .catch(() => {});
  }, []);

  const load = async (p = 1, f = filters, refreshSources = true) => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page: p,
        per_page: 20,
        sort: f.sort || "match",
        refresh_sources: refreshSources,
      };
      if (query)          params.q = query;
      if (f.location)     params.location = f.location;
      if (f.remote)       params.remote = f.remote;
      if (f.job_type)     params.job_type = f.job_type;
      if (f.min_salary)   params.min_salary = parseInt(f.min_salary);
      if (f.max_salary)   params.max_salary = parseInt(f.max_salary);
      if (f.source)       params.source = f.source;

      const { data } = await searchJobs(params);
      setJobs(data.jobs ?? []);
      setTotal(data.total ?? 0);
      setHasNext(data.has_next ?? false);
      setPage(p);
    } catch {
      toast.error("Failed to load jobs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1); }, []);
  useEffect(() => {
    getApplications()
      .then((r) => {
        const apps = r.data || [];
        const ids = new Set<number>(
          apps
            .filter((a: any) => a?.status && a.status !== "skipped")
            .map((a: any) => a?.job?.id)
            .filter((id: any) => typeof id === "number")
        );
        const queued = new Set<number>(
          apps
            .filter((a: any) => a?.auto_apply_status === "queued" || a?.auto_apply_status === "running")
            .map((a: any) => a?.job?.id)
            .filter((id: any) => typeof id === "number")
        );
        const issues = new Set<number>(
          apps
            .filter((a: any) => a?.auto_apply_status === "error" || !!a?.auto_apply_error)
            .map((a: any) => a?.job?.id)
            .filter((id: any) => typeof id === "number")
        );
        setAppliedIds(ids);
        setQueuedIds(queued);
        setProblematicIds(issues);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWED_JOBS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const ids = parsed.filter((v) => typeof v === "number");
        const loaded = new Set(ids);
        setViewedIds(loaded);
        setSortViewedIds(loaded);
      }
    } catch {
      // Ignore invalid local storage data.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VIEWED_JOBS_KEY, JSON.stringify(Array.from(viewedIds)));
    } catch {
      // Ignore storage write issues (private mode/quota).
    }
  }, [viewedIds]);

  const markJobViewed = (jobId?: number | null) => {
    if (typeof jobId !== "number") return;
    setViewedIds((prev) => {
      if (prev.has(jobId)) return prev;
      return new Set([...prev, jobId]);
    });
  };

  const isJobNewSync = (job: Job) => {
    if (!job.fetched_at) return false;
    const ts = Date.parse(job.fetched_at);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts <= NEW_SYNC_WINDOW_MS;
  };

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const aViewed = sortViewedIds.has(a.id);
      const bViewed = sortViewedIds.has(b.id);
      if (aViewed !== bViewed) return aViewed ? 1 : -1;

      const aFetched = a.fetched_at ? Date.parse(a.fetched_at) : 0;
      const bFetched = b.fetched_at ? Date.parse(b.fetched_at) : 0;
      if (aFetched !== bFetched) return bFetched - aFetched;

      const aPosted = a.posted_at ? Date.parse(a.posted_at) : 0;
      const bPosted = b.posted_at ? Date.parse(b.posted_at) : 0;
      return bPosted - aPosted;
    });
  }, [jobs, sortViewedIds]);
  const selectedJob = useMemo(
    () => sortedJobs.find((j) => j.id === selectedJobId) || null,
    [sortedJobs, selectedJobId]
  );

  useEffect(() => {
    if (!jobs.length) {
      setSelectedJobId(null);
      return;
    }
    if (!sortedJobs.some((j) => j.id === selectedJobId)) {
      setSelectedJobId(sortedJobs[0].id);
    }
  }, [jobs, sortedJobs, selectedJobId]);

  const handleApply = async (job: Job) => {
    try {
      await createApplication({ job_id: job.id });
      setAppliedIds((s) => new Set([...s, job.id]));
      toast.success(`Applied to ${job.title}!`);
    } catch (err: any) {
      const detail = err.response?.data?.detail ?? "";
      if (detail.includes("Already applied")) {
        setAppliedIds((s) => new Set([...s, job.id]));
        toast("Already applied", { icon: "ℹ️" });
      } else {
        toast.error(detail || "Apply failed");
      }
    }
  };

  const handleTailor = async (job: Job) => {
    try {
      const saved = await getSavedTailorDraft(job.id);
      if (saved.data?.saved && saved.data.tailored_resume && saved.data.cover_letter) {
        setTailorModal({
          job,
          resume: saved.data.tailored_resume,
          coverLetter: saved.data.cover_letter || "",
        });
        toast.success("Loaded saved tailored draft");
        return;
      }
      const { data } = await tailorForJob(job.id);
      updateJobMatchScore(job.id, data?.tailored_match_score);
      setTailorModal({
        job,
        resume: data?.tailored_resume || {},
        coverLetter: data?.cover_letter || "",
      });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Add an AI API key in Settings");
    }
  };

  const handleViewTailored = async (job: Job) => {
    try {
      const saved = await getSavedTailorDraft(job.id);
      if (saved.data?.saved && saved.data.tailored_resume && saved.data.cover_letter) {
        setTailorModal({
          job,
          resume: saved.data.tailored_resume,
          coverLetter: saved.data.cover_letter || "",
        });
        return;
      }
      toast("No saved tailored resume for this job yet", { icon: "ℹ️" });
    } catch {
      toast.error("Failed to load saved tailored resume");
    }
  };

  const handleSaveTailorDraft = async (resume: TailoredResume, coverLetter: string) => {
    if (!tailorModal) return;
    setSavingTailorDraft(true);
    try {
      await saveTailorDraft({
        job_id: tailorModal.job.id,
        tailored_resume: resume,
        cover_letter: coverLetter,
      });
      setTailoredJobIds((s) => new Set(s).add(tailorModal.job.id));
      toast.success("Tailored draft saved — Chrome Extension will use this");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to save tailored draft");
      throw err;
    } finally {
      setSavingTailorDraft(false);
    }
  };

  const exportTailoredZipFor = async (
    job: Job,
    tailoredResume: Record<string, any>,
    coverLetter: string
  ) => {
    if (resumeTemplateId == null || coverTemplateId == null) {
      toast.error("Choose resume and cover letter templates");
      return;
    }
    setExportingZip(true);
    try {
      const { data } = await exportTailoredPdfs({
        tailored_resume: tailoredResume,
        cover_letter: coverLetter,
        resume_template_id: resumeTemplateId,
        cover_template_id: coverTemplateId,
        job_title: job.title,
        company: job.company || undefined,
      });
      const blob = new Blob([data], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = (tailoredResume?.full_name as string)?.replace(/\s+/g, "_") || "application";
      a.href = url;
      a.download = `${base.replace(/[^\w.-]/g, "_")}_tailored_documents.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Download started");
    } catch (err: any) {
      let msg = err.response?.data?.detail;
      if (err.response?.data instanceof ArrayBuffer) {
        try {
          const txt = new TextDecoder().decode(err.response.data);
          const j = JSON.parse(txt);
          msg = j.detail;
        } catch {
          msg = "Export failed";
        }
      }
      toast.error(typeof msg === "string" ? msg : "Could not build PDFs");
    } finally {
      setExportingZip(false);
    }
  };

  const handleDownloadTailoredZip = async (resume: TailoredResume, coverLetter: string) => {
    if (!tailorModal) return;
    await exportTailoredZipFor(tailorModal.job, resume, coverLetter);
  };

  const handleRetailorTailorModal = async () => {
    if (!tailorModal) return;
    setRetailoringTailorDraft(true);
    try {
      const { data } = await tailorForJob(tailorModal.job.id);
      updateJobMatchScore(tailorModal.job.id, data?.tailored_match_score);
      setTailorModal((prev) =>
        prev
          ? {
              ...prev,
              resume: data?.tailored_resume || prev.resume,
              coverLetter: data?.cover_letter || prev.coverLetter,
            }
          : prev
      );
      const delta = data?.match_delta;
      const score = data?.tailored_match_score;
      if (typeof score === "number") {
        const trend = typeof delta === "number" ? (delta > 0 ? "up" : delta < 0 ? "down" : "unchanged") : "updated";
        toast.success(`Re-tailored. Match ${trend}: ${score}%`);
      } else {
        toast.success("AI re-tailored your resume and cover letter");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Could not re-tailor with AI");
    } finally {
      setRetailoringTailorDraft(false);
    }
  };

  const handleEasyApplyAI = async (job: Job) => {
    try {
      const saved = await getSavedTailorDraft(job.id);
      if (saved.data?.saved && saved.data.tailored_resume && saved.data.cover_letter) {
        setEasyApplyModal({
          job,
          resume: saved.data.tailored_resume,
          coverLetter: saved.data.cover_letter || "",
        });
        toast.success("Loaded saved tailored draft");
        return;
      }
      const { data } = await tailorForJob(job.id);
      setEasyApplyModal({
        job,
        resume: data?.tailored_resume || {},
        coverLetter: data?.cover_letter || "",
      });
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Unable to tailor resume for this job");
    }
  };

  const handleEnhanceEasyApply = async () => {
    if (!easyApplyModal) return;
    setEnhancingEasyApply(true);
    try {
      const { data } = await tailorForJob(easyApplyModal.job.id);
      updateJobMatchScore(easyApplyModal.job.id, data?.tailored_match_score);
      setEasyApplyModal((prev) =>
        prev
          ? {
              ...prev,
              resume: data?.tailored_resume || prev.resume,
              coverLetter: data?.cover_letter || prev.coverLetter,
            }
          : prev
      );
      const delta = data?.match_delta;
      const score = data?.tailored_match_score;
      if (typeof score === "number") {
        const trend = typeof delta === "number" ? (delta > 0 ? "up" : delta < 0 ? "down" : "unchanged") : "updated";
        toast.success(`Re-tailored. Match ${trend}: ${score}%`);
      } else {
        toast.success("AI re-tailored your resume and cover letter");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Could not re-tailor with AI");
    } finally {
      setEnhancingEasyApply(false);
    }
  };

  const handleApproveEasyApply = async () => {
    if (!easyApplyModal) return;
    setApprovingEasyApply(true);
    try {
      const guard = await autoApplyApi.getGuardrails(easyApplyModal.job.id);
      if (!guard.data.ready) {
        const failed = (guard.data.checks || [])
          .filter((c) => !c.ok)
          .map((c) => c.message)
          .slice(0, 3)
          .join(" | ");
        toast.error(failed || "Apply Guardrails blocked submit. Please review your draft/settings.");
        return;
      }
      await autoApplyApi.triggerApply(easyApplyModal.job.id, {
        cover_letter: easyApplyModal.coverLetter,
        tailored_resume: easyApplyModal.resume,
      });
      setAppliedIds((s) => new Set([...s, easyApplyModal.job.id]));
      toast.success("Approved. Easy Apply queued.");
      setEasyApplyModal(null);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to start Easy Apply");
    } finally {
      setApprovingEasyApply(false);
    }
  };

  const openSyncLinkedinModal = () => {
    setSyncForm((prev) => ({
      ...prev,
      title_filter: query || prev.title_filter,
      location_filter: filters.location || prev.location_filter,
      remote: filters.remote === "remote" ? "true" : filters.remote === "onsite" ? "false" : prev.remote,
      endpoint: prev.endpoint || apiConfig.rapidapi_path || "/active-jb-7d",
    }));
    setShowSyncModal(true);
  };

  const handleSyncLinkedin = async () => {
    const params: LinkedinSyncParams = {
      limit: Number(syncForm.limit || 100),
      offset: Number(syncForm.offset || 0),
      title_filter: syncForm.title_filter || undefined,
      location_filter: syncForm.location_filter || undefined,
      description_type: syncForm.description_type || "text",
      type_filter: syncForm.type_filter || undefined,
      remote: syncForm.remote === "any" ? undefined : syncForm.remote === "true",
      description_filter: syncForm.description_filter || undefined,
      organization_filter: syncForm.organization_filter || undefined,
      industry_filter: syncForm.industry_filter || undefined,
      seniority_filter: syncForm.seniority_filter || undefined,
      external_apply_url: syncForm.external_apply_url === "true" ? true : undefined,
      ai_work_arrangement_filter: syncForm.ai_work_arrangement_filter || undefined,
      ai_experience_level_filter: syncForm.ai_experience_level_filter || undefined,
      ai_visa_sponsorship_filter: syncForm.ai_visa_sponsorship_filter === "true" ? true : undefined,
      order: syncForm.order || undefined,
      endpoint: syncForm.endpoint || undefined,
    };
    setSyncingLinkedin(true);
    try {
      const { data } = await syncLinkedinJobs(params);
      toast.success(
        `LinkedIn sync: fetched ${data?.fetched ?? 0}, saved ${data?.saved ?? 0}, skipped ${data?.skipped_existing ?? 0}`
      );
      setShowSyncModal(false);
      await load(1, filters, false);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "LinkedIn sync failed");
    } finally {
      setSyncingLinkedin(false);
    }
  };

  const openResetJobsModal = () => {
    setResetForm((prev) => ({ ...DEFAULT_RESET_FORM, source: filters.source as ResetJobsForm["source"] }));
    setShowResetModal(true);
  };

  const handleResetJobs = async () => {
    setResettingJobs(true);
    try {
      const { data } = await resetJobsDatabase({
        source: resetForm.source || undefined,
        location_filter: resetForm.location_filter || undefined,
        remote: resetForm.remote === "any" ? undefined : resetForm.remote === "true",
        external_apply_url:
          resetForm.external_apply_url === "any" ? undefined : resetForm.external_apply_url === "true",
      });
      toast.success(
        `${data?.message || "Jobs reset completed"}: deleted ${data?.deleted_jobs ?? 0}, kept tracked ${data?.kept_tracked_jobs ?? 0}`
      );
      setShowResetModal(false);
      await load(1, filters, false);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to reset jobs");
    } finally {
      setResettingJobs(false);
    }
  };

  const handleDeleteLinkedinJob = async (job: Job) => {
    if (!job?.id) return;
    if (!confirm(`Delete "${job.title}" from LinkedIn jobs database?`)) return;
    setDeletingLinkedinJobId(job.id);
    try {
      await deleteLinkedinJob(job.id);
      setJobs(jobs.filter((j) => j.id !== job.id));
      setTotal((t) => Math.max(0, t - 1));
      toast.success("LinkedIn job deleted from database");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Failed to delete LinkedIn job");
    } finally {
      setDeletingLinkedinJobId(null);
    }
  };

  const setFilter = (k: keyof Filters) => (v: string) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const clearFilters = () => {
    const reset = EMPTY_FILTERS;
    setFilters(reset);
    load(1, reset);
  };

  const activeCount = activeFilterCount(filters);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Filter sidebar */}
      <AnimatePresence>
        {showFilters && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white"
          >
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-semibold text-gray-900">Filters</h2>
                {activeCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="text-xs text-red-500 hover:text-red-600 font-medium"
                  >
                    Clear all ({activeCount})
                  </button>
                )}
              </div>

              <div className="space-y-6">
                {/* Work type */}
                <FilterSection label="Work Type">
                  <ToggleGroup
                    options={REMOTE_OPTIONS}
                    value={filters.remote}
                    onChange={setFilter("remote")}
                  />
                </FilterSection>

                {/* Job type */}
                <FilterSection label="Job Type">
                  <ToggleGroup
                    options={TYPE_OPTIONS}
                    value={filters.job_type}
                    onChange={setFilter("job_type")}
                  />
                </FilterSection>

                {/* Location */}
                <FilterSection label="Location">
                  <input
                    type="text"
                    placeholder="e.g. Singapore, London"
                    value={filters.location}
                    onChange={(e) => setFilter("location")(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </FilterSection>

                {/* Salary range */}
                <FilterSection label="Salary Range (USD/yr)">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={filters.min_salary}
                      onChange={(e) => setFilter("min_salary")(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-gray-400 text-sm flex-shrink-0">–</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={filters.max_salary}
                      onChange={(e) => setFilter("max_salary")(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  {/* Quick salary presets */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {[
                      { label: "$40k+", min: "40000" },
                      { label: "$60k+", min: "60000" },
                      { label: "$80k+", min: "80000" },
                      { label: "$100k+", min: "100000" },
                    ].map((p) => (
                      <button
                        key={p.label}
                        onClick={() => setFilters((f) => ({ ...f, min_salary: p.min, max_salary: "" }))}
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                          filters.min_salary === p.min
                            ? "bg-brand-600 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </FilterSection>

                {/* Sort by */}
                <FilterSection label="Sort By">
                  <ToggleGroup
                    options={SORT_OPTIONS}
                    value={filters.sort}
                    onChange={setFilter("sort")}
                  />
                </FilterSection>

                {/* Source */}
                <FilterSection label="Job Source">
                  <ToggleGroup
                    options={SOURCE_OPTIONS}
                    value={filters.source}
                    onChange={setFilter("source")}
                  />
                </FilterSection>

                <Button className="w-full" onClick={() => load(1)}>
                  Apply Filters
                </Button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-auto p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Browse Jobs</h1>
          <p className="mt-1 text-gray-500">Listings from LinkedIn, RemoteOK, Arbeitnow, and HackerNews</p>
        </div>

        {/* Source tabs */}
        <div className="mb-4 sticky top-0 z-20 bg-gray-50/95 backdrop-blur py-2">
          <div className="text-xs font-semibold text-gray-500 mb-2">Source</div>
          <div className="overflow-x-auto">
            <div className="inline-flex gap-2 rounded-xl border border-gray-200 bg-white p-1 shadow-sm min-w-max">
            {SOURCE_TABS.map((tab) => {
              const active = filters.source === tab.value;
              return (
                <button
                  key={tab.value || "all"}
                  onClick={() => {
                    const next = { ...filters, source: tab.value };
                    setFilters(next);
                    load(1, next);
                  }}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-600 text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
            </div>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search title, skill, company…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load(1)}
              className="w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`relative flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              showFilters || activeCount > 0
                ? "border-brand-400 bg-brand-50 text-brand-700"
                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white font-bold">
                {activeCount}
              </span>
            )}
          </button>

          <Button onClick={() => load(1)} loading={isLoading} variant="secondary">
            <RefreshCw size={14} /> Search
          </Button>
          <Button onClick={openSyncLinkedinModal} loading={syncingLinkedin} variant="secondary">
            <DownloadCloud size={14} /> Sync LinkedIn Jobs
          </Button>
          <Button onClick={openResetJobsModal} loading={resettingJobs} variant="secondary">
            <RotateCcw size={14} /> Reset Jobs DB
          </Button>
        </div>

        {/* Active filter chips */}
        {activeCount > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {filters.remote && (
              <FilterChip label={filters.remote === "remote" ? "Remote" : "On-site"} onRemove={() => { setFilter("remote")(""); load(1, { ...filters, remote: "" }); }} />
            )}
            {filters.job_type && (
              <FilterChip label={filters.job_type} onRemove={() => { setFilter("job_type")(""); load(1, { ...filters, job_type: "" }); }} />
            )}
            {filters.location && (
              <FilterChip label={`📍 ${filters.location}`} onRemove={() => { setFilter("location")(""); load(1, { ...filters, location: "" }); }} />
            )}
            {(filters.min_salary || filters.max_salary) && (
              <FilterChip
                label={`$${filters.min_salary || "0"}${filters.max_salary ? `–$${filters.max_salary}` : "+"}`}
                onRemove={() => { setFilters((f) => ({ ...f, min_salary: "", max_salary: "" })); load(1, { ...filters, min_salary: "", max_salary: "" }); }}
              />
            )}
            {filters.source && (
              <FilterChip label={filters.source} onRemove={() => { setFilter("source")(""); load(1, { ...filters, source: "" }); }} />
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20">
            <RefreshCw size={28} className="animate-spin text-brand-400" />
          </div>
        ) : sortedJobs.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <p className="mb-3">No jobs found with these filters.</p>
            {activeCount > 0 && (
              <button onClick={clearFilters} className="text-sm text-brand-600 hover:underline">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">{total} job{total !== 1 ? "s" : ""} found</p>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>Sort:</span>
                <select
                  value={filters.sort}
                  onChange={(e) => { setFilter("sort")(e.target.value); load(1, { ...filters, sort: e.target.value }); }}
                  className="rounded-lg border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                >
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(360px,42%)_minmax(0,1fr)] items-start">
              <div className="space-y-3">
                {sortedJobs.map((job) => {
                  const selected = selectedJobId === job.id;
                  return (
                    <motion.div
                      key={job.id}
                      layout
                      onClick={() => {
                        setSelectedJobId(job.id);
                        markJobViewed(job.id);
                      }}
                      className={`cursor-pointer rounded-2xl transition-all ${selected ? "ring-2 ring-brand-400" : "ring-0"}`}
                    >
                      <JobCard
                        job={job}
                        onApply={handleApply}
                        onTailor={handleTailor}
                        onEasyApplyAI={handleEasyApplyAI}
                        onViewed={(j) => markJobViewed(j.id)}
                        viewed={viewedIds.has(job.id)}
                        isNew={isJobNewSync(job)}
                        hasIssue={problematicIds.has(job.id)}
                        applied={appliedIds.has(job.id)}
                        queued={queuedIds.has(job.id)}
                        liConfigured={liConfigured}
                        hasTailoredDraft={tailoredJobIds.has(job.id)}
                        onViewTailored={handleViewTailored}
                        onDeleteLinkedin={handleDeleteLinkedinJob}
                        deletingLinkedin={deletingLinkedinJobId === job.id}
                      />
                    </motion.div>
                  );
                })}
              </div>

              <AnimatePresence mode="wait">
                {selectedJob && (
                  <motion.aside
                    key={selectedJobId}
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                    className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    {(() => {
                      const job = selectedJob;
                      return (
                        <div>
                          <div className="mb-3">
                            <h3 className="text-xl font-bold text-gray-900">{job.title}</h3>
                            <p className="text-sm text-gray-500">
                              {job.company || "Unknown company"} {job.location ? `· ${job.location}` : ""}
                            </p>
                          </div>

                          <div className="mb-4 flex flex-wrap gap-2 text-xs">
                            {job.source && <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">{job.source}</span>}
                            {job.job_type && <span className="rounded-full bg-gray-100 px-2 py-1 text-gray-600">{job.job_type}</span>}
                            {job.is_remote && <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">Remote</span>}
                            {job.is_easy_apply && <span className="rounded-full bg-[#e6f4fb] px-2 py-1 text-[#0077b5]">Easy Apply</span>}
                            {job.is_available === false && (
                              <span className="rounded-full bg-gray-200 px-2 py-1 text-gray-700">
                                {job.availability_reason || "Unavailable"}
                              </span>
                            )}
                          </div>

                          <div className="mb-4">
                            <h4 className="text-sm font-semibold text-gray-800 mb-1">About this job</h4>
                            <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                              <p><span className="font-medium text-gray-800">Source:</span> {job.source || "—"}</p>
                              <p><span className="font-medium text-gray-800">Work type:</span> {job.job_type || "—"}</p>
                              <p><span className="font-medium text-gray-800">Location:</span> {job.location || "—"}</p>
                              <p><span className="font-medium text-gray-800">Posted:</span> {job.posted_at ? new Date(job.posted_at).toLocaleDateString() : "—"}</p>
                            </div>
                          </div>

                          <div className="max-h-[52vh] overflow-y-auto pr-1">
                            <h4 className="text-sm font-semibold text-gray-800 mb-1">Description</h4>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                              {(job.description || "No description provided.").replace(/<[^>]+>/g, " ")}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.aside>
                )}
              </AnimatePresence>
            </div>

            <div className="mt-6 flex justify-center gap-2">
              {page > 1 && (
                <Button variant="secondary" onClick={() => load(page - 1)}>← Previous</Button>
              )}
              {hasNext && (
                <Button variant="secondary" onClick={() => load(page + 1)}>Next →</Button>
              )}
            </div>
          </>
        )}
      </div>

      <Modal
        open={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        title="Sync LinkedIn Jobs (RapidAPI)"
        size="lg"
      >
        <div className="space-y-4 pb-1">
          {/* Endpoint selector — top of modal */}
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
            <label className="block text-xs font-semibold text-blue-700 mb-1.5">API Endpoint</label>
            <div className="flex gap-2 items-center">
              <select
                value={syncForm.endpoint}
                onChange={(e) => setSyncForm((s) => ({ ...s, endpoint: e.target.value }))}
                className="flex-1 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm"
              >
                <option value="/active-jb-7d">/active-jb-7d — last 7 days (recommended)</option>
                <option value="/active-jb-24h">/active-jb-24h — last 24 hours</option>
                <option value="/active-jb-30d">/active-jb-30d — last 30 days</option>
              </select>
              <input
                type="text"
                value={syncForm.endpoint}
                onChange={(e) => setSyncForm((s) => ({ ...s, endpoint: e.target.value }))}
                placeholder="/active-jb-7d"
                className="w-36 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-mono"
              />
            </div>
            <p className="mt-1 text-xs text-blue-600">
              From Settings → RapidAPI Path: <span className="font-mono font-semibold">{apiConfig.rapidapi_path || "/active-jb-7d (default)"}</span>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Title filter</label>
              <input
                value={syncForm.title_filter}
                onChange={(e) => setSyncForm((s) => ({ ...s, title_filter: e.target.value }))}
                placeholder="e.g. data engineer OR backend developer"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Put job titles/keywords. Multiple allowed with <code>OR</code>, e.g. <code>data engineer OR ml engineer</code>.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Location filter</label>
              <input
                value={syncForm.location_filter}
                onChange={(e) => setSyncForm((s) => ({ ...s, location_filter: e.target.value }))}
                placeholder="e.g. Singapore OR United Kingdom"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Use full location names. Multiple allowed with <code>OR</code>, e.g. <code>Dubai OR Netherlands</code>.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Limit</label>
              <input
                type="number"
                min={1}
                max={100}
                value={syncForm.limit}
                onChange={(e) => setSyncForm((s) => ({ ...s, limit: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">How many records to fetch this request (1-100).</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Offset</label>
              <input
                type="number"
                min={0}
                value={syncForm.offset}
                onChange={(e) => setSyncForm((s) => ({ ...s, offset: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">Pagination start index. Use 0, 100, 200 for batches of 100.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description type</label>
              <select
                value={syncForm.description_type}
                onChange={(e) => setSyncForm((s) => ({ ...s, description_type: e.target.value as "text" | "html" }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="text">text</option>
                <option value="html">html</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Choose <code>text</code> for readable JD text, or <code>html</code> for raw markup.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Remote</label>
              <select
                value={syncForm.remote}
                onChange={(e) => setSyncForm((s) => ({ ...s, remote: e.target.value as "any" | "true" | "false" }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="any">Any</option>
                <option value="true">Remote only</option>
                <option value="false">Non-remote only</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">Leave as Any to include both remote and on-site jobs.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedSync((v) => !v)}
            className="text-sm text-brand-700 font-medium inline-flex items-center gap-1"
          >
            <ChevronDown size={14} className={`transition-transform ${showAdvancedSync ? "rotate-180" : ""}`} />
            Advanced filters
          </button>

          {showAdvancedSync && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Type filter</label>
                <input
                  value={syncForm.type_filter}
                  onChange={(e) => setSyncForm((s) => ({ ...s, type_filter: e.target.value }))}
                  placeholder="FULL_TIME,PART_TIME"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Allowed values: CONTRACTOR, FULL_TIME, INTERN, OTHER, PART_TIME, TEMPORARY, VOLUNTEER.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Order</label>
                <select
                  value={syncForm.order}
                  onChange={(e) => setSyncForm((s) => ({ ...s, order: e.target.value as "" | "asc" | "desc" }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="">Default (desc)</option>
                  <option value="asc">asc</option>
                  <option value="desc">desc</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Description filter</label>
                <input
                  value={syncForm.description_filter}
                  onChange={(e) => setSyncForm((s) => ({ ...s, description_filter: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Keywords to match inside job description text.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Organization filter</label>
                <input
                  value={syncForm.organization_filter}
                  onChange={(e) => setSyncForm((s) => ({ ...s, organization_filter: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Company name exact-match list, comma-separated (no spaces), e.g. <code>Deloitte,Microsoft</code>.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Industry filter</label>
                <input
                  value={syncForm.industry_filter}
                  onChange={(e) => setSyncForm((s) => ({ ...s, industry_filter: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Case-sensitive LinkedIn industries, comma-separated.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Seniority filter</label>
                <input
                  value={syncForm.seniority_filter}
                  onChange={(e) => setSyncForm((s) => ({ ...s, seniority_filter: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Examples: <code>Entry level</code>, <code>Mid-Senior level</code>, comma-separated for multiple.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">External apply URL</label>
                <select
                  value={syncForm.external_apply_url}
                  onChange={(e) => setSyncForm((s) => ({ ...s, external_apply_url: e.target.value as "any" | "true" }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="any">Any</option>
                  <option value="true">Only with external apply URL</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Set true to include only jobs that have an external apply link.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">AI work arrangement filter</label>
                <input
                  value={syncForm.ai_work_arrangement_filter}
                  onChange={(e) => setSyncForm((s) => ({ ...s, ai_work_arrangement_filter: e.target.value }))}
                  placeholder="Hybrid,Remote OK,Remote Solely"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Options: <code>On-site</code>, <code>Hybrid</code>, <code>Remote OK</code>, <code>Remote Solely</code>. Use comma without spaces for multi.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">AI experience level filter</label>
                <input
                  value={syncForm.ai_experience_level_filter}
                  onChange={(e) => setSyncForm((s) => ({ ...s, ai_experience_level_filter: e.target.value }))}
                  placeholder="0-2,2-5"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Allowed values: <code>0-2</code>, <code>2-5</code>, <code>5-10</code>, <code>10+</code>.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">AI visa sponsorship filter</label>
                <select
                  value={syncForm.ai_visa_sponsorship_filter}
                  onChange={(e) => setSyncForm((s) => ({ ...s, ai_visa_sponsorship_filter: e.target.value as "any" | "true" }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="any">Any</option>
                  <option value="true">Only jobs mentioning visa sponsorship</option>
                </select>
                <p className="mt-1 text-xs text-gray-500">Set true to only include jobs mentioning visa sponsorship in JD.</p>
              </div>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setShowSyncModal(false)}>Cancel</Button>
            <Button className="w-full sm:w-auto" onClick={handleSyncLinkedin} loading={syncingLinkedin}>Sync now</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showResetModal}
        onClose={() => !resettingJobs && setShowResetModal(false)}
        title="Reset Jobs Database"
        size="md"
      >
        <div className="space-y-4 pb-1">
          <p className="text-sm text-gray-600">
            Choose which jobs to remove from database. Tracked/applied jobs are always kept.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Source</label>
              <select
                value={resetForm.source}
                onChange={(e) => setResetForm((s) => ({ ...s, source: e.target.value as ResetJobsForm["source"] }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="">All sources</option>
                <option value="linkedin">LinkedIn</option>
                <option value="remoteok">RemoteOK</option>
                <option value="arbeitnow">Arbeitnow</option>
                <option value="hackernews">HackerNews</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Country / Location</label>
              <input
                value={resetForm.location_filter}
                onChange={(e) => setResetForm((s) => ({ ...s, location_filter: e.target.value }))}
                placeholder="e.g. Singapore"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Remote / On-site</label>
              <select
                value={resetForm.remote}
                onChange={(e) => setResetForm((s) => ({ ...s, remote: e.target.value as ResetJobsForm["remote"] }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="any">Any</option>
                <option value="true">Remote only</option>
                <option value="false">On-site only</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">External apply URL</label>
              <select
                value={resetForm.external_apply_url}
                onChange={(e) =>
                  setResetForm((s) => ({ ...s, external_apply_url: e.target.value as ResetJobsForm["external_apply_url"] }))
                }
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
              >
                <option value="any">Any</option>
                <option value="true">Only with external apply URL</option>
                <option value="false">Only without external apply URL</option>
              </select>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-1">
            <Button variant="secondary" className="w-full sm:w-auto" onClick={() => setShowResetModal(false)} disabled={resettingJobs}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto" onClick={handleResetJobs} loading={resettingJobs}>
              Reset Jobs
            </Button>
          </div>
        </div>
      </Modal>

      {/* Tailor modal */}
      {tailorModal && (
        <TailorModal
          open={!!tailorModal}
          job={tailorModal.job}
          initialResume={tailorModal.resume}
          initialCoverLetter={tailorModal.coverLetter}
          resumeTemplates={resumeTemplates}
          coverTemplates={coverTemplates}
          resumeTemplateId={resumeTemplateId}
          coverTemplateId={coverTemplateId}
          onResumeTemplateChange={setResumeTemplateId}
          onCoverTemplateChange={setCoverTemplateId}
          onClose={() => setTailorModal(null)}
          onSave={handleSaveTailorDraft}
          onDownload={handleDownloadTailoredZip}
          onRetailor={handleRetailorTailorModal}
          onApply={() => { handleApply(tailorModal.job); setTailorModal(null); }}
          saving={savingTailorDraft}
          downloading={exportingZip}
          retailoring={retailoringTailorDraft}
        />
      )}

      {easyApplyModal && (
        <TailorModal
          open={!!easyApplyModal}
          job={easyApplyModal.job}
          initialResume={easyApplyModal.resume}
          initialCoverLetter={easyApplyModal.coverLetter}
          resumeTemplates={resumeTemplates}
          coverTemplates={coverTemplates}
          resumeTemplateId={resumeTemplateId}
          coverTemplateId={coverTemplateId}
          onResumeTemplateChange={setResumeTemplateId}
          onCoverTemplateChange={setCoverTemplateId}
          onClose={() => setEasyApplyModal(null)}
          onSave={async (resume, coverLetter) => {
            setSavingTailorDraft(true);
            try {
              await saveTailorDraft({
                job_id: easyApplyModal.job.id,
                tailored_resume: resume,
                cover_letter: coverLetter,
              });
              setTailoredJobIds((s) => new Set(s).add(easyApplyModal.job.id));
              toast.success("Tailored draft saved");
            } catch (err: any) {
              toast.error(err.response?.data?.detail || "Failed to save tailored draft");
              throw err;
            } finally {
              setSavingTailorDraft(false);
            }
          }}
          onDownload={(resume, coverLetter) =>
            exportTailoredZipFor(easyApplyModal.job, resume, coverLetter)
          }
          onApply={handleApproveEasyApply}
          saving={savingTailorDraft}
          downloading={exportingZip}
          onRetailor={handleEnhanceEasyApply}
          retailoring={enhancingEasyApply}
        />
      )}
    </div>
  );
}

/* ── Small helper components ── */

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{label}</p>
      {children}
    </div>
  );
}

function ToggleGroup({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value === value ? "" : o.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
            value === o.value
              ? "bg-brand-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-700">
      {label}
      <button onClick={onRemove} className="hover:text-red-600 transition-colors ml-0.5">
        <X size={11} />
      </button>
    </span>
  );
}
