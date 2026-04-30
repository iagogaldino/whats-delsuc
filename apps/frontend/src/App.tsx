import { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { InstanceWorkspacePage } from "./pages/InstanceWorkspacePage";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { getAccessToken, logout } from "./services/api";
import type { PublicInstance } from "./services/api";

const tabs = ["Dashboard"] as const;
type Tab = (typeof tabs)[number];
type AppView = "dashboard" | "instance";

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isAuthenticated, setIsAuthenticated] = useState(Boolean(getAccessToken()));
  const [view, setView] = useState<AppView>("dashboard");
  const [selectedInstance, setSelectedInstance] = useState<PublicInstance | null>(null);

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        {authMode === "login" ? (
          <LoginPage
            onLoggedIn={() => setIsAuthenticated(true)}
            onSwitchToSignup={() => setAuthMode("signup")}
          />
        ) : (
          <SignupPage
            onSignedUp={() => setIsAuthenticated(true)}
            onSwitchToLogin={() => setAuthMode("login")}
          />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex w-full max-w-6xl gap-6 px-4 py-8">
        <aside className="w-64 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h1 className="text-xl font-bold text-emerald-400">AutoGPT-WhatsApp</h1>
          <p className="mt-1 text-xs text-slate-400">Automation Pro</p>
          <nav className="mt-6 space-y-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  activeTab === tab
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="mt-8 w-full rounded-lg bg-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-600"
            onClick={() => {
              logout();
              setIsAuthenticated(false);
              setAuthMode("login");
            }}
          >
            Sair
          </button>
        </aside>
        <main className="flex-1 rounded-xl border border-slate-800 bg-slate-900 p-6">
          {activeTab === "Dashboard" && view === "dashboard" ? (
            <DashboardPage
              onOpenInstance={(instance) => {
                setSelectedInstance(instance);
                setView("instance");
              }}
            />
          ) : null}
          {activeTab === "Dashboard" && view === "instance" && selectedInstance ? (
            <InstanceWorkspacePage
              instance={selectedInstance}
              onBack={() => {
                setView("dashboard");
                setSelectedInstance(null);
              }}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default App;
