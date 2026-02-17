#!/usr/bin/env python3
"""
Survey Data Preprocessor
Detects survey-type datasets and preprocesses them for analysis:
- Identifies question-as-column-name patterns
- Extracts topic labels from long question text
- Detects and encodes Likert-scale responses
- Identifies metadata vs question columns

Two modes:
  - detect: Analyze structure and return recommendations
  - transform: Apply transformations (rename, encode) and return data
"""

import json
import sys
import re
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')


# Common Likert scale patterns
LIKERT_5_PATTERNS = {
    'strongly agree': 5, 'agree': 4, 'neutral': 3, 'disagree': 2, 'strongly disagree': 1,
    'very satisfied': 5, 'satisfied': 4, 'neither satisfied nor dissatisfied': 3, 'dissatisfied': 2, 'very dissatisfied': 1,
    'excellent': 5, 'good': 4, 'average': 3, 'fair': 3, 'below average': 2, 'poor': 1,
    'always': 5, 'often': 4, 'sometimes': 3, 'rarely': 2, 'never': 1,
    'very comfortable': 5, 'comfortable': 4, 'somewhat comfortable': 3, 'uncomfortable': 2, 'very uncomfortable': 1,
    'very important': 4, 'important': 3, 'somewhat important': 2, 'not important': 1,
    'very likely': 5, 'likely': 4, 'undecided': 3, 'unlikely': 2, 'very unlikely': 1,
    'yes': 1, 'no': 0, 'maybe': 0.5,
}

LIKERT_4_PATTERNS = {
    'strongly agree': 4, 'agree': 3, 'disagree': 2, 'strongly disagree': 1,
    '1': 1, '2': 2, '3': 3, '4': 4,
}

# Common survey question prefixes to strip for topic extraction
QUESTION_PREFIXES = [
    r'^[\d]+[\.\)]\s*',
    r'^[a-zA-Z][\.\)]\s*',
    r'^(please\s+)?(rank|rate|describe|tell|select|choose|indicate|explain|how|what|which|to what extent|how much|how well|how comfortable|how do you|how would you|if you|are there|is there|do you|would you|should we|we proved)\s+',
    r'^(how\s+)?(comfortable|satisfied|happy|likely|important|often|well|much)\s+(do you feel|are you|is it|would you)\s+(with|about|that|when|if|regarding)\s+',
    r'^(put a \d+ by the most important.*?)\s*\[',
    r'^(rank which milestone.*?)\s*\[',
]


def detect_survey_structure(config):
    """Detect whether a dataset has survey-like structure"""
    try:
        data_path = config['data_path']
        data = pd.read_json(data_path)

        columns = list(data.columns)
        n_cols = len(columns)
        n_rows = len(data)

        question_columns = []
        metadata_columns = []
        grouping_columns = []

        for col in columns:
            col_str = str(col)
            col_analysis = _analyze_column(data, col, col_str)

            if col_analysis['is_question']:
                question_columns.append(col_analysis)
            elif col_analysis['is_metadata']:
                metadata_columns.append({
                    'original_name': col_str,
                    'detected_type': col_analysis['metadata_type'],
                    'n_unique': int(data[col].nunique()),
                })
                if col_analysis['is_grouping']:
                    grouping_columns.append(col_str)

        # Confidence: ratio of question columns to total columns
        question_ratio = len(question_columns) / n_cols if n_cols > 0 else 0
        confidence = min(0.99, question_ratio * 1.3 + (0.2 if len(question_columns) >= 5 else 0))

        is_survey = len(question_columns) >= 3 and question_ratio > 0.3

        # Build recommended transformations
        recommended = []
        if is_survey:
            has_likert = any(q.get('response_type', '').startswith('likert') for q in question_columns)
            has_long_names = any(len(q['original_name']) > 40 for q in question_columns)

            if has_long_names:
                recommended.append({
                    'type': 'rename_to_topics',
                    'description': 'Rename question columns to short topic labels for readability',
                    'priority': 'high',
                    'affected_columns': len([q for q in question_columns if len(q['original_name']) > 40]),
                })
            if has_likert:
                recommended.append({
                    'type': 'encode_likert',
                    'description': 'Convert Likert text responses (Agree/Disagree) to numeric values (1-5)',
                    'priority': 'high',
                    'affected_columns': len([q for q in question_columns if q.get('response_type', '').startswith('likert')]),
                })
            if len(question_columns) > 10:
                recommended.append({
                    'type': 'create_topic_groups',
                    'description': 'Group related questions by topic for structured analysis',
                    'priority': 'medium',
                })

        return {
            'success': True,
            'is_survey': is_survey,
            'confidence': round(confidence, 3),
            'n_columns': n_cols,
            'n_rows': n_rows,
            'question_columns': question_columns,
            'metadata_columns': metadata_columns,
            'grouping_columns': grouping_columns,
            'recommended_transformations': recommended,
            'summary': {
                'question_count': len(question_columns),
                'metadata_count': len(metadata_columns),
                'grouping_count': len(grouping_columns),
                'likert_count': len([q for q in question_columns if q.get('response_type', '').startswith('likert')]),
                'free_text_count': len([q for q in question_columns if q.get('response_type') == 'free_text']),
                'numeric_count': len([q for q in question_columns if q.get('response_type') == 'numeric']),
            }
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def transform_survey_data(config):
    """Apply survey-specific transformations to data"""
    try:
        data_path = config['data_path']
        data = pd.read_json(data_path)
        transformations = config.get('transformations', [])

        column_mapping = {}  # old_name → new_name
        likert_encoding = {}  # column → encoding map

        for transform in transformations:
            t_type = transform.get('type', '')

            if t_type == 'rename_to_topics':
                # Rename question columns to topic labels
                for col in data.columns:
                    col_str = str(col)
                    if len(col_str) > 40 or '?' in col_str:
                        topic = _extract_topic_label(col_str)
                        if topic != col_str:
                            column_mapping[col_str] = topic

            elif t_type == 'encode_likert':
                # Detect and encode Likert columns
                target_cols = transform.get('columns')
                if not target_cols:
                    # Auto-detect
                    target_cols = [str(col) for col in data.columns]

                for col in target_cols:
                    if col not in data.columns:
                        continue
                    encoding = _detect_likert_encoding(data[col])
                    if encoding:
                        likert_encoding[col] = encoding

        # Apply column renames
        if column_mapping:
            # Handle duplicate topic labels by appending index
            seen = {}
            final_mapping = {}
            for old_name, new_name in column_mapping.items():
                if new_name in seen:
                    seen[new_name] += 1
                    final_mapping[old_name] = f"{new_name} ({seen[new_name]})"
                else:
                    seen[new_name] = 1
                    final_mapping[old_name] = new_name
            data = data.rename(columns=final_mapping)
            column_mapping = final_mapping

        # Apply Likert encoding
        encoded_columns = []
        for col, encoding in likert_encoding.items():
            # Apply to renamed column if applicable
            actual_col = column_mapping.get(col, col)
            if actual_col in data.columns:
                original_values = data[actual_col].copy()
                data[actual_col] = data[actual_col].astype(str).str.lower().str.strip().map(encoding)
                encoded_columns.append({
                    'column': actual_col,
                    'original_column': col,
                    'encoding': {str(k): int(v) for k, v in encoding.items()},
                    'n_encoded': int(data[actual_col].notna().sum()),
                    'n_missing': int(data[actual_col].isna().sum()),
                })

        # Build lookup table for survey questions
        question_lookup = []
        for old_name, new_name in column_mapping.items():
            col_analysis = {
                'question_id': f'Q{len(question_lookup) + 1}',
                'original_question': old_name,
                'topic_label': new_name,
            }
            if old_name in likert_encoding:
                col_analysis['response_type'] = 'likert'
                col_analysis['encoding'] = {str(k): int(v) for k, v in likert_encoding[old_name].items()}
            question_lookup.append(col_analysis)

        return {
            'success': True,
            'transformed_data': data.to_dict(orient='records'),
            'column_mapping': column_mapping,
            'encoded_columns': encoded_columns,
            'question_lookup': question_lookup,
            'n_renamed': len(column_mapping),
            'n_encoded': len(encoded_columns),
            'n_rows': len(data),
            'n_columns': len(data.columns),
            'new_columns': list(data.columns),
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def _analyze_column(data, col, col_str):
    """Analyze a single column to determine if it's a question, metadata, or grouping column"""
    result = {
        'original_name': col_str,
        'is_question': False,
        'is_metadata': False,
        'is_grouping': False,
        'metadata_type': None,
        'response_type': None,
        'topic_label': None,
    }

    col_lower = col_str.lower().strip()
    n_unique = data[col].nunique()
    dtype = str(data[col].dtype)

    # Check if column name looks like a question
    is_long = len(col_str) > 40
    has_question_mark = '?' in col_str
    has_question_words = any(w in col_lower for w in [
        'how ', 'what ', 'which ', 'please ', 'rank ', 'rate ',
        'do you', 'would you', 'should ', 'are there', 'is there',
        'select ', 'describe ', 'to what extent', 'put a '
    ])

    if is_long or has_question_mark or (has_question_words and len(col_str) > 20):
        result['is_question'] = True
        result['topic_label'] = _extract_topic_label(col_str)

        # Detect response type
        if dtype in ['int64', 'float64']:
            if n_unique <= 7:
                result['response_type'] = f'likert_{n_unique}'
            else:
                result['response_type'] = 'numeric'
        elif dtype == 'object':
            encoding = _detect_likert_encoding(data[col])
            if encoding:
                result['response_type'] = f'likert_{len(encoding)}'
                result['likert_encoding'] = {str(k): int(v) for k, v in encoding.items()}
            else:
                sample = data[col].dropna().head(50)
                avg_len = sample.astype(str).str.len().mean()
                if avg_len > 30:
                    result['response_type'] = 'free_text'
                else:
                    result['response_type'] = 'categorical'
        result['unique_values'] = _safe_unique_values(data[col], limit=10)
    else:
        result['is_metadata'] = True

        # Determine metadata type
        if col_lower in ['timestamp', 'date', 'time', 'created', 'submitted', 'modified']:
            result['metadata_type'] = 'timestamp'
        elif col_lower in ['id', 'respondent_id', 'email', 'name', 'user_id']:
            result['metadata_type'] = 'identifier'
        elif n_unique <= 20 and dtype == 'object':
            result['metadata_type'] = 'category'
            result['is_grouping'] = True
        elif dtype in ['int64', 'float64'] and n_unique <= 15:
            result['metadata_type'] = 'category'
            result['is_grouping'] = True
        else:
            result['metadata_type'] = 'other'

    return result


def _extract_topic_label(question_text, max_length=30):
    """Extract a short topic label from a long question text"""
    text = str(question_text).strip()

    # Handle bracket-enclosed topics: "...milestone. [Cool Sequoia classrooms...]"
    bracket_match = re.search(r'\[([^\]]+)\]', text)
    if bracket_match:
        topic = bracket_match.group(1).strip()
        if len(topic) <= max_length:
            return topic
        # Truncate at word boundary
        return _truncate_at_word(topic, max_length)

    # Strip numbering and common prefixes
    cleaned = text
    for prefix in QUESTION_PREFIXES:
        cleaned = re.sub(prefix, '', cleaned, flags=re.IGNORECASE).strip()

    # Remove trailing question marks and punctuation
    cleaned = cleaned.rstrip('?.!;:,')

    # Remove common filler words at the start
    cleaned = re.sub(r'^(the |a |an |your |our |their |this |that |those |these )', '', cleaned, flags=re.IGNORECASE).strip()

    # Capitalize first letter of each significant word
    if cleaned:
        words = cleaned.split()
        # Take key words, skip very common ones
        skip_words = {'the', 'a', 'an', 'of', 'to', 'in', 'for', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'with', 'at', 'by', 'on'}
        key_words = [w for w in words if w.lower() not in skip_words][:6]
        if not key_words:
            key_words = words[:4]
        topic = ' '.join(key_words)
        topic = topic[0].upper() + topic[1:] if topic else text[:max_length]
    else:
        topic = text[:max_length]

    return _truncate_at_word(topic, max_length)


def _truncate_at_word(text, max_length):
    """Truncate text at a word boundary"""
    if len(text) <= max_length:
        return text
    truncated = text[:max_length]
    last_space = truncated.rfind(' ')
    if last_space > max_length // 2:
        return truncated[:last_space]
    return truncated


def _detect_likert_encoding(series):
    """Detect if a column contains Likert-scale responses and return encoding"""
    if series.dtype in ['int64', 'float64']:
        return None  # Already numeric

    values = series.dropna().astype(str).str.lower().str.strip().unique()
    if len(values) < 2 or len(values) > 7:
        return None

    # Check against known Likert patterns
    for pattern_set in [LIKERT_5_PATTERNS, LIKERT_4_PATTERNS]:
        matches = 0
        encoding = {}
        for val in values:
            if val in pattern_set:
                matches += 1
                encoding[val] = pattern_set[val]

        if matches >= len(values) * 0.6 and matches >= 2:
            return encoding

    # Try numeric strings
    numeric_encoding = {}
    for val in values:
        try:
            numeric_encoding[val] = int(float(val))
        except (ValueError, TypeError):
            pass

    if len(numeric_encoding) == len(values) and len(values) >= 2:
        return numeric_encoding

    return None


def _safe_unique_values(series, limit=10):
    """Get unique values safely as strings"""
    try:
        values = series.dropna().unique()[:limit]
        return [str(v) for v in values]
    except:
        return []


if __name__ == "__main__":
    import os

    config = None

    # Priority 1: Check CONFIG environment variable
    if os.environ.get('CONFIG'):
        try:
            config = json.loads(os.environ['CONFIG'])
        except:
            pass

    # Priority 2: Check stdin
    if config is None and not sys.stdin.isatty():
        try:
            stdin_data = sys.stdin.read().strip()
            if stdin_data:
                config = json.loads(stdin_data)
        except:
            pass

    # Priority 3: Check command line argument
    if config is None and len(sys.argv) == 2:
        try:
            config = json.loads(sys.argv[1])
        except:
            pass

    if config is None:
        print(json.dumps({
            'success': False,
            'error': 'Usage: python survey_preprocessor.py <config_json> OR pipe JSON to stdin OR set CONFIG env var'
        }))
        sys.exit(1)

    try:
        mode = config.get('mode', 'detect')
        if mode == 'transform':
            result = transform_survey_data(config)
        else:
            result = detect_survey_structure(config)

        print(json.dumps(result, default=str))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)
