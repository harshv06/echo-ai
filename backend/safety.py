import logging
import re
from typing import Dict


logger = logging.getLogger("safety")

UNSAFE_PATTERNS = [
    r"\bdiagnos(e|is)\b",
    r"\btherapy\b",
    r"\bmedical\b",
    r"\bdepression\b",
    r"\bsex\b",
    r"\bsexual\b",
    r"\bexplicit\b",
    r"\bnude\b",
    r"\bcaress\b",
    r"\bgrab\b",
    r"\bgrope\b",
    r"\bbed\b",
    r"\bkiss\b",
    r"\btouch\b",
    r"\bpolitic(s|al)\b",
    r"\breligion\b",
]


def filter_suggestion(text: str, context: Dict) -> str:
    if not text:
        return ""

    cleaned = re.sub(r"\s+", " ", text).strip()
    if len(cleaned.split()) > 120:
        cleaned = " ".join(cleaned.split()[:120])

    lowered = cleaned.lower()
    for pattern in UNSAFE_PATTERNS:
        if re.search(pattern, lowered):
            logger.info("Suggestion blocked by safety pattern=%s", pattern)
            return ""

    if any(phrase in lowered for phrase in ["you should", "you must", "you need to"]):
        cleaned = re.sub(r"\b(you should|you must|you need to)\b", "you could", cleaned, flags=re.I)

    return cleaned
