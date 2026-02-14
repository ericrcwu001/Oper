from pathlib import Path
from dotenv import load_dotenv
# Load from CWD (when run as "flask --app app run" from backend/) and from app dir
load_dotenv()
load_dotenv(Path(__file__).resolve().parent / ".env")

from flask import Flask, request, jsonify
from scenario_generator import generate_scenario

app = Flask(__name__)


@app.get("/")
def main():
    return {"status": "ok"}


@app.post("/api/scenarios/generate")
def api_scenarios_generate():
    """Generate a dynamic scenario for the given difficulty. Body: { "difficulty": "easy"|"medium"|"hard" }."""
    body = request.get_json(silent=True) or {}
    difficulty = body.get("difficulty")
    if not difficulty or not isinstance(difficulty, str):
        return jsonify({"error": "Missing or invalid 'difficulty'. Use { \"difficulty\": \"easy\" | \"medium\" | \"hard\" }."}), 400
    difficulty = difficulty.strip().lower()
    if difficulty not in ("easy", "medium", "hard"):
        return jsonify({"error": "difficulty must be one of: easy, medium, hard"}), 400
    try:
        payload = generate_scenario(difficulty)
        return jsonify(payload)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": f"Scenario generation failed: {e!s}"}), 500