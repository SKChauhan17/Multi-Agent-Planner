import json
from agents.planner import generate_plan
from agents.reviewer import review_plan
from dotenv import load_dotenv
import os

load_dotenv()

def test_agents():
    goal = "Build a simple landing page for a coffee shop."
    print(f"Goal: {goal}")
    
    # Step 1: Planner
    raw_planner_json = generate_plan(goal)
    print("\n--- RAW PLANNER OUTPUT ---")
    print(raw_planner_json)
    
    # Step 2: Reviewer
    reviewed_dict = review_plan(goal, raw_planner_json)
    print("\n--- RAW REVIEWER JSON (Parsed) ---")
    print(json.dumps(reviewed_dict, indent=2))

if __name__ == "__main__":
    test_agents()
