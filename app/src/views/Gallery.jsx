import { useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { CaseImage, StatusPill } from "@/components/common";
import { CASES, matchesText } from "@/lib/imaced";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "caught", label: "Caught by Imaced" },
  { id: "wrong", label: "Wrong when masked" },
];

export default function Gallery({ gate, openCase }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const items = useMemo(() => CASES.map((c, i) => ({ c, i })).filter(({ c }) => {
    const ok = filter === "all" || (filter === "wrong" && !c.views.evid.correct) || (filter === "caught" && c.caught);
    return ok && matchesText(c, q);
  }), [filter, q]);

  return (
    <section aria-labelledby="gallery-h">
      <h1 id="gallery-h" className="sr-only">Gallery of cases</h1>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup type="single" value={filter} onValueChange={(v) => v && setFilter(v)} variant="outline" size="sm" aria-label="Filter cases" className="flex-wrap">
          {FILTERS.map((f) => <ToggleGroupItem key={f.id} value={f.id} className="h-8 px-3 text-[13px]">{f.label}</ToggleGroupItem>)}
        </ToggleGroup>
        <label className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-muted-foreground focus-within:border-ring sm:w-72">
          <Search className="size-3.5 shrink-0" aria-hidden />
          <span className="sr-only">Filter by text</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, question or option"
            className="h-full w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
        </label>
      </div>
      <p className="mb-4 text-xs text-muted-foreground" aria-live="polite">
        {items.length} of {CASES.length} cases · evidence-masked image shown
      </p>
      {items.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
          {items.map(({ c, i }) => {
            const ev = c.views.evid;
            return (
              <button key={c.ds_index} onClick={() => openCase(i)} aria-label={`Open case ${c.ds_index}: ${c.question}`}
                className="group flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-3 text-left transition-[background,border-color,transform] hover:-translate-y-px hover:border-input hover:bg-secondary">
                <CaseImage c={c} view="evid" stage={4 / 3} />
                <span className="font-mono text-[11px] text-muted-foreground">#{c.ds_index}</span>
                <span className="line-clamp-2 min-h-10 text-[13px] text-foreground/85">{c.question}</span>
                <span className="flex flex-wrap gap-1.5">
                  {gate === "imaced" && c.caught
                    ? <StatusPill tone="good"><ShieldCheck className="size-3" aria-hidden />Caught · abstained</StatusPill>
                    : <StatusPill tone={ev.correct ? "warn" : "crit"}>{ev.correct ? "Answered · evidence masked" : "Wrong · evidence masked"}</StatusPill>}
                  {gate !== "imaced" && c.caught && <StatusPill tone="good"><ShieldCheck className="size-3" aria-hidden />Imaced catches it</StatusPill>}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">
          No cases match.
          <Button variant="outline" size="sm" className="ml-2" onClick={() => { setFilter("all"); setQ(""); }}>Clear filters</Button>
        </div>
      )}
    </section>
  );
}
