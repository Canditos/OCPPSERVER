import os
import re

FRONTEND_SRC = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "src"))

def scan_files():
    anomalies = []
    total_files = 0
    for root, dirs, files in os.walk(FRONTEND_SRC):
        for file in files:
            if file.endswith((".tsx", ".ts")):
                total_files += 1
                filepath = os.path.join(root, file)
                relpath = os.path.relpath(filepath, FRONTEND_SRC)
                with open(filepath, "r", encoding="utf-8") as f:
                    lines = f.readlines()
                for idx, line in enumerate(lines, 1):
                    # Check for bg-white without dark:bg
                    if "bg-white " in line and "dark:bg-" not in line and "text-white" not in line:
                        # Ignore if it's in a modal backdrop or tooltip
                        if "backdrop" not in line and "tooltip" not in line:
                            anomalies.append((relpath, idx, "bg-white without dark:bg", line.strip()))
    return total_files, anomalies

total_files, anomalies = scan_files()
print(f"Scanned {total_files} frontend files.")
if anomalies:
    print(f"Found {len(anomalies)} potential contrast notices:")
    for a in anomalies[:10]:
        print(f"  {a[0]}:{a[1]} -> {a[2]}: {a[3][:80]}")
else:
    print("Zero contrast anomalies found!")
