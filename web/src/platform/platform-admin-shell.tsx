import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PlatformAdminPage } from "./platform-admin-model";

export type PlatformAdminNavigationItem = {
  key: PlatformAdminPage;
  label: string;
  description: string;
};

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
    signedInAs: string;
    signOut: string;
    skipToContent: string;
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

  const navigation = <>
    <div className="platform-admin-brand">
      <span className="platform-admin-brand-mark" aria-hidden="true">V</span>
      <span><strong>{labels.product}</strong><small>{labels.workspace}</small></span>
    </div>
    <nav className="platform-admin-navigation" aria-label={labels.navigation}>
      {items.map((item) => <button key={item.key} type="button"
        className={currentPage === item.key ? "active" : ""}
        aria-current={currentPage === item.key ? "page" : undefined}
        onClick={() => navigate(item.key)}>
        <span><strong>{item.label}</strong><small>{item.description}</small></span>
      </button>)}
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
        <span>{labels.workspace}</span><strong>{activeItem?.label}</strong>
      </div>
      <div className="platform-admin-header-account">
        <span className="platform-admin-header-identity"><small>{labels.signedInAs}</small><strong>{user.email}</strong></span>
        <button className="btn ghost sm" type="button" onClick={onLogout}>{labels.signOut}</button>
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
