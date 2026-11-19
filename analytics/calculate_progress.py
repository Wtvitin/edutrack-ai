"""Task completion metrics over an already authorized EduTrack snapshot."""
import json
import sys


def calculate_progress(tasks):
    if not isinstance(tasks, list) or any(not isinstance(task, dict) for task in tasks):
        raise ValueError("tasks must be a list of objects")
    active = [task for task in tasks if task.get("status") != "CANCELLED"]
    completed = sum(task.get("done") is True or task.get("status") == "COMPLETED" for task in active)
    total = len(active)
    return {"completed": completed, "total": total, "percentage": round(completed / total * 100, 2) if total else 0.0}


if __name__ == "__main__":
    try:
        payload = json.load(sys.stdin)
        print(json.dumps(calculate_progress(payload["tasks"]), ensure_ascii=False))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
