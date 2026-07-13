import { cloneElement, useId, type ReactElement, type ReactNode } from "react";

type LabelledControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

type LegacyFieldProps = {
  label: ReactNode;
  children: ReactElement<LabelledControlProps>;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
};

export function LegacyField({ label, children, hint, error, className }: LegacyFieldProps) {
  const generatedId = useId();
  const id = children.props.id ?? generatedId;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["field", error && "field-error", className].filter(Boolean).join(" ")}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"],
      })}
      {hint && <small className="field-help" id={hintId}>{hint}</small>}
      {error && <small className="err-text" id={errorId}>{error}</small>}
    </div>
  );
}
