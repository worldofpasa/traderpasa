"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Bot,
  CreditCard,
  FileText,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Shield,
  Sun,
  Users,
} from "lucide-react";
import type { User } from "../lib/strategy-types";

type ShellNavId = "overview" | "strategies" | "agents" | "accounts" | "sources" | "history" | "audit" | "settings";

interface DashboardShellProps {
  user: User | null;
  loading?: boolean;
  title: string;
  headerActions?: ReactNode;
  activeNav?: ShellNavId;
  children: ReactNode;
  feedbackUi?: ReactNode;
}

export function DashboardShell({
  user,
  loading = false,
  title,
  headerActions,
  activeNav,
  children,
  feedbackUi,
}: DashboardShellProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const isStrategiesRoute = pathname.startsWith("/strategies");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
  }, []);

  useEffect(() => {
    try {
      setSidebarCollapsed(localStorage.getItem("pasa-sidebar") === "collapsed");
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("pasa-theme", next);
    } catch {
      // ignore
    }
  };

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("pasa-sidebar", next ? "collapsed" : "expanded");
    } catch {
      // ignore
    }
  };

  const hashHref = useCallback((tab: string) => `/#${tab}`, []);

  const navActive = (id: ShellNavId) => {
    if (id === "strategies") return isStrategiesRoute || activeNav === "strategies";
    return activeNav === id;
  };

  if (loading) {
    return (
      <div className="dashboard-loading-container">
        <div className="dashboard-loading-content">
          <div className="eyebrow animated-pulse">Loading Pasa Trader Platform...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`dashboard-container ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {isMobileMenuOpen && <div className="sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />}

      <aside className={`dashboard-sidebar ${isMobileMenuOpen ? "open" : ""}`}>
        <div className="sidebar-header-mobile">
          <h2 className="sidebar-title">
            <span className="sidebar-logo-icon"><LineChart size={14} strokeWidth={2.4} /></span>
            <span className="sidebar-brand-text">Pasa Trader</span>
          </h2>
          <button
            type="button"
            onClick={toggleSidebar}
            className="sidebar-collapse-toggle"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button type="button" onClick={() => setIsMobileMenuOpen(false)} className="mobile-menu-close">
            ×
          </button>
        </div>

        <nav className="sidebar-nav">
          <Link
            href="/"
            className={`nav-button ${navActive("overview") ? "active" : ""}`}
            title="Dashboard"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <LayoutDashboard /> <span className="nav-label">Dashboard</span>
          </Link>
          <Link
            href="/strategies"
            className={`nav-button ${navActive("strategies") ? "active" : ""}`}
            title="Strategies"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <Bot /> <span className="nav-label">Strategies</span>
          </Link>
          <Link
            href={hashHref("agents")}
            className={`nav-button ${navActive("agents") ? "active" : ""}`}
            title="Agents"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <Users /> <span className="nav-label">Agents</span>
          </Link>
          <Link
            href={hashHref("accounts")}
            className={`nav-button ${navActive("accounts") ? "active" : ""}`}
            title="Broker Accounts"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <CreditCard /> <span className="nav-label">Broker Accounts</span>
          </Link>
          <Link
            href={hashHref("sources")}
            className={`nav-button ${navActive("sources") ? "active" : ""}`}
            title="Data Sources"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <Radio /> <span className="nav-label">Data Sources</span>
          </Link>
          <Link
            href={hashHref("history")}
            className={`nav-button ${navActive("history") ? "active" : ""}`}
            title="Proposals"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <FileText /> <span className="nav-label">Proposals</span>
          </Link>
          {user?.role === "ADMIN" && (
            <Link
              href={hashHref("audit")}
              className={`nav-button ${navActive("audit") ? "active" : ""}`}
              title="Audit Logs"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <Shield /> <span className="nav-label">Audit Logs</span>
            </Link>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user-info">
            <strong>{user?.name}</strong>
            <div className="sidebar-user-email">{user?.email}</div>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="secondary-button theme-toggle"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            <span className="btn-label">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <Link href={hashHref("settings")} className="secondary-button sidebar-link-btn" title="Settings">
            <KeyRound size={15} /> <span className="btn-label">Settings</span>
          </Link>
          <form action="/api/auth/logout" method="POST" className="display-contents">
            <button type="submit" className="secondary-button sidebar-signout-btn" title="Sign Out">
              <LogOut size={15} /> <span className="btn-label">Sign Out</span>
            </button>
          </form>
        </div>
      </aside>

      <main className="dashboard-main">
        <div className="mobile-header">
          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(true)}
            className="mobile-menu-trigger"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <Menu size={16} /> Menu
          </button>
          <div className="mobile-brand-logo">
            <span className="sidebar-logo-icon"><LineChart size={14} strokeWidth={2.4} /></span> Pasa Trader
          </div>
        </div>

        <header className="dashboard-header">
          <h1 className="dashboard-title">{title}</h1>
          {headerActions ? <div className="dashboard-header-actions">{headerActions}</div> : null}
        </header>

        {children}
      </main>

      {feedbackUi}
    </div>
  );
}
