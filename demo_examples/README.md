# Demo examples: evidence masking (ViTAR-16K, Qwen2.5-VL-7B)

Each folder has the exact images the model saw (`full.png`, `evidence_masked.png`, `random_masked.png`)
and `meta.json` with the model's answer, confidence and per-option log-probs for every condition
(full, question only, evidence masked, random masked, and each with a "Cannot be determined" option).

**Selection.** These 8 examples were selected from the 15 "core" good examples
(results/vitar_good_examples.csv without the spine yes/no questions) by a fixed rule:
masking the evidence lowers p(correct answer) by at least 0.20, by more than masking a random
same-size region does, and the model still answers correctly with the random mask.
The other 7 core examples did not meet the rule. They are illustrations, not a
representative sample; see results/ for the full numbers.
