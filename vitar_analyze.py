"""Analyze the good examples from vitar_abstention.py, with and without the yes/no-style questions.

Run anywhere with pandas/numpy/scipy/scikit-learn (Colab has them):
    python vitar_analyze.py [results_dir]
Reads <results_dir>/vitar_good_examples.csv and writes <results_dir>/vitar_core_summary.json.

"Core" examples drop the spine questions ("Is there spinal canal stenosis at L4-L5? A) Yes ... B) No ...
C) Image does not cover L4 segment"). They are yes/no questions in disguise (the old question-type filter
missed them because of the third option), the evidence box covers ~1% of the image, and the model
answers "A" at ~0.6 on all of them whether or not the evidence is masked.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import wilcoxon
from sklearn.metrics import roc_auc_score

results = Path(sys.argv[1] if len(sys.argv) > 1 else "results")
good = pd.read_csv(results / "vitar_good_examples.csv")
good["d_evid"] = good["evid_logp_gt"] - good["full_logp_gt"]  # change in log p(correct) when evidence is masked
good["d_rand"] = good["rand_logp_gt"] - good["full_logp_gt"]  # ... when a same-size random region is masked


def auroc(should_abstain, should_answer):
    """How well low top-option confidence separates the two groups (0.5 = chance, 1 = perfect)."""
    y = np.r_[np.ones(len(should_abstain)), np.zeros(len(should_answer))]
    return float(roc_auc_score(y, np.r_[-should_abstain, -should_answer]))


def summarize(g):
    flipped = g[g["evid_pred"] != g["gt"]]
    ab = g["abstain_letter"]
    return {
        "n": int(len(g)),
        "accuracy": {c: float((g[f"{c}_pred"] == g["gt"]).mean()) for c in ("full", "evid", "rand")},
        "mean_p_correct": {c: float(g[f"{c}_p_gt"].mean()) for c in ("full", "evid", "rand")},
        "mean_top_option_conf": {c: float(g[f"{c}_conf"].mean()) for c in ("full", "evid", "rand")},
        "mean_delta_logp_correct": {"evid": float(g["d_evid"].mean()), "rand": float(g["d_rand"].mean())},
        "frac_evidence_hurts_more_than_random": float((g["d_evid"] < g["d_rand"]).mean()),
        "wilcoxon_p_evid_vs_rand": float(wilcoxon(g["d_evid"], g["d_rand"]).pvalue),
        "auroc_conf_masked_vs_random": auroc(g["evid_conf"].values, g["rand_conf"].values),
        "auroc_conf_masked_vs_full": auroc(g["evid_conf"].values, g["full_conf"].values),
        "flipped_to_wrong_answer": int(len(flipped)),
        "conf_on_wrong_answer_when_flipped": flipped["evid_conf"].round(3).tolist(),
        "abstain_option_picked": {c: float((g[f"{c}_ab_pred"] == ab).mean()) for c in ("full", "evid", "rand")},
    }


core = good[~good["question"].str.startswith("Is there spinal canal stenosis")]
out = {"all_good": summarize(good), "core_without_spine_yes_no": summarize(core)}
(results / "vitar_core_summary.json").write_text(json.dumps(out, indent=2))
print(json.dumps(out, indent=2))
