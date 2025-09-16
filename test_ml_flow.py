#!/usr/bin/env python3
"""Test the complete ML flow"""

import pandas as pd
import json
import os
import sys

# Create test data
df = pd.DataFrame({
    'ROI': [0.1, 0.2, 0.15, 0.25, 0.3, 0.18, 0.22, 0.16, 0.28, 0.35],
    'Conversion_Rate': [0.05, 0.08, 0.06, 0.09, 0.12, 0.07, 0.085, 0.065, 0.11, 0.13],
    'Acquisition_Cost': [100, 80, 90, 70, 60, 85, 75, 95, 65, 55],
    'Engagement_Score': [7, 8, 6, 9, 10, 7.5, 8.5, 6.5, 9.5, 10.5]
})

# Create directories
os.makedirs('uploads', exist_ok=True)
os.makedirs('python_data', exist_ok=True)

# Save test data to both locations
df.to_csv('uploads/test_project.csv', index=False)
df.to_csv('python_data/test_project.csv', index=False)

# Create input and config files
input_data = {'projectId': 'test_project'}
config = {
    'analysisType': 'machine_learning',
    'targetVariable': 'ROI',
    'features': ['Conversion_Rate', 'Acquisition_Cost', 'Engagement_Score'],
    'algorithm': 'random_forest',
    'testSize': 0.3,
    'crossValidation': 3
}

# Write test files
with open('python_data/test_input.json', 'w') as f:
    json.dump(input_data, f)

with open('python_data/test_config.json', 'w') as f:
    json.dump(config, f)

# Run the analysis
os.chdir('python_scripts')
result = os.system('python3 data_analyzer.py ../python_data/test_input.json ../python_data/test_config.json ../python_data/test_output.json')

# Check results
if result == 0:
    with open('../python_data/test_output.json', 'r') as f:
        output = json.load(f)
    print("ML Analysis succeeded!")
    print(json.dumps(output, indent=2))
else:
    print("ML Analysis failed!")
    if os.path.exists('../python_data/test_output.json'):
        with open('../python_data/test_output.json', 'r') as f:
            output = json.load(f)
        print(json.dumps(output, indent=2))