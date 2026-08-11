// src/components/ui/Modal.jsx
// Sheet on mobile (bottom by default, top with align="top"), centred dialog
// from `sm` up.
//
// Layout is a flex column with a `min-h-0` scroll body, so the header and
// footer stay pinned and only the content scrolls — the old fixed max-height
// on the body could overflow the shell once header + footer were added. The
// footer carries iOS safe-area padding so buttons clear the home indicator.
import { useEffect, useRef, useState } from "react";

// Modals can nest (e.g. the item picker opened from the remap dialog), so track
// who's on top — Escape should close only the topmost sheet, not the whole pile.
const stack = [];

// `align="top"` anchors the sheet to the top of the screen on mobile. A dialog
// with a search field has to: anchored at the bottom, opening the keyboard
// pushes the results down behind it, and a search that narrows to one match
// leaves that match invisible.
export default function Modal({ open, onClose, title, children, footer, wide = false, align = "bottom" }) {
  const idRef = useRef({});
  // The on-screen keyboard shrinks the visual viewport but not the layout
  // viewport, so dvh alone still lets the sheet run under the keyboard.
  const [viewportH, setViewportH] = useState(null);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!open || !vv) return;
    const sync = () => setViewportH(vv.height);
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const me = idRef.current;
    stack.push(me);
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (stack[stack.length - 1] !== me) return;
      onClose?.();
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind the sheet from scrolling on touch devices.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      const at = stack.indexOf(me);
      if (at >= 0) stack.splice(at, 1);
      document.body.style.overflow = stack.length ? "hidden" : prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const top = align === "top";

  return (
    <div
      className={`fixed inset-0 z-[80] flex justify-center bg-slate-900/40 sm:items-center sm:p-4 ${
        top ? "items-start" : "items-end"
      }`}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        className={`flex w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92dvh] flex-col overflow-hidden bg-white shadow-xl sm:max-h-[85vh] sm:rounded-2xl ${
          top ? "rounded-b-2xl" : "rounded-t-2xl"
        }`}
        // Fit the space the keyboard leaves. Falls back to the dvh cap above
        // where visualViewport isn't available.
        style={viewportH ? { maxHeight: `${Math.round(viewportH - (top ? 8 : 0))}px` } : undefined}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 sm:py-3.5">
          <h2 className="min-w-0 break-words font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-1.5 -mt-0.5 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>

        {footer && (
          <div
            className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 [&>button]:w-full sm:flex-row sm:justify-end sm:px-5 sm:[&>button]:w-auto"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
