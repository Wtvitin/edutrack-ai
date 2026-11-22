"""Coursework CLI entrypoint; reuse the application's analytics implementation."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analytics"))
from calculate_progress import calculate_progress  # noqa: E402

if __name__ == "__main__":
    try:
        print(json.dumps(calculate_progress(json.load(sys.stdin)["tasks"])))
    except (ValueError, KeyError, TypeError) as error:
        print(json.dumps({"error": str(error)}), file=sys.stderr)
        sys.exit(1)
