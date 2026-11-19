"""Name OR overdue search. The caller must authorize the complete snapshot first."""
import json
import sys
import unicodedata
from datetime import date


def normalized(value):
    return "".join(char for char in unicodedata.normalize("NFKD", value.casefold()) if not unicodedata.combining(char)).strip()


def search_subjects(payload):
    today = date.fromisoformat(payload["today"])
    query = normalized(payload.get("query", ""))
    overdue_only = payload.get("overdue", False)
    if not isinstance(overdue_only, bool):
        raise ValueError("overdue must be a boolean")
    subjects, tasks = payload["data"]["subjects"], payload["data"]["tasks"]
    overdue_ids = set()
    for task in tasks:
        if task.get("done") or task.get("status") in ("COMPLETED", "CANCELLED") or not task.get("due"):
            continue
        if date.fromisoformat(task["due"]) < today:
            overdue_ids.add(task["subjectId"])
    matches = []
    for subject in subjects:
        name = normalized(subject["name"])
        name_match = bool(query) and query in name
        late_match = overdue_only and subject["id"] in overdue_ids
        if name_match or late_match or (not query and not overdue_only):
            rank = 3 if query and name == query else 2 if query and name.startswith(query) else 1 if name_match else 0
            matches.append((rank, name, {**subject, "hasOverdueTasks": subject["id"] in overdue_ids, "matchedBy": [key for key, matched in (("name", name_match), ("overdue", late_match)) if matched]}))
    return {"items": [item for _, _, item in sorted(matches, key=lambda row: (-row[0], row[1], row[2]["id"]))]}


if __name__ == "__main__":
    try:
        print(json.dumps(search_subjects(json.load(sys.stdin)), ensure_ascii=False))
    except (ValueError, KeyError, TypeError, AttributeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
