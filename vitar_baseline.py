# Step 2 of the ViTAR-16K baseline: full-image accuracy on the 20-example subset.
# Reuses `model`, `processor`, `subset` from vitar_setup.py (still in the kernel).
import re

import torch

# Same structure as the GQA notebook's prompt, but the GQA keyword few-shots are replaced
# with an instruction to answer with the option letter, since ViTAR answers are letters.
INSTRUCTION = (
    "Answer the multiple-choice question with only the letter of the correct option. "
    "Do not explain.\n\n"
)


def make_inputs(processor, question, image=None):
    """Chat-formatted prompt ending right where the assistant's answer begins."""
    content = [{"type": "text", "text": INSTRUCTION + f"Q: {question}\nA:"}]
    if image is not None:
        content = [{"type": "image"}] + content
    messages = [{"role": "user", "content": content}]
    prompt = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    if image is not None:
        return processor(text=[prompt], images=[image], return_tensors="pt")
    return processor(text=[prompt], return_tensors="pt")


@torch.no_grad()
def generate_answer(model, processor, question, image=None, max_new_tokens=8):
    """Greedy decoding, identical to the notebook's generate_answer."""
    inputs = make_inputs(processor, question, image).to(model.device)
    out = model.generate(
        **inputs, max_new_tokens=max_new_tokens, do_sample=False,
        temperature=None, top_p=None, top_k=None,
    )
    new_tokens = out[0, inputs["input_ids"].shape[1]:]
    return processor.tokenizer.decode(new_tokens, skip_special_tokens=True).strip()


def parse_letter(text):
    """First standalone option letter A-D in the model's output, or None."""
    m = re.search(r"\b([A-D])\b", text.upper())
    return m.group(1) if m else None


correct = 0
for i, ex in enumerate(subset):
    raw = generate_answer(model, processor, ex["question"], ex["image"].convert("RGB"))
    pred, gt = parse_letter(raw), ex["answer"].strip().upper()
    correct += pred == gt
    print(f"[{i:2d}] gt={gt} pred={pred} raw={raw!r:10s} {'OK ' if pred == gt else 'XX '} {ex['question'][:80]}")

print(f"\nFull-image accuracy: {correct}/{len(subset)} = {correct / len(subset):.0%}")
