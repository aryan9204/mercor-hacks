import { useEffect, useState, useCallback } from "react";
import { ScanSearch, LayoutPanelTop, ChartColumn, LayoutGrid, Search, Sparkles, Workflow } from "lucide-react";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Button } from "@/components/ui/button";
import { CASES, GATES } from "@/lib/imaced";
import Overview from "@/views/Overview";
import CaseView from "@/views/CaseView";
import Scoreboard from "@/views/Scoreboard";
import Gallery from "@/views/Gallery";
import Architecture from "@/views/Architecture";
import CaseFinder from "@/views/CaseFinder";

const TABS = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "case", label: "Case", icon: LayoutPanelTop },
  { id: "score", label: "Results", icon: ChartColumn },
  { id: "gallery", label: "Gallery", icon: LayoutGrid },
  { id: "architecture", label: "Architecture", icon: Workflow },
];
const DEFAULT_CASE = 0; // first demo case (caught cases are listed first)

function parseHash() {
  const [tab, id] = window.location.hash.replace(/^#\/?/, "").split("/");
  const idx = id ? CASES.findIndex((c) => String(c.ds_index) === id) : -1;
  return { tab: TABS.some((t) => t.id === tab) ? tab : "overview", idx: idx >= 0 ? idx : null };
}

export default function App() {
  const init = parseHash();
  const [tab, setTab] = useState(init.tab);
  const [idx, setIdx] = useState(init.idx ?? DEFAULT_CASE);
  const [gate, setGate] = useState("off");
  const [finderOpen, setFinderOpen] = useState(false);

  // Hash routing: #overview, #case/12834, #score, #gallery. Back/forward work, links are shareable.
  const go = useCallback((t, i = idx) => {
    setTab(t); setIdx(i);
    const h = t === "case" ? `#case/${CASES[i].ds_index}` : `#${t}`;
    if (window.location.hash !== h) window.history.pushState(null, "", h);
    window.scrollTo({ top: 0 });
  }, [idx]);
  useEffect(() => {
    const onPop = () => { const p = parseHash(); setTab(p.tab); if (p.idx != null) setIdx(p.idx); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setFinderOpen((o) => !o); return; }
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
      if (typing || document.querySelector("[role=dialog]")) return;
      if (e.key === "/") { e.preventDefault(); setFinderOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    document.title = tab === "case" ? `#${CASES[idx].ds_index} · Imaced` : `${TABS.find((t) => t.id === tab).label} · Imaced`;
  }, [tab, idx]);

  const openCase = (i) => go("case", i);

  return (
    <TooltipProvider delayDuration={200}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-secondary focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
          <button onClick={() => go("overview")} className="mr-1 flex items-center gap-2.5 rounded-md text-left" aria-label="Imaced overview">
            <span className="grid size-8 place-items-center rounded-lg border border-input bg-secondary text-evidence"><ScanSearch className="size-4" /></span>
            <span className="text-[15px] font-bold tracking-[0.16em]">IMACED</span>
            <span className="hidden text-xs text-muted-foreground xl:inline">is the answer coming from the evidence?</span>
          </button>
          <nav aria-label="Screens" className="flex rounded-lg border bg-muted/60 p-0.5">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => go(id)} aria-current={tab === id ? "page" : undefined}
                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors ${tab === id ? "bg-accent text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon className="size-3.5" aria-hidden /><span className="hidden sm:inline">{label}</span><span className="sr-only sm:hidden">{label}</span>
              </button>
            ))}
          </nav>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => setFinderOpen(true)} className="h-8 gap-2 text-muted-foreground md:min-w-56 md:justify-between" aria-label="Find a case (Ctrl+K)">
            <span className="inline-flex items-center gap-2"><Search className="size-3.5" /><span className="hidden md:inline">Find a case…</span></span>
            <kbd className="hidden rounded border border-b-2 px-1.5 font-mono text-[10px] md:inline">Ctrl K</kbd>
          </Button>
          <div className="flex w-full items-center gap-2 md:w-auto">
            <span id="gate-label" className="hidden text-xs text-muted-foreground lg:inline">Gate</span>
            <ToggleGroup type="single" value={gate} onValueChange={(v) => v && setGate(v)} aria-labelledby="gate-label" variant="outline" size="sm" className="w-full md:w-auto">
              {GATES.map((g) => (
                <Tooltip key={g.id}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value={g.id} className="h-8 flex-1 px-3 text-[13px] md:flex-none" aria-label={`${g.label}: ${g.hint}`}>{g.label}</ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-64">{g.hint}</TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[1480px] px-4 pb-16 pt-6 outline-none md:px-6">
        <div key={tab + (tab === "case" ? idx : "")} className="animate-in fade-in slide-in-from-bottom-1 duration-300">
          {tab === "overview" && <Overview gate={gate} openCase={openCase} go={go} />}
          {tab === "case" && <CaseView idx={idx} gate={gate} setIdx={(i) => go("case", i)} />}
          {tab === "score" && <Scoreboard gate={gate} openCase={openCase} />}
          {tab === "gallery" && <Gallery gate={gate} openCase={openCase} />}
          {tab === "architecture" && <Architecture openCase={openCase} go={go} />}
        </div>
      </main>
      <CaseFinder open={finderOpen} onOpenChange={setFinderOpen} onPick={(i) => { setFinderOpen(false); openCase(i); }} />
    </TooltipProvider>
  );
}
