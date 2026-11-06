import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Copy text to the clipboard; the icon swaps to a check for 1.5 s as feedback. */
export function CopyButton({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      ta.remove();
    }
    setDone(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => setDone(false), 1500);
  };
  return (
    <Button variant="outline" size="sm" onClick={copy} className="h-7 gap-1.5 px-2 text-xs" aria-label={done ? "Copied" : label}>
      {done ? <Check className="size-3.5 text-good" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span aria-live="polite">{done ? "Copied" : "Copy"}</span>
    </Button>
  );
}
