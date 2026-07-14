import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function useModalFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      const initial = dialog.querySelector<HTMLElement>("[data-modal-initial-focus]") ?? dialog;
      initial.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)]
      .filter((element) => !element.hidden && element.getClientRects().length > 0);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const activeIsFocusable = activeElement ? focusable.includes(activeElement) : false;
    if (event.shiftKey && (activeElement === first || activeElement === dialog || !activeIsFocusable)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (activeElement === last || activeElement === dialog || !activeIsFocusable)) {
      event.preventDefault();
      first.focus();
    }
  };

  return { dialogRef, onKeyDown };
}
