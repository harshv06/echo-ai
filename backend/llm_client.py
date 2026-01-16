import os
from typing import Any, Dict

import httpx


PROMPT_TEMPLATE = """You are a real-time dating coach helping a guy during his date. You're NOT talking to the girl - you're whispering advice to HIM.

Your role: Give him ONE quick suggestion for what HE should say or do next.

Context: He's on a date talking with a girl. When he gets stuck, loses momentum, or needs a smooth transition, you jump in with a suggestion.

Generate ONE short suggestion in this format:
- Start with "Say:" or "Ask:" or "Try:" 
- Max 15 words
- Match the vibe: {language} style
- Based on conversation flow, lean into: playful/flirty, romantic, funny, or confident

Rules:
✓ Give HIM words to say to HER
✓ Keep it natural, spoken, casual
✓ Match detected mood and language style
✓ Avoid repeating recent topics from transcript
✓ If flirting feels right, make it playful and bold
✓ Build on what's already been discussed when possible

✗ Don't talk AS IF you're the girl
✗ Don't give generic advice like "be yourself"
✗ Don't lecture or explain
✗ No sensitive/heavy topics

Recent Flow:
{last_3_lines}

Full Transcript:
{transcript}

Signals:
Language: {language}
Conversation Health: {conversation_health}
Confidence: {confidence_score}

Your suggestion for what he should say/ask next:"""


async def generate_suggestion(context: Dict[str, Any]) -> str:
    api_url = os.getenv("LLM_API_URL", "").strip()
    api_key = os.getenv("LLM_API_KEY", "").strip()
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    print(f"DEBUG: Using LLM_API_URL: {api_url}")
    print(f"DEBUG: Using LLM_MODEL: {model}")
    print(f"DEBUG: API Key present: {bool(api_key)}")

    if not api_url or not api_key:
        print("ERROR: Missing API URL or Key")
        return ""

    prompt = PROMPT_TEMPLATE.format(
        language=context.get("detected_language", "english"),
        conversation_health=context.get("conversation_health"),
        confidence_score=context.get("confidence_score"),
        transcript=context.get("transcript", ""),
        last_3_lines=context.get("last_3_lines", ""),
    )

    print("DEBUG: --- PROMPT START ---")
    print(prompt)
    print("DEBUG: --- PROMPT END ---")

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are my date buddy , you have to help me while I am on a date with a girl , i want her to be more interested in me and i want to make her feel special and important"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 20,
    }

    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            print("DEBUG: Sending request to LLM...")
            response = await client.post(api_url, json=payload, headers=headers)
            print(f"DEBUG: Response Status: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            print("DEBUG: Request successful",data)
    except Exception as e:
        print(f"ERROR: LLM Request failed: {e}")
        return ""

    return _extract_message(data)


def _extract_message(data: Dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content") or ""
    return content.strip()
