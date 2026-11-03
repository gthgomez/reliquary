import { useRef, type ReactNode } from "react";
import { useOverlayFocusTrap } from "./useOverlayFocusTrap.ts";

type OverlayPanelProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  footer?: ReactNode;
  wide?: boolean;
};

/** Shared scrollable panel shell for menus, shop, and sheets (T04). */
export function OverlayPanel({
  title,
  subtitle,
  children,
  onClose,
  closeLabel = "Back",
  footer,
  wide = false,
}: OverlayPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useOverlayFocusTrap(panelRef, true);

  return (
    <div
      ref={panelRef}
      className={`overlay-panel sheet${wide ? " sheet-wide" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="overlay-panel-title"
    >
      <header className="overlay-panel-head">
        <h2 id="overlay-panel-title">{title}</h2>
        {subtitle ? <p className="sheet-sub">{subtitle}</p> : null}
      </header>
      <div className="overlay-panel-body">{children}</div>
      <footer className="overlay-panel-foot">
        {footer}
        {onClose ? (
          <button type="button" className="btn-ghost overlay-panel-close" onClick={onClose}>
            {closeLabel}
          </button>
        ) : null}
      </footer>
    </div>
  );
}
