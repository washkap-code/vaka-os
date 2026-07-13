import type { ReactNode } from "react";
import { useModalFocus } from "./use-modal-focus";

type LegacyModalProps = {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  backdropClassName?: string;
};

export function LegacyModal({ labelledBy, onClose, children, className, backdropClassName }: LegacyModalProps) {
  const { dialogRef, onKeyDown } = useModalFocus(onClose);
  return (
    <div
      className={["modalbg", backdropClassName].filter(Boolean).join(" ")}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      role="presentation"
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={["modal", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
      >
        {children}
      </section>
    </div>
  );
}
