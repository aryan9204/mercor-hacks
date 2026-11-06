import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VIEW_ORDER, VIEW_NAME, MODEL } from "@/lib/imaced";
import { CopyButton } from "./CopyButton";

export const instructionText = (c) =>
  "Answer the multiple-choice question with only the letter of the correct option. Do not explain.\n\n" +
  `Q: ${c.question} ${c.options.map(([L, t]) => `${L}) ${t}`).join(" ")}\nA:`;

function Block({ title, text, note }) {
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h3>
        <CopyButton text={text} label={`Copy ${title}`} />
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-card p-3 font-mono text-xs leading-relaxed">{text}</pre>
    </section>
  );
}

export function PromptDialog({ c }) {
  const views = VIEW_ORDER.filter((k) => c.views[k]);
  const instr = instructionText(c);
  const abNote = `In ab_probs, "${c.abstain_letter}" is the added option "Cannot be determined".`;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <FileText className="size-3.5" aria-hidden />Prompt &amp; raw outputs
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Prompt &amp; raw outputs · case #{c.ds_index}</DialogTitle>
          <DialogDescription className="break-words">{MODEL}. Values as logged by the run.</DialogDescription>
        </DialogHeader>
        <Block title="Instruction text" text={instr} />
        {views.map((k) => {
          const v = c.views[k];
          const json = JSON.stringify({ view: k, pred: v.pred, conf: v.conf, probs: v.probs, ab_probs: v.ab_probs, p_abstain: v.p_abstain, checker: v.checker }, null, 2);
          return <Block key={k} title={`Option probabilities · ${VIEW_NAME[k]}`} text={json} note={abNote} />;
        })}
        <Block title="Option probabilities · no image (blind)"
          text={JSON.stringify({ pred: c.blind.pred, conf: c.blind.conf, probs: c.blind.probs }, null, 2)} />
      </DialogContent>
    </Dialog>
  );
}
