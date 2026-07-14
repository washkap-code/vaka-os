import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("vds-button", `vds-button--${variant}`, `vds-button--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="vds-spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
});

type FieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  hideLabel?: boolean;
};

function Field({
  id,
  label,
  hint,
  error,
  hideLabel,
  children,
}: FieldProps & { id: string; children: ReactElement<Record<string, unknown>> }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = cloneElement(children, {
    id,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  });

  return (
    <div className={cx("vds-field", Boolean(error) && "vds-field--error")}>
      <label className={cx("vds-label", hideLabel && "vds-visually-hidden")} htmlFor={id}>{label}</label>
      {control}
      {hint && <span className="vds-field-hint" id={hintId}>{hint}</span>}
      {error && <span className="vds-field-error" id={errorId}>{error}</span>}
    </div>
  );
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & FieldProps & { id?: string };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id: providedId, label, hint, error, hideLabel, className, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <Field id={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <input ref={ref} className={cx("vds-control", className)} {...props} />
    </Field>
  );
});

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & FieldProps & { id?: string };
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id: providedId, label, hint, error, hideLabel, className, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <Field id={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <textarea ref={ref} className={cx("vds-control vds-textarea", className)} {...props} />
    </Field>
  );
});

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & FieldProps & { id?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { id: providedId, label, hint, error, hideLabel, className, children, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  return (
    <Field id={id} label={label} hint={hint} error={error} hideLabel={hideLabel}>
      <select ref={ref} className={cx("vds-control vds-select", className)} {...props}>{children}</select>
    </Field>
  );
});

type ChoiceProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  description?: ReactNode;
};

const Choice = forwardRef<HTMLInputElement, ChoiceProps & { type: "checkbox" | "radio" }>(function Choice(
  { type, label, description, className, id: providedId, ...props },
  ref,
) {
  const generatedId = useId();
  const id = providedId ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <label className={cx("vds-choice", className)} htmlFor={id}>
      <input ref={ref} id={id} type={type} aria-describedby={descriptionId} {...props} />
      <span>
        <span className="vds-choice-label">{label}</span>
        {description && <span className="vds-choice-description" id={descriptionId}>{description}</span>}
      </span>
    </label>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, ChoiceProps>(function Checkbox(props, ref) {
  return <Choice ref={ref} type="checkbox" {...props} />;
});

export const Radio = forwardRef<HTMLInputElement, ChoiceProps>(function Radio(props, ref) {
  return <Choice ref={ref} type="radio" {...props} />;
});

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent" }) {
  return <span className={cx("vds-badge", `vds-badge--${tone}`, className)} {...props} />;
}

export function Card({
  elevation = "none",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { elevation?: "none" | "sm" | "md" }) {
  return <div className={cx("vds-card", `vds-card--${elevation}`, className)} {...props} />;
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
}) {
  return (
    <div
      className={cx("vds-alert", `vds-alert--${tone}`, className)}
      role={tone === "danger" ? "alert" : "status"}
      {...props}
    >
      <span className="vds-alert-mark" aria-hidden="true" />
      <div>{title && <strong>{title}</strong>}<div>{children}</div></div>
    </div>
  );
}

export function Tooltip({
  content,
  children,
  className,
}: {
  content: ReactNode;
  children: ReactElement;
  className?: string;
}) {
  const id = useId();
  const child = isValidElement(children)
    ? cloneElement(children, { "aria-describedby": id } as HTMLAttributes<HTMLElement>)
    : children;
  return (
    <span className={cx("vds-tooltip", className)}>
      {child}
      <span className="vds-tooltip-content" id={id} role="tooltip">{content}</span>
    </span>
  );
}

export type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ open, onClose, title, description, closeLabel, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="vds-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClose={onClose}
    >
      <div className="vds-dialog-header">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label={closeLabel}>×</Button>
      </div>
      <div className="vds-dialog-body">{children}</div>
      {footer && <div className="vds-dialog-footer">{footer}</div>}
    </dialog>
  );
}

export const Modal = Dialog;

export function Dropdown({
  label,
  children,
  align = "start",
  className,
  ariaLabel,
}: {
  label: ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  ariaLabel?: string;
}) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (root.current?.open && !root.current.contains(event.target as Node)) root.current.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return (
    <details ref={root} className={cx("vds-dropdown", `vds-dropdown--${align}`, className)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && root.current?.open) {
          root.current.open = false;
          root.current.querySelector("summary")?.focus();
        }
      }}>
      <summary aria-label={ariaLabel}>{label}</summary>
      <div className="vds-dropdown-menu" onClick={(event) => {
        if ((event.target as HTMLElement).closest("button, a")) root.current?.removeAttribute("open");
      }}>{children}</div>
    </details>
  );
}

export type TabItem = { id: string; label: ReactNode; content: ReactNode; disabled?: boolean };
export function Tabs({
  items,
  defaultId,
  ariaLabel,
  onChange,
}: {
  items: TabItem[];
  defaultId?: string;
  ariaLabel: string;
  onChange?: (id: string) => void;
}) {
  const groupId = useId();
  const firstAvailable = items.find((item) => !item.disabled)?.id ?? "";
  const [activeId, setActiveId] = useState(defaultId ?? firstAvailable);
  const active = items.find((item) => item.id === activeId && !item.disabled) ?? items.find((item) => !item.disabled);

  const select = (id: string) => {
    setActiveId(id);
    onChange?.(id);
  };

  const move = (current: string, direction: 1 | -1) => {
    const enabled = items.filter((item) => !item.disabled);
    const index = enabled.findIndex((item) => item.id === current);
    const next = enabled[(index + direction + enabled.length) % enabled.length];
    if (next) select(next.id);
  };

  return (
    <div className="vds-tabs">
      <div className="vds-tab-list" role="tablist" aria-label={ariaLabel}>
        {items.map((item) => (
          <button
            key={item.id}
            id={`${groupId}-${item.id}-tab`}
            type="button"
            role="tab"
            aria-selected={item.id === active?.id}
            aria-controls={`${groupId}-${item.id}-panel`}
            disabled={item.disabled}
            tabIndex={item.id === active?.id ? 0 : -1}
            onClick={() => select(item.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") { event.preventDefault(); move(item.id, 1); }
              if (event.key === "ArrowLeft") { event.preventDefault(); move(item.id, -1); }
              if (event.key === "Home" && firstAvailable) { event.preventDefault(); select(firstAvailable); }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {active && (
        <div
          id={`${groupId}-${active.id}-panel`}
          className="vds-tab-panel"
          role="tabpanel"
          aria-labelledby={`${groupId}-${active.id}-tab`}
          tabIndex={0}
        >
          {active.content}
        </div>
      )}
    </div>
  );
}

export function Skeleton({
  variant = "text",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: "text" | "circle" | "block" }) {
  return <span className={cx("vds-skeleton", `vds-skeleton--${variant}`, className)} aria-hidden="true" {...props} />;
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("vds-empty-state", className)}>
      {icon && <div className="vds-empty-state-icon" aria-hidden="true">{icon}</div>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {actions && <div className="vds-empty-state-actions">{actions}</div>}
    </div>
  );
}

export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("vds-page-container", className)} {...props} />;
}

export function Section({
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { tone?: "default" | "subtle" | "inverse" }) {
  return <section className={cx("vds-section", `vds-section--${tone}`, className)} {...props} />;
}

export function Heading({
  level = 2,
  size,
  className,
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  size?: "display-xl" | "display-lg" | "h1" | "h2" | "h3";
}) {
  const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return <Tag className={cx("vds-heading", `vds-heading--${size ?? `h${Math.min(level, 3)}`}`, className)} {...props}>{children}</Tag>;
}

export function Logo({
  ariaLabel,
  compact = false,
  className,
}: {
  ariaLabel: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("vds-logo", compact && "vds-logo--compact", className)} role="img" aria-label={ariaLabel}>
      <span aria-hidden="true">VAKA</span>
      {!compact && <small aria-hidden="true">OS</small>}
    </span>
  );
}

export function ButtonGroup({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("vds-button-group", className)} {...props}>{Children.toArray(children)}</div>;
}
