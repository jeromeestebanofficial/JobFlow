import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Layers } from "lucide-react";
import { register } from "../api/auth";
import { useAuthStore } from "../store/authStore";
import { Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

export function RegisterPage() {
  const [form, setForm] = useState({ email: "", password: "", full_name: "" });
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const { data } = await register(form.email, form.password, form.full_name);
      setAuth(data.user, data.access_token, data.refresh_token);
      toast.success("Account created! Let's set up your profile.");
      navigate("/resume");
    } catch (err: any) {
      toast.error(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 to-indigo-100 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 shadow-lg">
            <Layers size={22} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1 text-sm text-gray-500">Start applying smarter today</p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl border border-gray-100">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input label="Full name" type="text" value={form.full_name} onChange={set("full_name")} placeholder="Jane Doe" />
            <Input label="Email" type="email" value={form.email} onChange={set("email")} required />
            <Input label="Password" type="password" value={form.password} onChange={set("password")} required hint="At least 8 characters" />
            <Button type="submit" loading={loading} className="mt-2 w-full" size="lg">
              Create account
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
