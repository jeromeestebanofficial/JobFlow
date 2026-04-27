import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2 } from "lucide-react";
import {
  adminCreateTemplate,
  adminDeleteTemplate,
  adminListTemplates,
  adminUpdateTemplate,
  getAvailableSlugs,
} from "../api/adminDocumentTemplates";
import type { DocumentTemplate } from "../types";
import { Button } from "../components/ui/Button";

export function AdminTemplatesPage() {
  const [rows, setRows] = useState<DocumentTemplate[]>([]);
  const [slugs, setSlugs] = useState<{ resume: string[]; cover_letter: string[] }>({
    resume: [],
    cover_letter: [],
  });
  const [loading, setLoading] = useState(true);
  const [createType, setCreateType] = useState<"resume" | "cover_letter">("resume");
  const [createSlug, setCreateSlug] = useState("");
  const [createName, setCreateName] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const [list, avail] = await Promise.all([adminListTemplates(), getAvailableSlugs()]);
      setRows(list.data);
      setSlugs(avail.data);
      const pick = avail.data.resume[0] || "";
      setCreateSlug(createType === "resume" ? pick : avail.data.cover_letter[0] || "");
    } catch {
      toast.error("Could not load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (createType === "resume" && slugs.resume.length) {
      setCreateSlug((s) => (slugs.resume.includes(s) ? s : slugs.resume[0]));
    }
    if (createType === "cover_letter" && slugs.cover_letter.length) {
      setCreateSlug((s) => (slugs.cover_letter.includes(s) ? s : slugs.cover_letter[0]));
    }
  }, [createType, slugs]);

  const toggleActive = async (t: DocumentTemplate) => {
    try {
      await adminUpdateTemplate(t.id, { is_active: !t.is_active });
      toast.success(t.is_active ? "Template hidden from users" : "Template visible to users");
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : "Update failed");
    }
  };

  const handleCreate = async () => {
    if (!createName.trim() || !createSlug) {
      toast.error("Name and layout are required");
      return;
    }
    try {
      await adminCreateTemplate({
        template_type: createType,
        slug: createSlug,
        name: createName.trim(),
        is_active: true,
        sort_order: rows.filter((r) => r.template_type === createType).length,
      });
      toast.success("Template added");
      setCreateName("");
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : "Could not create template");
    }
  };

  const handleDelete = async (t: DocumentTemplate) => {
    if (!confirm(`Delete “${t.name}”?`)) return;
    try {
      await adminDeleteTemplate(t.id);
      toast.success("Deleted");
      load();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(typeof msg === "string" ? msg : "Delete failed");
    }
  };

  if (loading && !rows.length) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  const slugOptions = createType === "resume" ? slugs.resume : slugs.cover_letter;

  return (
    <div className="flex-1 overflow-auto p-8 max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900">Document templates</h1>
      <p className="mt-1 text-gray-500 text-sm">
        Users pick these when downloading tailored resume and cover letter PDFs. Each row maps a display name to a
        layout implemented in the app; adding a row with a new layout code requires a matching code deploy.
      </p>

      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">Add template</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
            <select
              value={createType}
              onChange={(e) => setCreateType(e.target.value as "resume" | "cover_letter")}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
            >
              <option value="resume">Resume</option>
              <option value="cover_letter">Cover letter</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Layout (slug)</label>
            <select
              value={createSlug}
              onChange={(e) => setCreateSlug(e.target.value)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white min-w-[140px]"
            >
              {slugOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 mb-1">Display name</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Executive compact"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            />
          </div>
          <Button type="button" onClick={handleCreate}>
            <Plus size={16} className="inline mr-1" /> Add
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3">System</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50/80">
                <td className="px-4 py-3 text-gray-600">{t.template_type}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">{t.slug}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => toggleActive(t)}
                    className={`text-xs font-medium px-2 py-1 rounded-md ${
                      t.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {t.is_active ? "On" : "Off"}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-500">{t.is_system ? "Yes" : "—"}</td>
                <td className="px-4 py-3">
                  {!t.is_system && (
                    <button
                      type="button"
                      onClick={() => handleDelete(t)}
                      className="text-red-600 hover:text-red-700 p-1"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
