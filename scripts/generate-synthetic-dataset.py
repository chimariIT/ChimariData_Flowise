#!/usr/bin/env python3
"""
Synthetic Dataset Generator for Testing Data Requirements System

Generates realistic test datasets with:
- PII fields for sanitization testing
- Missing values for completeness testing
- Various data types for transformation testing
- Quality issues for validation testing
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import random
import os

# Seed for reproducibility
np.random.seed(42)
random.seed(42)

def generate_education_survey_data(num_rows=100):
    """
    Generate synthetic education survey data with intentional quality issues

    Tests:
    - PII detection (emails, phone numbers, student IDs)
    - Data quality scoring (missing values, duplicates)
    - Type transformations (dates, numeric ratings, categorical)
    - Required data elements mapping
    """

    print(f"Generating {num_rows} rows of education survey data...")

    # Generate student IDs (some duplicates for testing)
    student_ids = [f"STU{str(i).zfill(3)}" for i in range(1, num_rows + 1)]
    # Introduce 5% duplicates
    num_duplicates = int(num_rows * 0.05)
    for _ in range(num_duplicates):
        idx = random.randint(0, num_rows - 1)
        student_ids[idx] = student_ids[random.randint(0, num_rows - 1)]

    # Generate parent emails (10% missing for completeness testing)
    parent_emails = []
    for i in range(num_rows):
        if random.random() < 0.10:  # 10% missing
            parent_emails.append(None)
        else:
            parent_emails.append(f"parent{i+1}@example.com")

    # Generate phone numbers (15% missing)
    parent_phones = []
    for i in range(num_rows):
        if random.random() < 0.15:  # 15% missing
            parent_phones.append(None)
        else:
            parent_phones.append(f"555-{random.randint(100, 999)}-{random.randint(1000, 9999)}")

    # Generate satisfaction ratings (numeric with some nulls)
    satisfaction_ratings = []
    for _ in range(num_rows):
        if random.random() < 0.05:  # 5% missing
            satisfaction_ratings.append(None)
        else:
            satisfaction_ratings.append(round(random.uniform(3.0, 5.0), 1))

    # Generate event attendance (categorical)
    event_attended = [random.choice(['Yes', 'No']) for _ in range(num_rows)]

    # Generate grade levels (1-6)
    grade_levels = [random.randint(1, 6) for _ in range(num_rows)]

    # Generate event dates (datetime with various formats for transformation testing)
    start_date = datetime(2024, 3, 15)
    event_dates = []
    for i in range(num_rows):
        days_offset = i % 30  # Spread over 30 days
        date = start_date + timedelta(days=days_offset)
        # Mix date formats (some will need transformation)
        if i % 3 == 0:
            event_dates.append(date.strftime('%Y-%m-%d'))
        elif i % 3 == 1:
            event_dates.append(date.strftime('%m/%d/%Y'))
        else:
            event_dates.append(date.strftime('%d-%b-%Y'))

    # Generate feedback text (text data)
    feedback_templates = [
        "Great event with lots of learning opportunities",
        "Excellent organization and communication",
        "Could not attend due to schedule conflict",
        "Good event but {issue}",
        "Very informative and well-structured",
        "Event was okay but {issue}",
        "Outstanding experience for both parent and student",
        "Unable to attend but heard positive feedback",
        "Great communication from staff",
        "Event was good but could be longer",
        "Well organized and engaging activities",
        "Exceeded expectations in every way",
        "Did not attend due to {reason}",
        "Excellent event with valuable insights",
        "Good event overall with minor issues",
        "Fantastic event highly recommend"
    ]

    issues = ["parking was difficult", "too crowded", "room was too small", "timing could be better"]
    reasons = ["weather", "work", "family emergency", "schedule conflict"]

    feedback_texts = []
    for _ in range(num_rows):
        template = random.choice(feedback_templates)
        if '{issue}' in template:
            feedback_texts.append(template.format(issue=random.choice(issues)))
        elif '{reason}' in template:
            feedback_texts.append(template.format(reason=random.choice(reasons)))
        else:
            feedback_texts.append(template)

    # Generate teacher names
    first_names = ["Ms. Johnson", "Mr. Smith", "Mrs. Williams", "Dr. Brown", "Ms. Davis",
                   "Mr. Garcia", "Mrs. Martinez", "Ms. Rodriguez", "Dr. Wilson", "Mr. Anderson"]
    teacher_names = [random.choice(first_names) for _ in range(num_rows)]

    # Generate school districts (categorical with patterns for segmentation analysis)
    districts = ["District A", "District B", "District C"]
    school_districts = [random.choice(districts) for _ in range(num_rows)]

    # Create DataFrame
    df = pd.DataFrame({
        'student_id': student_ids,
        'parent_email': parent_emails,
        'parent_phone': parent_phones,
        'satisfaction_rating': satisfaction_ratings,
        'event_attended': event_attended,
        'grade_level': grade_levels,
        'event_date': event_dates,
        'feedback_text': feedback_texts,
        'teacher_name': teacher_names,
        'school_district': school_districts
    })

    return df

def generate_customer_analytics_data(num_rows=200):
    """
    Generate synthetic customer analytics data for testing transformations

    Tests:
    - Numeric transformations (revenue, costs)
    - Date transformations (purchase dates, cohorts)
    - Categorical encoding (customer segments, regions)
    - Derived fields (profit, lifetime value)
    """

    print(f"Generating {num_rows} rows of customer analytics data...")

    # Generate customer IDs
    customer_ids = [f"CUST{str(i).zfill(4)}" for i in range(1, num_rows + 1)]

    # Generate customer segments
    segments = ['Enterprise', 'SMB', 'Individual']
    customer_segments = [random.choice(segments) for _ in range(num_rows)]

    # Generate regions
    regions = ['North America', 'Europe', 'Asia Pacific', 'Latin America']
    customer_regions = [random.choice(regions) for _ in range(num_rows)]

    # Generate purchase dates (datetime)
    start_date = datetime(2023, 1, 1)
    purchase_dates = []
    for _ in range(num_rows):
        days_offset = random.randint(0, 730)  # 2 years
        purchase_dates.append((start_date + timedelta(days=days_offset)).strftime('%Y-%m-%d'))

    # Generate revenue (numeric with some nulls)
    revenues = []
    for segment in customer_segments:
        if random.random() < 0.03:  # 3% missing
            revenues.append(None)
        else:
            if segment == 'Enterprise':
                revenues.append(round(random.uniform(50000, 500000), 2))
            elif segment == 'SMB':
                revenues.append(round(random.uniform(5000, 50000), 2))
            else:
                revenues.append(round(random.uniform(100, 5000), 2))

    # Generate costs (numeric, derived from revenue)
    costs = []
    for rev in revenues:
        if rev is None:
            costs.append(None)
        else:
            cost_ratio = random.uniform(0.4, 0.7)
            costs.append(round(rev * cost_ratio, 2))

    # Generate customer emails (with missing values)
    emails = []
    for i in range(num_rows):
        if random.random() < 0.08:  # 8% missing
            emails.append(None)
        else:
            domain = random.choice(['example.com', 'business.com', 'company.net', 'enterprise.io'])
            emails.append(f"customer{i+1}@{domain}")

    # Generate conversion status
    converted = [random.choice(['Yes', 'No']) for _ in range(num_rows)]

    # Generate account tier (categorical)
    tiers = ['Free', 'Basic', 'Pro', 'Enterprise']
    account_tiers = [random.choice(tiers) for _ in range(num_rows)]

    # Create DataFrame
    df = pd.DataFrame({
        'customer_id': customer_ids,
        'customer_segment': customer_segments,
        'customer_region': customer_regions,
        'purchase_date': purchase_dates,
        'revenue': revenues,
        'cost': costs,
        'customer_email': emails,
        'converted': converted,
        'account_tier': account_tiers
    })

    return df

def calculate_quality_metrics(df):
    """Calculate data quality metrics for the generated dataset"""

    total_rows = len(df)
    total_cols = len(df.columns)

    # Completeness: percentage of non-null values
    completeness = (df.notna().sum().sum() / (total_rows * total_cols)) * 100

    # Duplicates
    duplicate_rows = df.duplicated().sum()

    # Consistency: check if data types are consistent
    type_consistency = sum([df[col].dtype != 'object' or df[col].notna().all() for col in df.columns]) / total_cols

    metrics = {
        'total_rows': total_rows,
        'total_columns': total_cols,
        'completeness': round(completeness, 2),
        'duplicate_rows': duplicate_rows,
        'type_consistency': round(type_consistency * 100, 2)
    }

    return metrics

def save_dataset(df, filename, output_dir='test-data'):
    """Save dataset to CSV file"""

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    filepath = os.path.join(output_dir, filename)
    df.to_csv(filepath, index=False)

    print(f"✅ Saved dataset to: {filepath}")

    # Calculate and display quality metrics
    metrics = calculate_quality_metrics(df)
    print(f"\n📊 Dataset Quality Metrics:")
    print(f"   Total Rows: {metrics['total_rows']}")
    print(f"   Total Columns: {metrics['total_columns']}")
    print(f"   Completeness: {metrics['completeness']}%")
    print(f"   Duplicate Rows: {metrics['duplicate_rows']}")
    print(f"   Type Consistency: {metrics['type_consistency']}%")

    return filepath, metrics

def main():
    """Generate all synthetic datasets"""

    print("=" * 60)
    print("Synthetic Dataset Generator")
    print("Testing: Data Requirements System & Transformations")
    print("=" * 60)
    print()

    # Generate education survey dataset
    print("[1/2] Education Survey Dataset")
    print("-" * 60)
    education_df = generate_education_survey_data(num_rows=100)
    edu_path, edu_metrics = save_dataset(education_df, 'synthetic-education-survey.csv')
    print()

    # Generate customer analytics dataset
    print("[2/2] Customer Analytics Dataset")
    print("-" * 60)
    customer_df = generate_customer_analytics_data(num_rows=200)
    cust_path, cust_metrics = save_dataset(customer_df, 'synthetic-customer-analytics.csv')
    print()

    print("=" * 60)
    print("✅ All synthetic datasets generated successfully!")
    print("=" * 60)
    print()
    print("📁 Output files:")
    print(f"   - {edu_path}")
    print(f"   - {cust_path}")
    print()
    print("🧪 Next steps:")
    print("   1. Upload datasets to test PII detection")
    print("   2. Test data quality scoring consistency")
    print("   3. Test required data elements mapping")
    print("   4. Test transformation validation")
    print("   5. Verify end-to-end user journey flow")

if __name__ == '__main__':
    main()
