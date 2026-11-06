import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { StatusPill } from "@/components/common";
import { CASES } from "@/lib/imaced";

/** Ctrl+K / "/" command menu: jump to any case by number, question or answer option. */
export default function CaseFinder({ open, onOpenChange, onPick }) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title="Find a case" description="Search by case number, question or answer option">
      <CommandInput placeholder="Search by case number, question or answer option…" />
      <CommandList>
        <CommandEmpty>No case matches.</CommandEmpty>
        <CommandGroup heading={`${CASES.length} demo cases`}>
          {CASES.map((c, i) => (
            <CommandItem key={c.ds_index} value={`${c.ds_index} ${c.question} ${c.options.map(([, t]) => t).join(" ")}`} onSelect={() => onPick(i)} className="gap-3">
              <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">#{c.ds_index}</span>
              <span className="min-w-0 flex-1 truncate">{c.question}</span>
              {c.caught && <StatusPill tone="good">Caught</StatusPill>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
