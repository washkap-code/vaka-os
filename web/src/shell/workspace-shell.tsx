import { useEffect, useRef, useState, type ReactNode } from "react";
import { appEnglish } from "../locales/app.en";
import type { WorkspaceNavigationItem, WorkspacePage } from "./navigation";
import type { WorkspaceSearchTarget } from "./command-search-model";
import { CommandPalette } from "./command-palette";
import { NotificationMenu } from "./notification-menu";
import { UserMenu } from "./user-menu";

type WorkspaceTenant = {
  companyName: string;
  subdomain: string;
  logoUrl: string | null;
};

export function WorkspaceShell({ tenant, user, navigation, currentPage, onNavigate, onSearchSelect, onLogout, children }: {
  tenant: WorkspaceTenant;
  user: { fullName: string; email: string };
  navigation: readonly WorkspaceNavigationItem[];
  currentPage: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
  onSearchSelect: (target: WorkspaceSearchTarget) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const copy = appEnglish.shell;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = (restoreFocus = true) => {
    setDrawerOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };
  const navigate = (page: WorkspacePage) => {
    onNavigate(page);
    if (drawerOpen) closeDrawer(false);
  };

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  const navigationContent = <>
    <div className="workspace-brand">
      {tenant.logoUrl && <img src={tenant.logoUrl} alt="" className="workspace-logo" />}
      <strong>{tenant.companyName}</strong><small>VAKA OS</small>
    </div>
    <nav aria-label={copy.primaryNavigation}>
      {navigation.map((item) => <button key={item.key} type="button"
        className={currentPage === item.key ? "active" : ""}
        aria-current={currentPage === item.key ? "page" : undefined}
        onClick={() => navigate(item.key)}>{copy.navigation[item.key]}</button>)}
    </nav>
    <div className="workspace-foot">{copy.workspace.replace("{subdomain}", tenant.subdomain)}<br />{copy.poweredBy}</div>
  </>;
  const searchAvailable = navigation.some((item) => ["contacts", "suppliers", "invoices", "products"].includes(item.key));

  return <div className="shell">
    <a className="skip-link" href="#workspace-main">{copy.skipToContent}</a>
    <aside className="side desktop-side">{navigationContent}</aside>
    <header className="workspace-header">
      <button ref={menuButtonRef} className="shell-icon-button mobile-menu-button" type="button"
        aria-label={copy.openMenu} aria-expanded={drawerOpen} aria-controls="workspace-mobile-drawer"
        onClick={() => setDrawerOpen(true)}><span aria-hidden="true">☰</span></button>
      {searchAvailable && <CommandPalette onSelect={onSearchSelect} />}
      <div className="workspace-header-actions"><NotificationMenu />
        <UserMenu fullName={user.fullName} email={user.email}
          onSettings={() => navigate("settings")} onLogout={onLogout} />
      </div>
    </header>
    {drawerOpen && <>
      <button className="drawer-backdrop" type="button" aria-label={copy.closeMenu} onClick={() => closeDrawer()} />
      <aside id="workspace-mobile-drawer" className="mobile-drawer" aria-label={copy.mobileNavigation}>
        <button className="drawer-close" type="button" onClick={() => closeDrawer()}>{copy.closeMenu}</button>
        {navigationContent}
      </aside>
    </>}
    <main id="workspace-main" className="main" tabIndex={-1}>{children}</main>
  </div>;
}
