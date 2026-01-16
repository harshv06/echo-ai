import os
from typing import Any, Dict

import httpx


PROMPT_TEMPLATE = """You are a real-time dating coach helping a guy during his date. You're NOT talking to the girl - you're whispering advice to HIM.

Your role: Give him ONE quick suggestion for what HE should say or do next.

Context: He's on a date talking with a girl. When he gets stuck, loses momentum, or needs a smooth transition, you jump in with a suggestion.

Generate ONE short suggestion in this format:
- Max 15 words
- Match the vibe: {language} style
- Based on conversation flow, lean into: playful/flirty, romantic, funny, or confident
- If you think i said something wrong , explicitly tell me to apologise with reason - important
- Dont always pick the same topics about generic stuff like weather and all , pick a random topic to make it more interesting and witty , sometimes its okay but not all times 

Rules:
✓ Give HIM words to say to HER
 Keep it natural, spoken, casual
 Match detected mood and language style
 Avoid repeating recent topics from transcript
If flirting feels right, make it playful and bold
Build on what's already been discussed when possible
Important : dont always ask questions , if the last message tells you to talk about user ( the person using this llm) , take users profile into account and answer accordingly by the user profile or the context 
Most Important : if i say something inappropriate , make sure to tell me to apologise for example : if she is from mumbai and i joked about something thats a taboo in mumbai or something bad like that other person would not like to hear like you people have bad taste etc  make sure to tell me to apologise
✗ Don't talk AS IF you're the girl
 Don't give generic advice like "be yourself"
 Don't lecture or explain
 No sensitive/heavy topics

CRITICAL - SPEAKER DETECTION:
The transcript comes from a single microphone and is NOT labeled by speaker. It appears as a continuous stream of text.
• You must INFER who is speaking based on the context of a "Guy on a Date with a Girl".
• If a line says "I love your beard", it's the Girl.
• If a line says "You look beautiful tonight", it's likely the Guy.
• Assume the conversation switches back and forth.
• Your job is to help the GUY.
IMPORTANT : always assume anything even remotely offensive is said by the guy and then ask him to apologise immediately with reason 

Recent Flow:
{last_3_lines}

Full Transcript:
{transcript}

User Profile:
{user_context}

Date Profile:
{date_context}

Signals:
Language: {language}
Conversation Health: {conversation_health}
Confidence: {confidence_score}

Your suggestion for what he should say/ask next:"""


BOUNDARY_PROMPT_TEMPLATE = """You are a sophisticated Relationship Expert and Dating Coach.
Analyze the following profiles for a FIRST DATE context.

User Profile (The Guy):
{user_context}

Date Profile (The Girl):
{date_context}

Task:
1. Identify 2-3 "Red Flags" or "Boundaries" - things he should ABSOLUTELY AVOID saying or doing based on her profile (e.g., if she loves animals, don't joke about hunting).
2. Identify 2-3 "Green Flags" or "Topics" - things he SHOULD mention to build rapport.

Output Format (Keep it concise, bullet points):
🚩 **BOUNDARIES (AVOID):**
- [Point 1]
- [Point 2]

✅ **GREEN FLAGS (DO):**
- [Point 1]
- [Point 2]
"""


async def generate_boundaries(user_context: str, date_context: str) -> str:
    if not user_context and not date_context:
        return "Please enter both profiles to get an analysis."

    api_url = os.getenv("LLM_API_URL", "").strip()
    api_key = os.getenv("LLM_API_KEY", "").strip()
    model = os.getenv("LLM_MODEL", "gpt-4o-mini")

    if not api_url or not api_key:
        return "Error: LLM API not configured."

    prompt = BOUNDARY_PROMPT_TEMPLATE.format(
        user_context=user_context or "Not provided",
        date_context=date_context or "Not provided",
    )

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "You are a helpful dating coach."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.7,
        "max_tokens": 300,
    }

    headers = {"Authorization": f"Bearer {api_key}"}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(api_url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            return _extract_message(data)
    except Exception as e:
        print(f"ERROR: Boundary analysis failed: {e}")
        return "Failed to analyze boundaries. Please try again."


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
        user_context=context.get("user_context", ""),
        date_context=context.get("date_context", ""),
        boundary_guidelines=context.get("boundary_guidelines", ""),
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
