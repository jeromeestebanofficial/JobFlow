import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, Save } from "lucide-react";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { getResumes, createResume, updateResume, deleteResume } from "../api/resumes";
import type { Resume, ExperienceItem, EducationItem, ProjectItem } from "../types";

const emptyResume: Partial<Resume> = {
  name: "",
  is_default: false,
  full_name: "",
  email: "",
  phone: "",
  location: "",
  linkedin_url: "",
  github_url: "",
  portfolio_url: "",
  summary: "",
  skills: [],
  experience: [],
  education: [],
  certifications: [],
  projects: [],
};

export function ResumePage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [active, setActive] = useState<Partial<Resume>>(emptyResume);
  const [skillInput, setSkillInput] = useState("");
  const [certInput, setCertInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getResumes().then((r) => {
      setResumes(r.data as Resume[]);
      if (r.data.length > 0) setActive(r.data[0] as Resume);
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (active.id) {
        const { data } = await updateResume(active.id, active);
        setResumes((rs) => rs.map((r) => (r.id === active.id ? (data as Resume) : r)));
        setActive(data as Resume);
      } else {
        const { data } = await createResume(active);
        setResumes((rs) => [...rs, data as Resume]);
        setActive(data as Resume);
      }
      toast.success("Resume saved!");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this resume?")) return;
    await deleteResume(id);
    const remaining = resumes.filter((r) => r.id !== id);
    setResumes(remaining);
    setActive(remaining[0] || emptyResume);
    toast.success("Resume deleted");
  };

  const addSkill = () => {
    const s = skillInput.trim();
    if (!s) return;
    setActive((a) => ({ ...a, skills: [...(a.skills || []), s] }));
    setSkillInput("");
  };

  const removeSkill = (i: number) =>
    setActive((a) => ({ ...a, skills: (a.skills || []).filter((_, idx) => idx !== i) }));

  const addExperience = () =>
    setActive((a) => ({
      ...a,
      experience: [
        ...(a.experience || []),
        { title: "", company: "", start_date: "", end_date: "Present", bullets: [""] },
      ],
    }));

  const removeExperience = (i: number) =>
    setActive((a) => ({
      ...a,
      experience: (a.experience || []).filter((_, idx) => idx !== i),
    }));

  const updateExp = (i: number, field: string, val: string) =>
    setActive((a) => ({
      ...a,
      experience: (a.experience || []).map((e, idx) =>
        idx === i ? { ...e, [field]: val } : e
      ) as ExperienceItem[],
    }));

  const updateExpBullet = (ei: number, bi: number, val: string) =>
    setActive((a) => ({
      ...a,
      experience: (a.experience || []).map((e, idx) =>
        idx === ei ? { ...e, bullets: e.bullets.map((b, bIdx) => (bIdx === bi ? val : b)) } : e
      ) as ExperienceItem[],
    }));

  const addBullet = (ei: number) =>
    setActive((a) => ({
      ...a,
      experience: (a.experience || []).map((e, idx) =>
        idx === ei ? { ...e, bullets: [...e.bullets, ""] } : e
      ) as ExperienceItem[],
    }));

  const removeExpBullet = (ei: number, bi: number) =>
    setActive((a) => ({
      ...a,
      experience: (a.experience || []).map((e, idx) =>
        idx === ei ? { ...e, bullets: e.bullets.filter((_, bIdx) => bIdx !== bi) } : e
      ) as ExperienceItem[],
    }));

  const addEducation = () =>
    setActive((a) => ({
      ...a,
      education: [...(a.education || []), { degree: "", school: "", year: "", gpa: "" }],
    }));

  const updateEdu = (i: number, field: keyof EducationItem, val: string) =>
    setActive((a) => ({
      ...a,
      education: (a.education || []).map((e, idx) =>
        idx === i ? { ...e, [field]: val } : e
      ) as EducationItem[],
    }));

  const removeEducation = (i: number) =>
    setActive((a) => ({
      ...a,
      education: (a.education || []).filter((_, idx) => idx !== i),
    }));

  const addCertification = () => {
    const c = certInput.trim();
    if (!c) return;
    setActive((a) => ({ ...a, certifications: [...(a.certifications || []), c] }));
    setCertInput("");
  };

  const removeCertification = (i: number) =>
    setActive((a) => ({
      ...a,
      certifications: (a.certifications || []).filter((_, idx) => idx !== i),
    }));

  const addProject = () =>
    setActive((a) => ({
      ...a,
      projects: [
        ...(a.projects || []),
        { name: "", description: "", tech: [], url: "" },
      ],
    }));

  const updateProject = (i: number, field: keyof ProjectItem, val: string) =>
    setActive((a) => ({
      ...a,
      projects: (a.projects || []).map((p, idx) =>
        idx === i ? { ...p, [field]: val } : p
      ) as ProjectItem[],
    }));

  const updateProjectTech = (i: number, val: string) =>
    setActive((a) => ({
      ...a,
      projects: (a.projects || []).map((p, idx) =>
        idx === i
          ? {
              ...p,
              tech: val.split(",").map((t) => t.trim()).filter(Boolean),
            }
          : p
      ) as ProjectItem[],
    }));

  const removeProject = (i: number) =>
    setActive((a) => ({
      ...a,
      projects: (a.projects || []).filter((_, idx) => idx !== i),
    }));

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setActive((a) => ({ ...a, [k]: e.target.value }));

  return (
    <div className="flex-1 overflow-auto p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Resume</h1>
          <p className="mt-1 text-gray-500">Used for AI tailoring and auto-apply</p>
        </div>
        <div className="flex items-center gap-2">
          {resumes.map((r) => (
            <button
              key={r.id}
              onClick={() => setActive(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active.id === r.id ? "bg-brand-600 text-white" : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {r.name}
            </button>
          ))}
          <Button variant="secondary" size="sm" onClick={() => setActive({ ...emptyResume, id: undefined })}>
            <Plus size={14} /> New
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Personal info */}
        <section className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Personal Information</h2>
          <Input label="Resume Name" value={active.name || ""} onChange={set("name")} />
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={!!active.is_default}
              onChange={(e) => setActive((a) => ({ ...a, is_default: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Set as default resume
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Full Name" value={active.full_name || ""} onChange={set("full_name")} />
            <Input label="Email" type="email" value={active.email || ""} onChange={set("email")} />
            <Input label="Phone" value={active.phone || ""} onChange={set("phone")} />
            <Input label="Location" value={active.location || ""} onChange={set("location")} />
          </div>
          <Input label="LinkedIn URL" value={active.linkedin_url || ""} onChange={set("linkedin_url")} />
          <Input label="GitHub URL" value={active.github_url || ""} onChange={set("github_url")} />
          <Input label="Portfolio URL" value={active.portfolio_url || ""} onChange={set("portfolio_url")} />
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Professional Summary</label>
            <textarea
              value={active.summary || ""}
              onChange={(e) => setActive((a) => ({ ...a, summary: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              placeholder="A brief professional summary…"
            />
          </div>
        </section>

        {/* Skills */}
        <section className="rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
          <h2 className="font-semibold text-gray-800 mb-4">Skills</h2>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
              placeholder="Type a skill and press Enter"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            <Button size="sm" onClick={addSkill}>
              <Plus size={14} />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(active.skills || []).map((skill, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm text-brand-700"
              >
                {skill}
                <button onClick={() => removeSkill(i)} className="hover:text-red-500 transition-colors">
                  ×
                </button>
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* Experience */}
      <section className="mt-6 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Work Experience</h2>
          <Button size="sm" variant="secondary" onClick={addExperience}>
            <Plus size={14} /> Add
          </Button>
        </div>
        <div className="space-y-5">
          {(active.experience || []).map((exp, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeExperience(i)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove experience
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Job Title" value={exp.title} onChange={(e) => updateExp(i, "title", e.target.value)} />
                <Input label="Company" value={exp.company} onChange={(e) => updateExp(i, "company", e.target.value)} />
                <Input label="Start Date" placeholder="Jan 2022" value={exp.start_date} onChange={(e) => updateExp(i, "start_date", e.target.value)} />
                <Input label="End Date" placeholder="Present" value={exp.end_date || ""} onChange={(e) => updateExp(i, "end_date", e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Bullet Points</label>
                {exp.bullets.map((b, bi) => (
                  <div key={bi} className="mb-1.5 flex items-center gap-2">
                    <input
                      type="text"
                      value={b}
                      onChange={(e) => updateExpBullet(i, bi, e.target.value)}
                      placeholder={`Bullet point ${bi + 1}`}
                      className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => removeExpBullet(i, bi)}
                      className="text-xs text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button onClick={() => addBullet(i)} className="text-xs text-brand-600 hover:text-brand-700">
                  + Add bullet
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Education */}
      <section className="mt-6 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Education</h2>
          <Button size="sm" variant="secondary" onClick={addEducation}>
            <Plus size={14} /> Add
          </Button>
        </div>
        <div className="space-y-4">
          {(active.education || []).map((edu, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeEducation(i)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove education
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Degree" value={edu.degree} onChange={(e) => updateEdu(i, "degree", e.target.value)} />
                <Input label="School" value={edu.school} onChange={(e) => updateEdu(i, "school", e.target.value)} />
                <Input label="Year" value={edu.year || ""} onChange={(e) => updateEdu(i, "year", e.target.value)} />
                <Input label="GPA" value={edu.gpa || ""} onChange={(e) => updateEdu(i, "gpa", e.target.value)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Projects */}
      <section className="mt-6 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-800">Projects</h2>
          <Button size="sm" variant="secondary" onClick={addProject}>
            <Plus size={14} /> Add
          </Button>
        </div>
        <div className="space-y-4">
          {(active.projects || []).map((proj, i) => (
            <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => removeProject(i)}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  Remove project
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Project Name" value={proj.name} onChange={(e) => updateProject(i, "name", e.target.value)} />
                <Input label="Project URL" value={proj.url || ""} onChange={(e) => updateProject(i, "url", e.target.value)} />
              </div>
              <Input
                label="Tech Stack (comma-separated)"
                value={(proj.tech || []).join(", ")}
                onChange={(e) => updateProjectTech(i, e.target.value)}
              />
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
                <textarea
                  value={proj.description}
                  onChange={(e) => updateProject(i, "description", e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  placeholder="Describe impact, outcomes, and technologies used"
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Certifications */}
      <section className="mt-6 rounded-xl bg-white border border-gray-200 p-6 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-4">Certifications</h2>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={certInput}
            onChange={(e) => setCertInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCertification())}
            placeholder="Type certification and press Enter"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <Button size="sm" onClick={addCertification}>
            <Plus size={14} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {(active.certifications || []).map((cert, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700"
            >
              {cert}
              <button onClick={() => removeCertification(i)} className="hover:text-red-500 transition-colors">
                ×
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Save / Delete */}
      <div className="mt-6 flex items-center gap-3">
        <Button onClick={handleSave} loading={saving} size="lg">
          <Save size={16} /> Save Resume
        </Button>
        {active.id && (
          <Button variant="danger" size="lg" onClick={() => handleDelete(active.id!)}>
            <Trash2 size={16} /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}
