import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/common";
import { cn } from "@/lib/utils";
import { CASES, VIEW_ORDER, MODEL } from "@/lib/imaced";
import { PromptDialog } from "@/components/case/PromptDialog";
import { VerdictBanner } from "@/components/case/VerdictBanner";
import { ViewCard } from "@/components/case/ViewCard";
import { CheckTrace } from "@/components/case/CheckTrace";

function Swatch({ className, style }) {
  return <span className={cn("inline-block h-3 w-5 shrink-0 rounded-sm", className)} style={style} aria-hidden />;
}

export default function CaseView({ idx, gate, setIdx }) {
  const n = CASES.length;
  const c = CASES[idx] ?? CASES[0];
  const prev = () => setIdx((idx - 1 + n) % n);
  const next = () => setIdx((idx + 1) % n);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      const typing = /INPUT|TEXTAREA|SELECT/.test(t?.tagName || "") || t?.isContentEditable;
      if (typing || document.querySelector("[role=dialog]")) return;
      if (t?.closest?.("[role=radiogroup],[role=group],[role=tablist],[role=slider]")) return;
      e.preventDefault();
      e.key === "ArrowLeft" ? prev() : next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="min-w-0 space-y-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={prev} aria-label="Previous case">
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span className="tnum min-w-14 text-center font-mono text-sm" aria-label={`Case ${idx + 1} of ${n}`}>{idx + 1} / {n}</span>
          <Button variant="outline" size="icon" className="size-8" onClick={next} aria-label="Next case">
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
        <Badge variant="outline" className="font-mono">#{c.ds_index}</Badge>
        <Badge variant="secondary" className="max-w-full truncate font-mono">{MODEL}</Badge>
        <div className="flex-1" />
        <PromptDialog c={c} />
      </div>

      {/* Question */}
      <Card className="gap-0 p-4 py-4 shadow-none md:p-5">
        <Eyebrow>Question</Eyebrow>
        <h1 className="mt-1.5 break-words text-lg font-semibold leading-snug md:text-xl">{c.question}</h1>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Options">
          {c.options.map(([L, t]) => {
            const ok = L === c.gt;
            return (
              <li key={L}
                className={cn("inline-flex max-w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm",
                  ok ? "border-good/70 bg-good/10" : "border-border bg-secondary/40")}>
                <span className="font-mono text-xs text-muted-foreground">{L}</span>
                <span className="min-w-0 break-words">{t}</span>
                {ok && <Check className="size-3.5 shrink-0 text-[#8ee08e]" aria-label="Labelled answer" />}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Labelled answer from the dataset: <span className="text-foreground">{c.gt} ({c.gt_text})</span>.
        </p>
      </Card>

      <VerdictBanner c={c} gate={gate} />

      {/* Three inputs */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {VIEW_ORDER.map((k) => c.views[k] && <ViewCard key={k} c={c} k={k} gate={gate} />)}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><Swatch className="border-2 border-dashed border-evidence" />dataset evidence box</span>
        <span className="inline-flex items-center gap-2"><Swatch className="border-2 border-[#c3c2b7]" />irrelevant region box</span>
        <span className="inline-flex items-center gap-2"><Swatch style={{ background: "var(--data)" }} />p(option)</span>
        <span className="ml-auto hidden items-center gap-1.5 md:inline-flex">
          <kbd className="rounded border border-b-2 px-1.5 font-mono text-[10px]">←</kbd>
          <kbd className="rounded border border-b-2 px-1.5 font-mono text-[10px]">→</kbd>
          previous / next case
        </span>
      </div>

      <CheckTrace c={c} />
    </div>
  );
}
