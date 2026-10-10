#!/usr/bin/env python3
"""Create/configure the Aangan agent on Vaani Research via its public API.
Usage: python3 scripts/vaani-setup.py            (reads VAANI_API_KEY from .env.local)
Idempotent: re-running updates the existing 'Aangan Studio' agent instead of creating a second one.
The webhook URL and the phone number can't be set by API (dashboard only) — see README."""
import json, os, re, sys, urllib.request, urllib.error

BASE = "https://api.vaanivoice.ai"
env = dict(l.strip().split("=", 1) for l in open(".env.local") if "=" in l and not l.startswith("#"))
KEY = os.environ.get("VAANI_API_KEY") or env["VAANI_API_KEY"]
NAME = "Aangan Studio"

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"X-API-Key": KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")

prompt_md = open("prompts/vaani_agent_prompt.md").read()
system_prompt = prompt_md.split("\n---\n", 1)[1].strip()   # everything below the setup preamble

persona = {
    "identity": {
        "system_prompt": system_prompt,
        "greeting_message": {
            "agent_message": "Namaste, Aangan Studio. Thanks for calling. How can I help you today?",
            "interruptible": True,
            "let_user_speak_first": False,
        },
    },
    "senses_capabilities": {"language": "en", "auto_detect": True},
}
experience = {
    "conversational_experience": {"eagerness_to_speak": "balanced"},
    "settings": {
        "idle_conversation_settings": {
            "pulse_check": True, "end_conversation_on_idle": True, "idle_call_warning_timeout": 10, "idle_call_hangup_timeout": 25,
            "idle_call_warning_message": "Are you still there?",
            "idle_call_hangup_message": "It seems we got disconnected. Please call us back any time. Goodbye.",
        },
        "call_settings": {"max_call_duration": 15, "max_duration_enabled": True},
    },
}
def dp(name, prompt, nullable=True): return {"name": name, "prompt": prompt, "values": [], "nullable": nullable}
analysis = {
    "extraction": {"data_collection": {"enabled": True, "data_points": [
        dp("name", "The caller's name, if given."),
        dp("locality", "The Pune/PCMC locality of the property or office (e.g. Kothrud, Baner, Wakad)."),
        dp("property_type", "apartment, villa, independent house, office, clinic, restaurant, retail, gym or other."),
        dp("bhk", "Number of bedrooms (BHK) as a number, for homes."),
        dp("carpet_sqft", "Carpet area in square feet, as a number."),
        dp("rooms_in_scope", "Which rooms or areas the caller wants designed."),
        dp("current_state", "Is the property lived-in, empty, under construction or awaiting possession?"),
        dp("timeline", "When the caller needs the project complete, in their own words."),
        dp("decision_maker", "Is the caller the owner/decision-maker, or calling for someone else? Who else decides?"),
        dp("budget_volunteered", "A budget figure ONLY if the caller said one unprompted. Otherwise null."),
        dp("referral_source", "How the caller heard about the studio; name any referrer."),
        dp("asked_price", "Did the caller ask about price or cost? yes or no."),
        dp("preferred_slot", "Preferred days/times for a consultation."),
        dp("existing_client", "Does the caller already have a project with Aangan (complaint or chase)? yes or no."),
    ]}, "collect_concerns": {"enabled": False}},
    "evaluations": {"dispositions": {"enabled": False, "prompt_based": [], "system_based": []}},
}

# find or create
st, agents = call("GET", "/api/agents")
if st != 200: sys.exit(f"list agents failed: {st} {agents}")
existing = [a for a in (agents if isinstance(agents, list) else agents.get("data", [])) if a.get("display_name") == NAME or a.get("agent_name") == NAME]
if existing:
    agent_id = existing[0]["id"]; print("Updating existing agent", agent_id)
else:
    st, res = call("POST", "/api/create-agent", {"agent_display_name": NAME, "config": {"persona": persona}})
    if st != 200 or not res.get("agent_id"): sys.exit(f"create failed: {st} {str(res)[:400]}")
    agent_id = res["agent_id"]; print("Created agent", agent_id)

for section, body in (("persona", persona), ("experience", experience), ("analysis", analysis)):
    st, res = call("PATCH", f"/api/agent/{agent_id}/{section}", body)
    print(f"PATCH {section}: HTTP {st}", "" if st == 200 else json.dumps(res)[:300])

# persist the agent id for the app (not a secret)
txt = open(".env.local").read()
txt = re.sub(r"^VAANI_AGENT_ID=.*\n?", "", txt, flags=re.M)
open(".env.local", "w").write(txt.rstrip("\n") + f"\nVAANI_AGENT_ID={agent_id}\n")
print("Saved VAANI_AGENT_ID to .env.local")
