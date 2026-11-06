# The abstention checker (v2)

**Goal.** Decide, at test time and without knowing the right answer, whether Qwen2.5-VL-7B's answer to a
medical multiple-choice question should be accepted or deferred because the image doesn't support it.

**Bottom line.** On held-out data the checker cuts unsafe answers (answering when it should abstain)
from 100% to 70%, while deferring 20% of answers it should have given. It beats a plain confidence
threshold on the risk–coverage curve (AURC 0.572 vs 0.642), but it's nowhere near safe enough for
medical use. The stronger finding is the failure mode itself: the model answers whether or not the
evidence exists, with the same confidence.

Code: `vitar_checker_v2.py` (scoring, runs on a Colab GPU), `vitar_calibrate_v2.py` (fitting and
evaluation, runs anywhere). Results: `results/checker_v2/`.

---

## 1. Data: the 119 questions

- **Dataset:** ViTAR-16K (`jline/ViTAR-16K`), medical multiple-choice VQA with annotated evidence boxes.
- **Question type:** classification questions only (tumor type, fundus category, tooth type, etc.).
  Excluded: yes/no questions (including "Yes (...) / No (...) / Image does not cover..." spine
  questions), bounding-box choice questions, counting and position questions. For these, masking the
  evidence changes the right answer rather than making the question unanswerable.
- **Sample:** the first 300 classification questions after a seeded shuffle (seed 0). Kept the **119**
  that the model answers correctly on the full image, whose evidence box covers ≤50% of the image, and
  that have room for a non-overlapping control box.
- **Split:** by image (MD5 of the pixels), half for calibration (59 questions) and half for test
  (60 questions). The same image never appears in both halves.

## 2. How the model is asked and scored

Prompt (chat template, image before text):

```
Answer the multiple-choice question with only the letter of the correct option. Do not explain.

Q: <question with options, e.g. "What is the tumor type at image coordinates (0.4, 0.6)? A) Glioma B) Meningioma C) Pituitary D) No tumor">
A:
```

We don't generate. We run one forward pass and read the model's next-token log-probabilities for the
option letters (`A`, `B`, ...) at the answer position, then renormalize them over the valid letters.
That gives a probability for every option.

## 3. The six inputs per question

Every question is scored against six versions of the image. Labels come from how each input was built:

| Input | How it's made | Should the model |
|---|---|---|
| `full` | original image | **answer** |
| `rand` | gray out a random box the same size as the lesion box, not overlapping it | **answer** (control: occlusion alone isn't a reason to abstain) |
| `evid` | gray out the annotated lesion box | abstain |
| `evid_big` | gray out the lesion box scaled 2.5× around its center | abstain |
| `mismatch_cross` | swap in an image from a different body area (e.g. a fundus photo for a brain-tumor question) | abstain |
| `mismatch_same` | coordinate questions only: swap in an image from the same body area, so the named coordinates point at another patient | abstain |

Details:
- **Gray** is RGB (124, 116, 104), the same everywhere.
- **Lesion box:** ViTAR gives 1–3 boxes per question, often a small lesion box plus a large organ box.
  We use the smallest box, preferring one that contains the point the question names, e.g. "(0.4, 0.55)".
- **Random box:** placements are sampled with probability proportional to area across the regions
  left, right, above and below the lesion box (seeded).
- **Body area** comes from keywords in the question (fundus, kidney, breast, brain, spine, dental,
  nodule, liver, tumor stage). Swap-in images come from the same split and a different image.

## 4. The five signals

None of these needs the correct answer or the lesion location, so all of them could run in deployment.

| Signal | What it is | Why |
|---|---|---|
| `C_orig` | probability of the top option, in the original option order | the standard confidence gate |
| `C_perm` | probability of the top option averaged over up to 4 cyclic reorderings of the options, mapped back to option text | the model picks "B" 46% of the time vs 32% correct; averaging removes the letter-position bias |
| `consistency` | share of reorderings whose top option matches the averaged answer | **shuffle test**: an answer that follows a letter position, not an option, is suspect |
| `blind_gain` | log p(answer \| image) − log p(answer \| no image), both order-averaged | **blind test**: did the image actually raise the chosen answer above the question wording alone? |
| `p_abstain` | probability of an added option "Cannot be determined from the image", appended as the next letter | the model's own "I don't know" |

Cost per input: up to 4 forward passes for the reorderings, plus 1 for the abstain-option version.
The question-only passes (4) are shared across all inputs for a question.

## 5. Combining them into one decision

1. **Standardize** each signal (mean and standard deviation from the calibration half).
2. **Logistic regression** (scikit-learn, C=1.0) on the calibration half, pooled over all six inputs,
   predicting "should abstain". Output: an abstain score between 0 and 1.
3. **Threshold:** the score is cut at **0.732**, the highest value that keeps abstentions on calibration
   full images at ≤10%. Abstain if score > 0.732.
4. **Reason:** for each deferral, the signal contributing most to the abstain score is reported, e.g.
   "answer changes when options are reordered".

Learned weights (standardized; positive pushes toward abstain):

| Signal | Weight | Reading |
|---|---|---|
| `consistency` | −0.72 | inconsistent answers → abstain (strongest signal) |
| `p_abstain` | +0.60 | leaning toward "cannot be determined" → abstain |
| `C_orig` | +0.28 | counterintuitive; `C_orig` and `C_perm` overlap heavily, so read them together, not one by one |
| `blind_gain` | +0.17 | counterintuitive: swapped-in images raise the answer *more* than real ones (see §7) |
| `C_perm` | −0.05 | adds little once the others are in |

On the test half, 60 of 86 deferrals were mainly triggered by the shuffle test and 25 by
"cannot be determined".

## 6. Results (test half, 95% CIs from 2,000 bootstrap resamples by image)

| | No check | Confidence only | **Combined checker** | "Cannot be determined" option |
|---|---|---|---|---|
| Abstains: different-body-area image | 0% | 13% | **50%** [38–62] | 93% |
| Abstains: same-body-area image (n=16) | 0% | 62% | 12% [0–31] | 50% |
| Abstains: big lesion mask | 0% | 13% | 25% [15–37] | 77% |
| Abstains: original lesion mask | 0% | 22% | 20% | 73% |
| **Unsafe-answer rate** | 100% | 80% [72–88] | **70%** [63–77] | 21% |
| Over-deferral: full image | 0% | 13% | 20% [10–32] | 65% |
| Over-deferral: random mask | 0% | 22% | 25% | 73% |
| Accuracy of accepted answerable inputs | 85% | 90% | 90% | 84% |
| Risk–coverage area (AURC, lower is better) | 0.677 | 0.642 | **0.572** | 0.614 |

![Risk–coverage](results/checker_v2/risk_coverage.png)

Risk = share of accepted inputs that are wrong or should have been abstained on. The baseline is
high (0.68) because four of the six input types are should-abstain inputs.

## 7. What it shows

- **The failure mode is robust.** With no check, the model answers 100% of should-abstain inputs.
  Shown an image from a different body area, its confidence is 0.56, the same as on the real image
  (0.54), and it still gets 47% "right" from the question wording alone.
- **The blind test points the wrong way here.** Swapped-in images raise the chosen answer more than
  real ones do (blind gain 0.31 vs 0.23). Any image seems to push the model further toward its prior.
- **The combined checker helps, modestly.** It catches 4× more cross-body-area mismatches than
  confidence, and wins the risk–coverage curve. It does worse than confidence on same-body-area
  mismatches (small n).
- **"Cannot be determined" over-abstains.** It looks good on unsafe answers only because it abstains
  on 65% of correct full-image answers too.

## 8. Limitations

- **Small sample:** 60 test questions, 16 for same-body-area mismatches. Confidence intervals are wide.
- **The threshold didn't transfer:** set for ≤10% over-deferral on calibration, it gave 20% on test.
- **Noisy masking labels:** the model is still correct on 83% of `evid` and 67% of `evid_big` inputs,
  so many "should abstain" masks are actually answerable. The mismatched-image labels are the clean ones.
- **Out-of-distribution swaps:** a fundus photo for a brain question is an easy case. Same-body-area
  swaps are the realistic one, and there are only 16.
- **One model, one prompt,** and only questions the model answered correctly on the full image.
- **Not included:** the evidence-sensitivity test (hide the lesion vs random patches). It needs the
  lesion location, which a deployed checker doesn't have, and it passed only 47% of the time on these
  119. Grounding via the model's own pointed box was dropped too: its boxes overlap the real lesion by
  a median IoU of 0.03.

## 9. Reproduce

```bash
uv tool install google-colab-cli          # once, then sign in: colab sessions
colab new -s vlm --gpu L4
colab upload -s vlm results/checker/checker_rows.csv /content/checker_rows.csv
(echo RUN_SCREEN=False; cat vitar_abstention.py vitar_checker_v2.py) | colab exec -s vlm
# ~25 min; the run happens in a background thread. Poll with:
echo 'print(V2STATE)' | colab exec -s vlm
colab download -s vlm /content/results/checker_v2/checker_v2_rows.csv results/checker_v2/checker_v2_rows.csv
colab stop -s vlm

python vitar_calibrate_v2.py results/checker_v2/checker_v2_rows.csv results/checker_v2
```
