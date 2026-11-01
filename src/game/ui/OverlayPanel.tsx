import type { ReactNode } from "react";

type OverlayPanelProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  footer?: ReactNode;
};

/** Shared scrollable panel shell for menus, shop, and sheets (T04). */
export function OverlayPanel({
  title,
  subtitle,
  children,
  onClose,
  closeLabel = "Back",
  footer,
}: OverlayPanelProps) {
  return (
    <div className="overlay-panel sheet" role="dialog" aria-labelledby="overlay-panel-title">
      <header className="overlay-panel-head">
        <h2 id="overlay-panel-title">{title}</h2>
        {subtitle ? <p className="sheet-sub">{subtitle}</p> : null}
      </header>
      <div className="overlay-panel-body">{children}</div>
      <footer className="overlay-panel-foot">
        {footer}
        {onClose ? (
          <button type="button" className="btn-ghost" onClick={onClose}>
            {closeLabel}
          </button>
        ) : null}
      </footer>
    </div>
  );
}
