// src/components/ui/CopyButton.jsx
// Copy a string, with a brief "Copied" acknowledgement.
//
// navigator.clipboard needs a secure context; it's missing on plain http and in
// some in-app browsers, so there's a hidden-textarea fallback rather than a
// button that silently does nothing.
import { useEffect, useRef, useState } from "react";

async function writeText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export default function CopyButton({ text, label = "Copy", title = "Copy to clipboard", className = "" }) {
  const [state, setState] = useState(""); // "" | "ok" | "fail"
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  if (!text) return null;

  const onClick = async (e) => {
    // Rows are clickable in some tables — copying shouldn't also open them.
    e.stopPropagation();
    e.preventDefault();
    const ok = await writeText(String(text));
    setState(ok ? "ok" : "fail");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState(""), 1500);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold transition ${
        state === "ok"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : state === "fail"
            ? "border-red-200 bg-red-50 text-red-600"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"
      } ${className}`}
    >
      {state === "ok" ? "Copied" : state === "fail" ? "Failed" : label}
    </button>
  );
}
