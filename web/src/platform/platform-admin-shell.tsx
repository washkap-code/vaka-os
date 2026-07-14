import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlatformAdminPage } from "./platform-admin-model";
import { UserMenu } from "../shell/user-menu";

export type PlatformAdminNavigationItem = {
  key: PlatformAdminPage;
  label: string;
  description: string;
};

export function PlatformAdminIcon({ page }: { page: PlatformAdminPage }) {
  const paths: Record<PlatformAdminPage, ReactNode> = {
    overview: <><path d="M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-3H4zM14 7h6V4h-6z" /></>,
    tenants: <><path d="M4 20V6a2 2 0 0 1 2-2h8v16M14 9h4a2 2 0 0 1 2 2v9M8 8h2M8 12h2M8 16h2M17 13h.01M17 17h.01M2 20h20" /></>,
    operations: <><path d="M4 13.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5.5M4 10.5V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v5.5M2 12h4l2-4 4 8 2-4h8" /></>,
    staff: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 9 19.37a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-1.55-1.03H3v-4h.08A1.7 1.7 0 0 0 4.63 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1.03-1.55V3h4v.08A1.7 1.7 0 0 0 15 4.63a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.37 9a1.7 1.7 0 0 0 1.55 1.03H21v4h-.08A1.7 1.7 0 0 0 19.4 15z" /></>,
    guide: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2zM8 7h8M8 11h6" /></>,
  };
  return <svg className="platform-admin-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[page]}</svg>;
}

export function PlatformAdminShell({
  items,
  currentPage,
  user,
  role,
  labels,
  onNavigate,
  onLogout,
  children,
}: {
  items: readonly PlatformAdminNavigationItem[];
  currentPage: PlatformAdminPage;
  user: { fullName: string; email: string };
  role: string;
  labels: {
    product: string;
    workspace: string;
    navigation: string;
    openMenu: string;
    closeMenu: string;
    mobileNavigation: string;
    skipToContent: string;
    workspaceGroup: string;
    administrationGroup: string;
    supportGroup: string;
  };
  onNavigate: (page: PlatformAdminPage) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const activeItem = items.find((item) => item.key === currentPage) ?? items[0];

  const closeDrawer = (restoreFocus = true) => {
    setDrawerOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };
  const navigate = (page: PlatformAdminPage) => {
    onNavigate(page);
    if (drawerOpen) closeDrawer(false);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => drawerCloseRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const renderNavigationItem = (item: PlatformAdminNavigationItem) => <button key={item.key} type="button"
    className={currentPage === item.key ? "active" : ""}
    aria-current={currentPage === item.key ? "page" : undefined}
    onClick={() => navigate(item.key)}>
    <PlatformAdminIcon page={item.key} />
    <span><strong>{item.label}</strong><small>{item.description}</small></span>
    <span className="platform-admin-nav-chevron" aria-hidden="true">›</span>
  </button>;
  const navigationGroups = [
    { label: labels.workspaceGroup, pages: ["overview", "tenants", "operations"] as PlatformAdminPage[] },
    { label: labels.administrationGroup, pages: ["staff", "settings"] as PlatformAdminPage[] },
    { label: labels.supportGroup, pages: ["guide"] as PlatformAdminPage[] },
  ];
  const navigation = <>
    <div className="platform-admin-brand">
      <span className="platform-admin-brand-mark" aria-hidden="true">V</span>
      <span><strong>{labels.product}</strong><small>{labels.workspace}</small></span>
    </div>
    <nav className="platform-admin-navigation" aria-label={labels.navigation}>
      {navigationGroups.map((group) => {
        const groupItems = group.pages.map((page) => items.find((item) => item.key === page)).filter(Boolean) as PlatformAdminNavigationItem[];
        return groupItems.length ? <section className="platform-admin-nav-group" aria-label={group.label} key={group.label}>
          <h2>{group.label}</h2>{groupItems.map(renderNavigationItem)}
        </section> : null;
      })}
    </nav>
    <div className="platform-admin-sidebar-profile">
      <span className="platform-admin-avatar" aria-hidden="true">{user.fullName.trim().slice(0, 1).toUpperCase()}</span>
      <span><strong>{user.fullName}</strong><small>{role}</small></span>
    </div>
  </>;

  return <div className="platform-admin-shell">
    <a className="skip-link" href="#platform-main">{labels.skipToContent}</a>
    <aside className="platform-admin-sidebar platform-admin-desktop-sidebar">{navigation}</aside>
    <header className="platform-admin-header">
      <button ref={menuButtonRef} className="platform-admin-icon-button platform-admin-menu-button" type="button"
        aria-label={labels.openMenu} aria-expanded={drawerOpen} aria-controls="platform-admin-mobile-drawer"
        onClick={() => setDrawerOpen(true)}><span aria-hidden="true">☰</span></button>
      <div className="platform-admin-header-context">
        <span>{labels.workspace} <b aria-hidden="true">/</b> {activeItem?.label}</span><strong>{activeItem?.description}</strong>
      </div>
      <div className="platform-admin-header-account">
        <UserMenu fullName={user.fullName} email={user.email} onSettings={() => navigate("settings")} onLogout={onLogout} />
      </div>
    </header>
    {drawerOpen && <>
      <button className="platform-admin-drawer-backdrop" type="button" aria-label={labels.closeMenu} onClick={() => closeDrawer()} />
      <aside ref={drawerRef} id="platform-admin-mobile-drawer" className="platform-admin-mobile-drawer" role="dialog" aria-modal="true" aria-label={labels.mobileNavigation}>
        <button ref={drawerCloseRef} className="platform-admin-drawer-close" type="button" onClick={() => closeDrawer()}>{labels.closeMenu}</button>
        {navigation}
      </aside>
    </>}
    <main id="platform-main" className="platform-admin-main" tabIndex={-1}>{children}</main>
  </div>;
}
