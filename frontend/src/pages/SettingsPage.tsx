import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Key, Sliders, Eye, EyeOff, CheckCircle2, Trash2, PencilLine, Link2 } from "lucide-react";
import api from "../api/client";
import { autoApplyApi } from "../api/autoApply";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { useAuthStore } from "../store/authStore";

type Provider = "openai" | "anthropic" | "openrouter" | "rapidapi_key" | "rapidapi_host" | "rapidapi_path";

const PROVIDERS: { value: Provider; label: string; hint: string; placeholder: string; docsUrl: string }[] = [
  {
    value: "openai",
    label: "OpenAI",
    hint: "Recommended model: gpt-3.5-turbo (cheapest). Get key at platform.openai.com",
    placeholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  {
    value: "anthropic",
    label: "Anthropic (Claude) ★ Recommended",
    hint: "Uses claude-haiku-4-5 — fastest & cheapest. JobFlow prefers this over other providers.",
    placeholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com",
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    hint: "Access 100+ models with one key. Free tier available. Get key at openrouter.ai",
    placeholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
  },
  {
    value: "rapidapi_key",
    label: "RapidAPI Key (LinkedIn sync)",
    hint: "Used to fetch LinkedIn jobs. You can paste multiple keys separated by commas or new lines for fallback.",
    placeholder: "rapidapi-key-1, rapidapi-key-2",
    docsUrl: "https://rapidapi.com",
  },
  {
    value: "rapidapi_host",
    label: "RapidAPI Host (LinkedIn sync)",
    hint: "Usually linkedin-job-search-api.p.rapidapi.com",
    placeholder: "linkedin-job-search-api.p.rapidapi.com",
    docsUrl: "https://rapidapi.com",
  },
  {
    value: "rapidapi_path",
    label: "RapidAPI Path (optional override)",
    hint: "Optional endpoint path, e.g. /active-jb-7d",
    placeholder: "/active-jb-7d",
    docsUrl: "https://rapidapi.com",
  },
];

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const [configuredProviders, setConfiguredProviders] = useState<string[]>([]);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [rapidApiMaskedKeys, setRapidApiMaskedKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [prefs, setPrefs] = useState({
    remote_only: false,
    min_salary: "",
    job_titles: "",
    auto_apply_enabled: false,
    auto_apply_min_score: 75,
    auto_sync_enabled: false,
    auto_sync_highest_match_only: true,
    auto_sync_limit: "100",
    auto_sync_location_filter: "",
    auto_sync_description_type: "text" as "text" | "html",
    auto_sync_type_filter: "",
    auto_sync_remote: "any" as "any" | "true" | "false",
    auto_sync_description_filter: "",
    auto_sync_organization_filter: "",
    auto_sync_industry_filter: "",
    auto_sync_seniority_filter: "",
    auto_sync_external_apply_url: "any" as "any" | "true",
    auto_sync_ai_work_arrangement_filter: "",
    auto_sync_ai_experience_level_filter: "",
    auto_sync_ai_visa_sponsorship_filter: "any" as "any" | "true",
    auto_sync_order: "" as "" | "asc" | "desc",
    auto_sync_endpoint: "",
    auto_sync_daily_budget: "100",
    auto_sync_max_per_run: "50",
    auto_sync_last_run_at: "",
    auto_sync_last_fetched: 0,
    auto_sync_last_saved: 0,
    auto_sync_last_highest_match: null as number | null,
    auto_sync_last_reason: "",
  });
  const [savingPrefs, setSavingPrefs] = useState(false);

  // LinkedIn Easy Apply credentials
  const [liConfigured, setLiConfigured] = useState(false);
  const [liEmailHint, setLiEmailHint] = useState<string | null>(null);
  const [liEditing, setLiEditing] = useState(false);
  const [liEmail, setLiEmail] = useState("");
  const [liPassword, setLiPassword] = useState("");
  const [showLiPassword, setShowLiPassword] = useState(false);
  const [savingLi, setSavingLi] = useState(false);
  const [liQuestions, setLiQuestions] = useState({
    work_authorization: "",
    visa_sponsorship: "",
    valid_work_pass: "",
    years_experience: "",
    language_proficiency: "",
    completed_degree: "",
    expected_salary: "",
    commute_ok: "",
    work_setting_ok: "",
    notice_period: "",
    gender: "",
    race_ethnicity: "",
    protected_veteran: "",
    disability: "",
    why_join: "",
    project_example: "",
    portfolio_link: "",
  });
  const [savingQuestions, setSavingQuestions] = useState(false);

  useEffect(() => {
    autoApplyApi.getCredentialsStatus()
      .then((r) => {
        setLiConfigured(r.data.configured);
        setLiEmailHint(r.data.email_hint);
      })
      .catch(() => {});
    autoApplyApi.getQuestionnaire()
      .then((r) => setLiQuestions((prev) => ({ ...prev, ...(r.data || {}) })))
      .catch(() => {});
  }, []);

  const handleSaveLiCredentials = async () => {
    if (!liEmail.trim() || !liPassword.trim()) {
      toast.error("Enter both email and password");
      return;
    }
    setSavingLi(true);
    try {
      await autoApplyApi.saveCredentials({ email: liEmail.trim(), password: liPassword.trim() });
      const r = await autoApplyApi.getCredentialsStatus();
      setLiConfigured(r.data.configured);
      setLiEmailHint(r.data.email_hint);
      setLiEmail("");
      setLiPassword("");
      setLiEditing(false);
      toast.success("LinkedIn credentials saved!");
    } catch {
      toast.error("Failed to save credentials");
    } finally {
      setSavingLi(false);
    }
  };

  const handleDeleteLiCredentials = async () => {
    if (!confirm("Remove your LinkedIn credentials?")) return;
    try {
      await autoApplyApi.deleteCredentials();
      setLiConfigured(false);
      setLiEmailHint(null);
      setLiEditing(false);
      toast.success("LinkedIn credentials removed");
    } catch {
      toast.error("Failed to remove credentials");
    }
  };

  const handleSaveLiQuestions = async () => {
    setSavingQuestions(true);
    try {
      await autoApplyApi.saveQuestionnaire(liQuestions);
      toast.success("LinkedIn Easy Apply answers saved");
    } catch {
      toast.error("Failed to save LinkedIn answers");
    } finally {
      setSavingQuestions(false);
    }
  };

  useEffect(() => {
    api.get("/users/me/api-keys")
      .then((r) => {
        setConfiguredProviders(r.data.all_keys ?? r.data.providers ?? []);
        if (r.data.config) {
          setConfigValues(r.data.config);
          setRapidApiMaskedKeys(r.data.config.rapidapi_keys_masked ?? []);
        }
      })
      .catch(() => {});
    api.get("/users/me/preferences")
      .then((r) => {
        const p = r.data ?? {};
        setPrefs({
          remote_only: p.remote_only ?? false,
          min_salary: p.min_salary ? String(p.min_salary) : "",
          job_titles: (p.job_titles ?? []).join(", "),
          auto_apply_enabled: p.auto_apply_enabled ?? false,
          auto_apply_min_score: p.auto_apply_min_score ?? 75,
          auto_sync_enabled: p.auto_sync_enabled ?? false,
          auto_sync_highest_match_only: p.auto_sync_highest_match_only ?? true,
          auto_sync_limit: String(p.auto_sync_limit ?? 100),
          auto_sync_location_filter: p.auto_sync_location_filter ?? "",
          auto_sync_description_type: (p.auto_sync_description_type ?? "text") as "text" | "html",
          auto_sync_type_filter: p.auto_sync_type_filter ?? "",
          auto_sync_remote: (p.auto_sync_remote ?? "any") as "any" | "true" | "false",
          auto_sync_description_filter: p.auto_sync_description_filter ?? "",
          auto_sync_organization_filter: p.auto_sync_organization_filter ?? "",
          auto_sync_industry_filter: p.auto_sync_industry_filter ?? "",
          auto_sync_seniority_filter: p.auto_sync_seniority_filter ?? "",
          auto_sync_external_apply_url: (p.auto_sync_external_apply_url ?? "any") as "any" | "true",
          auto_sync_ai_work_arrangement_filter: p.auto_sync_ai_work_arrangement_filter ?? "",
          auto_sync_ai_experience_level_filter: p.auto_sync_ai_experience_level_filter ?? "",
          auto_sync_ai_visa_sponsorship_filter: (p.auto_sync_ai_visa_sponsorship_filter ?? "any") as "any" | "true",
          auto_sync_order: (p.auto_sync_order ?? "") as "" | "asc" | "desc",
          auto_sync_endpoint: p.auto_sync_endpoint ?? "",
          auto_sync_daily_budget: String(p.auto_sync_daily_budget ?? 100),
          auto_sync_max_per_run: String(p.auto_sync_max_per_run ?? 50),
          auto_sync_last_run_at: p.auto_sync_last_run_at ?? "",
          auto_sync_last_fetched: p.auto_sync_last_fetched ?? 0,
          auto_sync_last_saved: p.auto_sync_last_saved ?? 0,
          auto_sync_last_highest_match: p.auto_sync_last_highest_match ?? null,
          auto_sync_last_reason: p.auto_sync_last_reason ?? "",
        });
      })
      .catch(() => {});
  }, []);

  const isConfigured = (p: string) => configuredProviders.includes(p);

  const handleSaveKey = async (provider: Provider) => {
    const key = keyInputs[provider]?.trim();
    if (!key) { toast.error("Paste your API key first"); return; }
    setSaving((s) => ({ ...s, [provider]: true }));
    try {
      await api.post("/users/me/api-keys", { provider, api_key: key });
      setConfiguredProviders((ps) => [...new Set([...ps, provider])]);
      setKeyInputs((k) => ({ ...k, [provider]: "" }));
      setEditingProvider(null);
      toast.success(`${provider} API key saved!`, { icon: "🔑" });
    } catch {
      toast.error("Failed to save key — check it's valid");
    } finally {
      setSaving((s) => ({ ...s, [provider]: false }));
    }
  };

  const handleDeleteKey = async (provider: string) => {
    if (!confirm(`Remove ${provider} API key?`)) return;
    try {
      await api.delete(`/users/me/api-keys/${provider}`);
      setConfiguredProviders((ps) => ps.filter((p) => p !== provider));
      setEditingProvider(null);
      toast.success("Key removed");
    } catch {
      toast.error("Failed to remove key");
    }
  };

  const handleSavePrefs = async () => {
    setSavingPrefs(true);
    try {
      await api.put("/users/me/preferences", {
        remote_only: prefs.remote_only,
        min_salary: prefs.min_salary ? parseInt(prefs.min_salary) : null,
        job_titles: prefs.job_titles ? prefs.job_titles.split(",").map((s) => s.trim()).filter(Boolean) : [],
        auto_apply_enabled: prefs.auto_apply_enabled,
        auto_apply_min_score: prefs.auto_apply_min_score,
        auto_sync_enabled: prefs.auto_sync_enabled,
        auto_sync_highest_match_only: prefs.auto_sync_highest_match_only,
        auto_sync_limit: Number(prefs.auto_sync_limit || 100),
        auto_sync_location_filter: prefs.auto_sync_location_filter || null,
        auto_sync_description_type: prefs.auto_sync_description_type || "text",
        auto_sync_type_filter: prefs.auto_sync_type_filter || null,
        auto_sync_remote: prefs.auto_sync_remote || "any",
        auto_sync_description_filter: prefs.auto_sync_description_filter || null,
        auto_sync_organization_filter: prefs.auto_sync_organization_filter || null,
        auto_sync_industry_filter: prefs.auto_sync_industry_filter || null,
        auto_sync_seniority_filter: prefs.auto_sync_seniority_filter || null,
        auto_sync_external_apply_url: prefs.auto_sync_external_apply_url || "any",
        auto_sync_ai_work_arrangement_filter: prefs.auto_sync_ai_work_arrangement_filter || null,
        auto_sync_ai_experience_level_filter: prefs.auto_sync_ai_experience_level_filter || null,
        auto_sync_ai_visa_sponsorship_filter: prefs.auto_sync_ai_visa_sponsorship_filter || "any",
        auto_sync_order: prefs.auto_sync_order || null,
        auto_sync_endpoint: prefs.auto_sync_endpoint || null,
        auto_sync_daily_budget: Number(prefs.auto_sync_daily_budget || 100),
        auto_sync_max_per_run: Number(prefs.auto_sync_max_per_run || 50),
      });
      toast.success("Preferences saved!");
    } catch {
      toast.error("Save failed");
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-gray-500">Manage your AI keys and job preferences</p>
      </div>

      <div className="space-y-6 max-w-2xl">

        {/* Account */}
        <section className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-3">Account</h2>
          <div className="space-y-1 text-sm text-gray-600">
            <p><span className="font-medium text-gray-800">Name:</span> {user?.full_name || "—"}</p>
            <p><span className="font-medium text-gray-800">Email:</span> {user?.email}</p>
          </div>
        </section>

        {/* API Keys */}
        <section className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <Key size={17} /> API Keys
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Your keys are AES-encrypted before storage and never exposed. AI keys are used for tailoring/matching, and RapidAPI keys are used for LinkedIn sync.
          </p>

          <div className="space-y-4">
            {PROVIDERS.map(({ value, label, hint, placeholder, docsUrl }) => {
              const configured = isConfigured(value);
              const editing = editingProvider === value;

              return (
                <div
                  key={value}
                  className={`rounded-xl border p-4 transition-all ${
                    configured
                      ? "border-green-200 bg-green-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-800 text-sm">{label}</p>
                        {configured && !editing && (
                          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                            <CheckCircle2 size={11} /> Key saved
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {configured && !editing && (
                        <>
                          <button
                            onClick={() => setEditingProvider(value)}
                            className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            <PencilLine size={11} /> Update
                          </button>
                          <button
                            onClick={() => handleDeleteKey(value)}
                            className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                      {(!configured || editing) && (
                        <a
                          href={docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-600 hover:underline"
                        >
                          Get key ↗
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Saved state display */}
                  {configured && !editing && (
                    <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2.5 text-sm text-gray-500">
                      <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                      {value === "rapidapi_key" ? (
                        <div className="flex-1 min-w-0">
                          {rapidApiMaskedKeys.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {rapidApiMaskedKeys.map((k, i) => (
                                <span key={`${k}-${i}`} className="rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-700">
                                  {k}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-mono text-xs tracking-widest text-gray-500 select-none">
                              ••••••••••••••••••••••••••••••••
                            </span>
                          )}
                        </div>
                      ) : configValues[value] ? (
                        <span className="font-mono text-xs text-gray-700">{configValues[value]}</span>
                      ) : (
                        <span className="font-mono text-xs tracking-widest text-gray-500 select-none">
                          ••••••••••••••••••••••••••••••••
                        </span>
                      )}
                      <span className="ml-auto text-xs text-green-600 font-medium">Active</span>
                    </div>
                  )}

                  {/* Input (new or editing) */}
                  {(!configured || editing) && (
                    <div className="mt-2">
                      {editing && (
                        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
                          Entering a new value will replace the existing one.
                        </p>
                      )}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          {value === "rapidapi_key" ? (
                            <textarea
                              rows={3}
                              value={keyInputs[value] || ""}
                              onChange={(e) => setKeyInputs((k) => ({ ...k, [value]: e.target.value }))}
                              placeholder={placeholder}
                              autoComplete="off"
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono resize-y"
                            />
                          ) : (value === "rapidapi_host" || value === "rapidapi_path") ? (
                            <input
                              type="text"
                              value={keyInputs[value] || ""}
                              onChange={(e) => setKeyInputs((k) => ({ ...k, [value]: e.target.value }))}
                              placeholder={placeholder}
                              autoComplete="off"
                              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                            />
                          ) : (
                            <>
                              <input
                                type={showKey[value] ? "text" : "password"}
                                value={keyInputs[value] || ""}
                                onChange={(e) => setKeyInputs((k) => ({ ...k, [value]: e.target.value }))}
                                placeholder={placeholder}
                                autoComplete="off"
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setShowKey((s) => ({ ...s, [value]: !s[value] }))}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              >
                                {showKey[value] ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleSaveKey(value)}
                          loading={saving[value]}
                          disabled={!keyInputs[value]?.trim()}
                        >
                          Save
                        </Button>
                        {editing && (
                          <Button size="sm" variant="secondary" onClick={() => setEditingProvider(null)}>
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {configuredProviders.length > 0 && (
            <p className="mt-4 text-xs text-gray-400 flex items-center gap-1.5">
              <CheckCircle2 size={12} className="text-green-500" />
              {configuredProviders.length} provider{configuredProviders.length > 1 ? "s" : ""} configured —
              AI tailoring and match scoring are enabled.
            </p>
          )}
        </section>

        {/* LinkedIn Easy Apply */}
        <section className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-1 flex items-center gap-2">
            <Link2 size={17} /> LinkedIn Easy Apply
          </h2>
          <p className="text-sm text-gray-500 mb-5">
            Your credentials are AES-encrypted and stored only on this server. They are used exclusively to fill and submit LinkedIn Easy Apply forms on your behalf.
          </p>

          <div
            className={`rounded-xl border p-4 transition-all ${
              liConfigured ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-800 text-sm">LinkedIn Account</p>
                  {liConfigured && !liEditing && (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      <CheckCircle2 size={11} /> Saved
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Used to log in and click Submit on LinkedIn Easy Apply forms
                </p>
              </div>
              {liConfigured && !liEditing && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => setLiEditing(true)}
                    className="flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <PencilLine size={11} /> Update
                  </button>
                  <button
                    onClick={handleDeleteLiCredentials}
                    className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>

            {liConfigured && !liEditing && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-white px-3 py-2.5 text-sm">
                <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                <span className="text-xs text-gray-600 font-medium">{liEmailHint}</span>
                <span className="ml-auto text-xs text-green-600 font-medium">Active</span>
              </div>
            )}

            {(!liConfigured || liEditing) && (
              <div className="mt-2 space-y-2">
                {liEditing && (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Entering new credentials will replace the existing ones.
                  </p>
                )}
                <input
                  type="email"
                  placeholder="LinkedIn email"
                  value={liEmail}
                  onChange={(e) => setLiEmail(e.target.value)}
                  autoComplete="off"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <div className="relative">
                  <input
                    type={showLiPassword ? "text" : "password"}
                    placeholder="LinkedIn password"
                    value={liPassword}
                    onChange={(e) => setLiPassword(e.target.value)}
                    autoComplete="new-password"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm pr-9 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowLiPassword((s) => !s)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showLiPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveLiCredentials} loading={savingLi} className="flex-1">
                    Save Credentials
                  </Button>
                  {liEditing && (
                    <Button size="sm" variant="secondary" onClick={() => setLiEditing(false)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {!liConfigured && (
            <p className="mt-3 text-xs text-gray-400">
              Once saved, you'll see an "Easy Apply" button on LinkedIn job cards.
            </p>
          )}

          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">
              Easy Apply screening answers
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              These answers are used when LinkedIn asks screening questions during AI Easy Apply.
            </p>

            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Legally authorized to work? (Yes/No)</label>
                  <input value={liQuestions.work_authorization} onChange={(e) => setLiQuestions((s) => ({ ...s, work_authorization: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Need visa sponsorship now/future? (Yes/No)</label>
                  <input value={liQuestions.visa_sponsorship} onChange={(e) => setLiQuestions((s) => ({ ...s, visa_sponsorship: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Valid work pass/visa? (Yes/No)</label>
                  <input value={liQuestions.valid_work_pass} onChange={(e) => setLiQuestions((s) => ({ ...s, valid_work_pass: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Years of experience (number)</label>
                  <input value={liQuestions.years_experience} onChange={(e) => setLiQuestions((s) => ({ ...s, years_experience: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Language proficiency</label>
                  <input value={liQuestions.language_proficiency} onChange={(e) => setLiQuestions((s) => ({ ...s, language_proficiency: e.target.value }))} placeholder="Conversational / Fluent / Native" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Completed required degree? (Yes/No)</label>
                  <input value={liQuestions.completed_degree} onChange={(e) => setLiQuestions((s) => ({ ...s, completed_degree: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expected salary</label>
                  <input value={liQuestions.expected_salary} onChange={(e) => setLiQuestions((s) => ({ ...s, expected_salary: e.target.value }))} placeholder="e.g. 7000 SGD/month or 90000 USD/year" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Comfortable commuting? (Yes/No)</label>
                  <input value={liQuestions.commute_ok} onChange={(e) => setLiQuestions((s) => ({ ...s, commute_ok: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Willing for remote/hybrid/onsite? (Yes/No)</label>
                  <input value={liQuestions.work_setting_ok} onChange={(e) => setLiQuestions((s) => ({ ...s, work_setting_ok: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notice period</label>
                  <input value={liQuestions.notice_period} onChange={(e) => setLiQuestions((s) => ({ ...s, notice_period: e.target.value }))} placeholder="Immediate / 1 month / 2 months" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Gender</label>
                  <input value={liQuestions.gender} onChange={(e) => setLiQuestions((s) => ({ ...s, gender: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Race/Ethnicity</label>
                  <input value={liQuestions.race_ethnicity} onChange={(e) => setLiQuestions((s) => ({ ...s, race_ethnicity: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Protected veteran? (Yes/No)</label>
                  <input value={liQuestions.protected_veteran} onChange={(e) => setLiQuestions((s) => ({ ...s, protected_veteran: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Disability? (Yes/No)</label>
                  <input value={liQuestions.disability} onChange={(e) => setLiQuestions((s) => ({ ...s, disability: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Why are you interested in this company?</label>
                <textarea value={liQuestions.why_join} onChange={(e) => setLiQuestions((s) => ({ ...s, why_join: e.target.value }))} rows={3} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project example answer</label>
                <textarea value={liQuestions.project_example} onChange={(e) => setLiQuestions((s) => ({ ...s, project_example: e.target.value }))} rows={3} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Portfolio / GitHub link</label>
                <input value={liQuestions.portfolio_link} onChange={(e) => setLiQuestions((s) => ({ ...s, portfolio_link: e.target.value }))} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm" />
              </div>

              <Button onClick={handleSaveLiQuestions} loading={savingQuestions}>
                Save Easy Apply Answers
              </Button>
            </div>
          </div>
        </section>

        {/* Job Preferences */}
        <section className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <Sliders size={17} /> Job Preferences
          </h2>
          <div className="space-y-4">
            <Input
              label="Target Job Titles (comma-separated)"
              placeholder="Full Stack Developer, Web Developer, Software Engineer"
              value={prefs.job_titles}
              onChange={(e) => setPrefs((p) => ({ ...p, job_titles: e.target.value }))}
            />
            <Input
              label="Minimum Salary (USD/year)"
              type="number"
              placeholder="60000"
              value={prefs.min_salary}
              onChange={(e) => setPrefs((p) => ({ ...p, min_salary: e.target.value }))}
            />
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.remote_only}
                onChange={(e) => setPrefs((p) => ({ ...p, remote_only: e.target.checked }))}
                className="h-4 w-4 rounded text-brand-600"
              />
              <span className="text-sm text-gray-700 font-medium">Remote jobs only</span>
            </label>

            <div className="border-t border-gray-100 pt-4 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.auto_sync_enabled}
                  onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_enabled: e.target.checked }))}
                  className="h-4 w-4 rounded text-brand-600"
                />
                <div>
                  <span className="text-sm text-gray-700 font-medium">Enable LinkedIn auto-sync</span>
                  <p className="text-xs text-gray-400">Sync LinkedIn jobs using Target Job Titles and keep highest match only</p>
                </div>
              </label>

              {prefs.auto_sync_enabled && (
                <div className="ml-7 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prefs.auto_sync_highest_match_only}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_highest_match_only: e.target.checked }))}
                      className="h-4 w-4 rounded text-brand-600"
                    />
                    <div>
                      <span className="text-sm text-gray-700 font-medium">Keep highest match only</span>
                      <p className="text-xs text-gray-400">If disabled, top 20 matched LinkedIn jobs are synced</p>
                    </div>
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={1}
                      value={prefs.auto_sync_daily_budget}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_daily_budget: e.target.value }))}
                      placeholder="Daily sync budget (jobs)"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      value={prefs.auto_sync_max_per_run}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_max_per_run: e.target.value }))}
                      placeholder="Max jobs per run"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={prefs.auto_sync_limit}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_limit: e.target.value }))}
                      placeholder="Jobs to sync (1-100)"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={prefs.auto_sync_location_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_location_filter: e.target.value }))}
                      placeholder="Country / location filter"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <select
                      value={prefs.auto_sync_remote}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_remote: e.target.value as "any" | "true" | "false" }))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="any">Any (remote + onsite)</option>
                      <option value="true">Remote only</option>
                      <option value="false">On-site only</option>
                    </select>
                    <select
                      value={prefs.auto_sync_external_apply_url}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_external_apply_url: e.target.value as "any" | "true" }))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="any">Any apply type</option>
                      <option value="true">External company apply only</option>
                    </select>
                    <input
                      value={prefs.auto_sync_type_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_type_filter: e.target.value }))}
                      placeholder="Type filter (FULL_TIME,PART_TIME)"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={prefs.auto_sync_organization_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_organization_filter: e.target.value }))}
                      placeholder="Organization filter"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={prefs.auto_sync_industry_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_industry_filter: e.target.value }))}
                      placeholder="Industry filter"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={prefs.auto_sync_seniority_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_seniority_filter: e.target.value }))}
                      placeholder="Seniority filter"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <select
                      value={prefs.auto_sync_description_type}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_description_type: e.target.value as "text" | "html" }))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="text">Description type: text</option>
                      <option value="html">Description type: html</option>
                    </select>
                    <select
                      value={prefs.auto_sync_order}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_order: e.target.value as "" | "asc" | "desc" }))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Order: default</option>
                      <option value="asc">Order: asc</option>
                      <option value="desc">Order: desc</option>
                    </select>
                    <input
                      value={prefs.auto_sync_description_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_description_filter: e.target.value }))}
                      placeholder="Description keyword filter"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={prefs.auto_sync_ai_work_arrangement_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_ai_work_arrangement_filter: e.target.value }))}
                      placeholder="AI work arrangement filter"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <input
                      value={prefs.auto_sync_ai_experience_level_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_ai_experience_level_filter: e.target.value }))}
                      placeholder="AI experience level filter"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    />
                    <select
                      value={prefs.auto_sync_ai_visa_sponsorship_filter}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_ai_visa_sponsorship_filter: e.target.value as "any" | "true" }))}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="any">Any visa sponsorship</option>
                      <option value="true">Visa sponsorship only</option>
                    </select>
                    <input
                      value={prefs.auto_sync_endpoint}
                      onChange={(e) => setPrefs((p) => ({ ...p, auto_sync_endpoint: e.target.value }))}
                      placeholder="Endpoint override (e.g. /active-jb-7d)"
                      className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm sm:col-span-2"
                    />
                  </div>
                </div>
              )}

              <div className="ml-7 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Auto-sync status</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-600">
                  <p>
                    Last run:{" "}
                    <span className="font-medium text-gray-800">
                      {prefs.auto_sync_last_run_at
                        ? new Date(prefs.auto_sync_last_run_at).toLocaleString()
                        : "Never"}
                    </span>
                  </p>
                  <p>
                    Fetched: <span className="font-medium text-gray-800">{prefs.auto_sync_last_fetched}</span>
                  </p>
                  <p>
                    Saved: <span className="font-medium text-gray-800">{prefs.auto_sync_last_saved}</span>
                  </p>
                  <p>
                    Top match:{" "}
                    <span className="font-medium text-gray-800">
                      {typeof prefs.auto_sync_last_highest_match === "number"
                        ? `${prefs.auto_sync_last_highest_match}%`
                        : "—"}
                    </span>
                  </p>
                </div>
                {prefs.auto_sync_last_reason && (
                  <p className="text-xs text-gray-500 mt-2">
                    Note: {prefs.auto_sync_last_reason}
                  </p>
                )}
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={prefs.auto_apply_enabled}
                  onChange={(e) => setPrefs((p) => ({ ...p, auto_apply_enabled: e.target.checked }))}
                  className="h-4 w-4 rounded text-brand-600"
                />
                <div>
                  <span className="text-sm text-gray-700 font-medium">Enable auto-apply</span>
                  <p className="text-xs text-gray-400">Automatically apply to jobs above your match score threshold</p>
                </div>
              </label>

              {prefs.auto_apply_enabled && (
                <div className="ml-7 rounded-lg bg-brand-50 border border-brand-100 p-4">
                  <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
                    <span>Minimum match score to auto-apply</span>
                    <span className="text-brand-600 font-bold">{prefs.auto_apply_min_score}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={95}
                    step={5}
                    value={prefs.auto_apply_min_score}
                    onChange={(e) => setPrefs((p) => ({ ...p, auto_apply_min_score: parseInt(e.target.value) }))}
                    className="w-full accent-brand-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>50% — broader</span>
                    <span>95% — strict</span>
                  </div>
                </div>
              )}
            </div>

            <Button onClick={handleSavePrefs} loading={savingPrefs} className="w-full">
              Save Preferences
            </Button>
          </div>
        </section>

      </div>
    </div>
  );
}
