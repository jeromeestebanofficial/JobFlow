import { type ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Briefcase, FileText, Send, Settings, LogOut, Layers, Zap, Shield, Download,
} from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { LinkedInApplyModal } from "../LinkedInApplyModal";
import clsx from "clsx";

const baseNavItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/swipe",     icon: Layers,           label: "Swipe Jobs" },
  { to: "/jobs",      icon: Briefcase,        label: "Browse Jobs" },
  { to: "/resume",    icon: FileText,         label: "My Resume" },
  { to: "/applications", icon: Send,          label: "Applications" },
  { to: "/settings",  icon: Settings,         label: "Settings" },
];

export function Layout({ children }: { children: ReactNode }) {
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [showLinkedIn, setShowLinkedIn] = useState(false);

  const navItems = user?.is_admin
    ? [
        ...baseNavItems.slice(0, -1),
        { to: "/admin/templates", icon: Shield, label: "Templates (admin)" },
        baseNavItems[baseNavItems.length - 1],
      ]
    : baseNavItems;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col bg-white border-r border-gray-200 shadow-sm">
        <div className="flex items-center gap-2.5 px-6 py-5 border-b border-gray-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
            <Layers size={16} className="text-white" />
          </div>
          <span className="text-lg font-bold text-gray-900">JobFlow</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}

          {/* LinkedIn Easy Apply CTA */}
          <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-1.5">
            <button
              onClick={() => setShowLinkedIn(true)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white bg-[#0077b5] hover:bg-[#005f90] transition-colors"
            >
              <Zap size={15} />
              LinkedIn Easy Apply
            </button>
            <a
              href="http://localhost:8001/api/v1/extension/download"
              download="JobFlow-Extension.zip"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-600 hover:to-indigo-600 transition-all"
            >
              <Download size={15} />
              Download Extension
            </a>
          </div>
        </nav>

        <LinkedInApplyModal open={showLinkedIn} onClose={() => setShowLinkedIn(false)} />

        <div className="border-t border-gray-100 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg px-3 py-2">
            <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-semibold text-brand-700">
              {(user?.full_name || user?.email || "U")[0].toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-gray-900">{user?.full_name || "User"}</p>
              <p className="truncate text-xs text-gray-500">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-auto">
        {children}
      </main>
    </div>
  );
}
