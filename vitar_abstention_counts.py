"""Count abstentions under the calibrated thresholds in results/checker/checker_report.json.

    python vitar_abstention_counts.py [results/checker]
Writes abstention_counts_{test,all}.csv next to the checker rows.
"""
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd

out = Path(sys.argv[1] if len(sys.argv) > 1 else "results/checker")
rep = json.load(open(out / "checker_report.json"))
names = list(rep["test"])
tc_only = float(re.search(r"tau_C=([\d.]+)", names[2]).group(1))
tc, tg = map(float, re.findall(r"tau_[CG]=(-?[\d.]+)", names[3]))

d = pd.read_csv(out / "checker_rows.csv")
d = d[d.kept == True].copy()  # noqa: E712
for c in ("full", "evid", "rand"):
    d[f"{c}_G"] = d[f"{c}_G"].fillna(0.0)

# Same by-image split as vitar_calibrate.py
groups = np.array(sorted(d["image_group"].unique()), dtype=object)
np.random.default_rng(0).shuffle(groups)
d["split"] = np.where(d.image_group.isin(set(groups[: len(groups) // 2])), "calib", "test")


def table(s):
    rows = []
    for c, label in (("full", "full image (should answer)"),
                     ("evid", "evidence removed (should abstain)"),
                     ("rand", "random region masked (should answer)")):
        low_c = s[f"{c}_C"] < tc
        low_g = s[f"{c}_G"] < tg
        wrong = s[f"{c}_pred"] != s["gt"]
        rows.append({
            "input": label, "n": len(s),
            "C_only_abstains": int((s[f"{c}_C"] < tc_only).sum()),
            "combined_abstains": int((low_c | low_g).sum()),
            "by_low_C": int(low_c.sum()),
            "by_low_G_only": int((low_g & ~low_c).sum()),
            "answered_wrong": int(wrong.sum()),
            "wrong_and_caught": int((wrong & (low_c | low_g)).sum()),
        })
    return pd.DataFrame(rows).set_index("input")


test_t, all_t = table(d[d.split == "test"]), table(d)
test_t.to_csv(out / "abstention_counts_test.csv")
all_t.to_csv(out / "abstention_counts_all.csv")
print(f"thresholds: C-only tau_C={tc_only}  combined tau_C={tc} tau_G={tg}\n")
print("TEST split\n" + test_t.to_string() + "\n\nALL\n" + all_t.to_string())
