import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Layout } from "./components/layout/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SwipePage } from "./pages/SwipePage";
import { JobsPage } from "./pages/JobsPage";
import { ResumePage } from "./pages/ResumePage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminTemplatesPage } from "./pages/AdminTemplatesPage";
import { useAuthStore } from "./store/authStore";
import { getMe } from "./api/auth";

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isHydrated } = useAuthStore((s) => s);
  if (!isHydrated) return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { setAuth, logout, setHydrated, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (token) {
      getMe()
        .then((r) => {
          const refresh = localStorage.getItem("refresh_token") || "";
          setAuth(r.data, token, refresh);
        })
        .catch(() => logout());
    } else {
      setHydrated();
    }
  }, []);

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/swipe" element={<ProtectedRoute><SwipePage /></ProtectedRoute>} />
        <Route path="/jobs" element={<ProtectedRoute><JobsPage /></ProtectedRoute>} />
        <Route path="/resume" element={<ProtectedRoute><ResumePage /></ProtectedRoute>} />
        <Route path="/applications" element={<ProtectedRoute><ApplicationsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route
          path="/admin/templates"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <AdminTemplatesPage />
              </AdminRoute>
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
