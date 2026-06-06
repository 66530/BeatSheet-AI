"""
AI-NUSS 3.0 — Narrative Quantitative Evaluation Metrics
Chapter 7: Automated evaluation framework for scene detection and character consistency.

All metrics are pure functions — NO IO, NO DB, NO LLM.
"""
from typing import List, Dict, Any, Set
import math


# ═══════════════════════════════════════════════════════════════════════
# F1 Score for Scene Breakpoint Detection
# ═══════════════════════════════════════════════════════════════════════

def calculate_f1(
    predicted: List[int],
    gold_standard: List[int],
    tolerance: int = 2,
) -> float:
    """
    Calculate F1 score for scene boundary detection.

    A predicted boundary matches a gold boundary if they are within
    `tolerance` lines of each other.

    Args:
        predicted: List of line numbers where AI predicted scene breaks.
        gold_standard: List of ground-truth line numbers from human annotation.
        tolerance: Maximum line distance to count as a match.

    Returns:
        F1 score as a float in [0, 1].
    """
    if not gold_standard:
        return 1.0 if not predicted else 0.0

    matched_pred = set()
    matched_gold = set()

    for pi, p in enumerate(predicted):
        for gi, g in enumerate(gold_standard):
            if gi in matched_gold:
                continue
            if abs(p - g) <= tolerance:
                matched_pred.add(pi)
                matched_gold.add(gi)
                break

    tp = len(matched_pred)
    fp = len(predicted) - tp
    fn = len(gold_standard) - len(matched_gold)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0

    if precision + recall == 0:
        return 0.0

    f1 = 2 * (precision * recall) / (precision + recall)
    return round(f1, 4)


# ═══════════════════════════════════════════════════════════════════════
# Character Consistency Metrics
# ═══════════════════════════════════════════════════════════════════════

def check_entity_map_accuracy(
    predicted_map: Dict[str, str],
    gold_map: Dict[str, str],
) -> Dict[str, Any]:
    """
    Compare predicted entity_map against gold standard.

    Returns:
        Dict with accuracy, errors, and per-alias breakdown.
    """
    total = len(gold_map)
    correct = 0
    errors = []

    for alias, gold_id in gold_map.items():
        pred_id = predicted_map.get(alias)
        if pred_id == gold_id:
            correct += 1
        else:
            errors.append({
                "alias": alias,
                "expected": gold_id,
                "predicted": pred_id or "MISSING",
            })

    # Also check for false positives (aliases predicted but not in gold)
    for alias, pred_id in predicted_map.items():
        if alias not in gold_map:
            errors.append({
                "alias": alias,
                "expected": "NOT_IN_GOLD",
                "predicted": pred_id,
            })

    accuracy = correct / total if total > 0 else 0.0

    return {
        "accuracy": round(accuracy, 4),
        "total_aliases": total,
        "correct": correct,
        "errors": errors,
        "error_count": len(errors),
    }


def calculate_character_leakage(
    character_constraints: List[Dict[str, Any]],
    generated_elements: List[Dict[str, Any]],
) -> int:
    """
    Count how many generated elements violate character taboos/constraints.
    Chapter 7: Character consistency leakage detection.

    Args:
        character_constraints: List of character profiles with 'taboos' field.
        generated_elements: List of screenplay elements with 'character_id' and 'content'.

    Returns:
        Number of violating elements (0 = perfect consistency).
    """
    # Build constraint lookup
    constraints_by_id: Dict[str, Dict] = {}
    for char in character_constraints:
        cid = char.get("character_id", "")
        taboos = char.get("constraints", {}).get("taboos", [])
        constraints_by_id[cid] = {
            "taboos": [t.lower() for t in taboos],
        }

    leakage_count = 0

    for element in generated_elements:
        char_id = element.get("character_id", "")
        content = element.get("content", "").lower()

        if char_id in constraints_by_id:
            for taboo in constraints_by_id[char_id]["taboos"]:
                if taboo in content:
                    leakage_count += 1
                    break

    return leakage_count


# ═══════════════════════════════════════════════════════════════════════
# Beat Causality Chain Validation
# ═══════════════════════════════════════════════════════════════════════

def validate_beat_causality(
    beats: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Validate that all beats have complete causality chains.

    Returns:
        Dict with completeness score and list of invalid beats.
    """
    total = len(beats)
    complete = 0
    invalid_beats = []

    for beat in beats:
        chain = beat.get("causality_chain", {})
        has_trigger = bool(chain.get("trigger"))
        has_action = bool(chain.get("action"))
        has_consequence = bool(chain.get("consequence"))

        if has_trigger and has_action and has_consequence:
            complete += 1
        else:
            invalid_beats.append({
                "beat_id": beat.get("beat_id", "UNKNOWN"),
                "missing": [
                    field for field, has in
                    [("trigger", has_trigger), ("action", has_action), ("consequence", has_consequence)]
                    if not has
                ],
            })

    completeness = complete / total if total > 0 else 0.0

    return {
        "completeness": round(completeness, 4),
        "total_beats": total,
        "complete_beats": complete,
        "invalid_beats": invalid_beats,
    }


# ═══════════════════════════════════════════════════════════════════════
# N-gram Overlap for Beat Content Similarity
# ═══════════════════════════════════════════════════════════════════════

def calculate_rouge_l(
    predicted_text: str,
    reference_text: str,
) -> float:
    """
    Calculate ROUGE-L (Longest Common Subsequence) F1 score.
    Used to measure beat summary quality against gold standard.

    Args:
        predicted_text: AI-generated beat summary.
        reference_text: Human-annotated gold standard summary.

    Returns:
        ROUGE-L F1 score in [0, 1].
    """
    if not reference_text:
        return 0.0

    pred_chars = list(predicted_text)
    ref_chars = list(reference_text)

    lcs_len = _lcs_length(pred_chars, ref_chars)

    precision = lcs_len / len(pred_chars) if pred_chars else 0.0
    recall = lcs_len / len(ref_chars) if ref_chars else 0.0

    if precision + recall == 0:
        return 0.0

    return round(2 * precision * recall / (precision + recall), 4)


def _lcs_length(a: list, b: list) -> int:
    """Compute length of longest common subsequence via DP."""
    m, n = len(a), len(b)
    if m == 0 or n == 0:
        return 0

    # Use 2-row DP for memory efficiency
    prev = [0] * (n + 1)
    curr = [0] * (n + 1)

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                curr[j] = prev[j - 1] + 1
            else:
                curr[j] = max(prev[j], curr[j - 1])
        prev, curr = curr, prev

    return prev[n]
