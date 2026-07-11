// ============================================================================
// VAKA LOGO SYSTEM — the approved mark (gold V on ink tile with foundation
// line, from web/public/icons/vaka-mark.svg) rendered as reusable components.
// See docs/01-brand/LOGO-SYSTEM.md for usage rules.
// ============================================================================

type MarkProps = {
  /** Pixel size of the square mark. */
  size?: number;
  /** "tile" renders the ink rounded-square background; "bare" renders the V + foundation line only (for dark surfaces). */
  variant?: "tile" | "bare";
  className?: string;
};

/** The VAKA mark: gold V over the foundation line. */
export function VakaMark({ size = 28, variant = "tile", className }: MarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label="VAKA"
      focusable="false"
    >
      {variant === "tile" && <rect width="512" height="512" rx="112" fill="#14171F" />}
      <path d="M128 130h64l64 168 64-168h64L282 382h-52z" fill="#C9A227" />
      <path d="M114 408h284" stroke="#F6F6F3" strokeWidth="18" strokeLinecap="round" opacity=".9" />
    </svg>
  );
}

type LogoProps = {
  /** Mark size in pixels. */
  size?: number;
  /** Whether the logo sits on a dark or light surface (controls wordmark colour via CSS). */
  className?: string;
};

/** Full horizontal lockup: mark + "VAKA OS" wordmark. */
export function VakaLogo({ size = 30, className }: LogoProps) {
  return (
    <span className={`vaka-logo ${className ?? ""}`.trim()}>
      <VakaMark size={size} variant="tile" />
      <span className="vaka-logo-word">
        VAKA<span className="vaka-logo-os">OS</span>
      </span>
    </span>
  );
}
