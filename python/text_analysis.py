#!/usr/bin/env python3
"""
Text Analysis Script
NLP analysis: word frequency, n-grams, TF-IDF keywords, topic modeling (LDA), sentiment.
Auto-detects text columns and performs comprehensive text analytics.

Dual-engine: Polars for fast loading, Pandas/sklearn for NLP operations.
"""

import json
import sys
import pandas as pd
import numpy as np
import re
from collections import Counter
import warnings
warnings.filterwarnings('ignore')

from engine_utils import load_dataframe, to_pandas


def perform_text_analysis(config):
    """Perform comprehensive text/NLP analysis"""
    try:
        # Load data via dual-engine dispatch, convert to Pandas for NLP ops
        data, engine_used = load_dataframe(config)
        data = to_pandas(data)

        text_columns = config.get('text_columns') or config.get('columns')

        # Auto-detect text columns if not specified
        if not text_columns:
            text_columns = _detect_text_columns(data)

        if not text_columns:
            return {
                'success': False,
                'error': 'No text columns found in the data. Text analysis requires columns with string/text values.'
            }

        results = {
            'success': True,
            'engine_used': engine_used,
            'text_columns_analyzed': text_columns,
            'n_columns': len(text_columns),
            'per_column': {},
            'combined_analysis': {},
            'summary': {}
        }

        all_texts = []

        for col in text_columns:
            if col not in data.columns:
                continue

            col_data = data[col].dropna().astype(str)
            texts = col_data.tolist()

            if len(texts) == 0:
                continue

            all_texts.extend(texts)

            col_results = {
                'n_responses': int(len(texts)),
                'avg_length': float(np.mean([len(t) for t in texts])),
                'min_length': int(min(len(t) for t in texts)),
                'max_length': int(max(len(t) for t in texts)),
                'empty_count': int(sum(1 for t in texts if len(t.strip()) == 0)),
            }

            # Word frequency analysis
            words = _tokenize_texts(texts)
            word_freq = Counter(words)
            col_results['word_frequency'] = [
                {'word': w, 'count': int(c)}
                for w, c in word_freq.most_common(30)
            ]
            col_results['total_words'] = int(len(words))
            col_results['unique_words'] = int(len(set(words)))
            col_results['vocabulary_richness'] = float(len(set(words)) / len(words)) if words else 0

            # N-gram analysis (bigrams and trigrams)
            col_results['top_bigrams'] = _get_ngrams(texts, 2, 20)
            col_results['top_trigrams'] = _get_ngrams(texts, 3, 15)

            # TF-IDF keyword extraction
            col_results['tfidf_keywords'] = _tfidf_keywords(texts, top_n=15)

            # Topic modeling (LDA)
            col_results['topics'] = _extract_topics(texts, n_topics=min(5, max(2, len(texts) // 20)))

            # Sentiment analysis
            col_results['sentiment'] = _analyze_sentiment(texts)

            # Text length distribution
            lengths = [len(t) for t in texts]
            col_results['length_distribution'] = {
                'mean': float(np.mean(lengths)),
                'median': float(np.median(lengths)),
                'std': float(np.std(lengths)),
                'percentile_25': float(np.percentile(lengths, 25)),
                'percentile_75': float(np.percentile(lengths, 75)),
            }

            # Response patterns
            col_results['response_patterns'] = _detect_patterns(texts)

            results['per_column'][col] = col_results

        # Combined analysis across all text columns
        if all_texts:
            combined_words = _tokenize_texts(all_texts)
            combined_freq = Counter(combined_words)
            results['combined_analysis'] = {
                'total_responses': int(len(all_texts)),
                'total_words': int(len(combined_words)),
                'unique_words': int(len(set(combined_words))),
                'top_words': [{'word': w, 'count': int(c)} for w, c in combined_freq.most_common(20)],
                'overall_topics': _extract_topics(all_texts, n_topics=min(5, max(2, len(all_texts) // 15))),
                'overall_sentiment': _analyze_sentiment(all_texts),
            }

        # Summary
        results['summary'] = {
            'columns_analyzed': len(results['per_column']),
            'total_text_entries': int(sum(r.get('n_responses', 0) for r in results['per_column'].values())),
            'avg_response_length': float(np.mean([r.get('avg_length', 0) for r in results['per_column'].values()])) if results['per_column'] else 0,
            'most_common_theme': _get_top_theme(results),
        }

        # Phase 4C-1: Pass through business context for evidence chain
        business_context = config.get('business_context', {})
        if business_context:
            results['business_context'] = business_context
            results['question_ids'] = business_context.get('question_ids', [])

        return results

    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }


def _detect_text_columns(data):
    """Identify columns that contain text data suitable for analysis"""
    text_cols = []
    for col in data.columns:
        if data[col].dtype == 'object':
            sample = data[col].dropna().head(50)
            if len(sample) == 0:
                continue
            avg_len = sample.astype(str).str.len().mean()
            n_unique = sample.nunique()
            # Text columns: avg length > 15 chars, many unique values
            if avg_len > 15 and n_unique > min(5, len(sample) * 0.3):
                text_cols.append(col)
    return text_cols[:5]  # Limit to 5 text columns


def _tokenize_texts(texts, min_length=3):
    """Tokenize texts into words, removing stopwords and short words"""
    STOPWORDS = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
        'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
        'could', 'should', 'may', 'might', 'shall', 'can', 'this', 'that',
        'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me',
        'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
        'not', 'no', 'nor', 'so', 'too', 'very', 'just', 'also', 'than',
        'more', 'most', 'other', 'some', 'such', 'only', 'same', 'into',
        'about', 'up', 'out', 'if', 'then', 'when', 'what', 'which', 'who',
        'how', 'all', 'each', 'every', 'both', 'few', 'many', 'much',
        'there', 'here', 'where', 'why', 'as', 'because', 'while', 'after',
        'before', 'during', 'since', 'until', 'am', 'like', 'get', 'got',
        'make', 'made', 'know', 'think', 'see', 'want', 'come', 'go', 'went',
        'said', 'say', 'one', 'two', 'three', 'four', 'five', 'new', 'old',
        'first', 'last', 'next', 'even', 'well', 'back', 'still', 'need',
    }
    words = []
    for text in texts:
        tokens = re.findall(r'\b[a-zA-Z]+\b', str(text).lower())
        words.extend([w for w in tokens if len(w) >= min_length and w not in STOPWORDS])
    return words


def _get_ngrams(texts, n, top_k):
    """Extract top n-grams from texts"""
    STOPWORDS = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'is', 'was', 'are', 'were', 'be', 'been',
        'have', 'has', 'had', 'do', 'does', 'did', 'this', 'that', 'i', 'you',
        'it', 'we', 'they', 'not', 'no',
    }
    ngrams = []
    for text in texts:
        tokens = re.findall(r'\b[a-zA-Z]+\b', str(text).lower())
        tokens = [t for t in tokens if t not in STOPWORDS and len(t) >= 2]
        for i in range(len(tokens) - n + 1):
            ngrams.append(' '.join(tokens[i:i + n]))

    freq = Counter(ngrams)
    return [
        {'ngram': ng, 'count': int(c)}
        for ng, c in freq.most_common(top_k)
        if c >= 2  # Only include ngrams that appear at least twice
    ]


def _tfidf_keywords(texts, top_n=15):
    """Extract keywords using TF-IDF"""
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer

        if len(texts) < 2:
            return []

        vectorizer = TfidfVectorizer(
            max_features=200,
            stop_words='english',
            min_df=2,
            max_df=0.9,
            ngram_range=(1, 2)
        )
        tfidf_matrix = vectorizer.fit_transform(texts)
        feature_names = vectorizer.get_feature_names_out()

        # Get average TF-IDF score per term
        avg_scores = tfidf_matrix.mean(axis=0).A1
        top_indices = avg_scores.argsort()[-top_n:][::-1]

        return [
            {'keyword': str(feature_names[i]), 'score': float(avg_scores[i])}
            for i in top_indices
            if avg_scores[i] > 0
        ]
    except ImportError:
        return [{'keyword': 'sklearn_not_available', 'score': 0}]
    except Exception:
        return []


def _extract_topics(texts, n_topics=3):
    """Extract topics using LDA"""
    try:
        from sklearn.feature_extraction.text import CountVectorizer
        from sklearn.decomposition import LatentDirichletAllocation

        if len(texts) < 5:
            return []

        vectorizer = CountVectorizer(
            max_features=500,
            stop_words='english',
            min_df=2,
            max_df=0.9
        )
        doc_term_matrix = vectorizer.fit_transform(texts)
        feature_names = vectorizer.get_feature_names_out()

        if doc_term_matrix.shape[1] < n_topics:
            return []

        lda = LatentDirichletAllocation(
            n_components=min(n_topics, doc_term_matrix.shape[1]),
            random_state=42,
            max_iter=20,
            learning_method='online'
        )
        lda.fit(doc_term_matrix)

        topics = []
        for topic_idx, topic in enumerate(lda.components_):
            top_word_indices = topic.argsort()[-8:][::-1]
            top_words = [str(feature_names[i]) for i in top_word_indices]
            weight = float(topic.sum() / lda.components_.sum())

            # Generate topic label from top 2-3 words
            label = ' & '.join(top_words[:3]).title()

            topics.append({
                'topic_id': int(topic_idx),
                'label': label,
                'top_words': top_words,
                'weight': weight
            })

        return topics
    except ImportError:
        return [{'topic_id': 0, 'label': 'sklearn_not_available', 'top_words': [], 'weight': 0}]
    except Exception:
        return []


def _analyze_sentiment(texts):
    """Analyze sentiment of texts using keyword-based approach"""
    # Simple keyword-based sentiment (no external dependency required)
    POSITIVE_WORDS = {
        'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic',
        'love', 'like', 'best', 'happy', 'pleased', 'satisfied', 'enjoy',
        'perfect', 'awesome', 'nice', 'helpful', 'positive', 'thank',
        'appreciate', 'improve', 'better', 'support', 'well', 'yes',
        'comfortable', 'agree', 'strongly', 'recommend', 'benefit'
    }
    NEGATIVE_WORDS = {
        'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'worst',
        'poor', 'unhappy', 'disappointed', 'unsatisfied', 'frustrating',
        'difficult', 'problem', 'issue', 'complaint', 'negative', 'fail',
        'wrong', 'unfortunately', 'concern', 'worry', 'lack', 'disagree',
        'uncomfortable', 'no', 'not', 'never', 'worse', 'decrease'
    }

    positive_count = 0
    negative_count = 0
    neutral_count = 0
    scores = []

    for text in texts:
        words = set(re.findall(r'\b[a-zA-Z]+\b', str(text).lower()))
        pos = len(words & POSITIVE_WORDS)
        neg = len(words & NEGATIVE_WORDS)

        if pos > neg:
            positive_count += 1
            scores.append(1)
        elif neg > pos:
            negative_count += 1
            scores.append(-1)
        else:
            neutral_count += 1
            scores.append(0)

    total = len(texts) or 1
    return {
        'positive': float(positive_count / total),
        'neutral': float(neutral_count / total),
        'negative': float(negative_count / total),
        'positive_count': int(positive_count),
        'neutral_count': int(neutral_count),
        'negative_count': int(negative_count),
        'average_score': float(np.mean(scores)) if scores else 0,
        'method': 'keyword_based'
    }


def _detect_patterns(texts):
    """Detect common response patterns"""
    patterns = {
        'questions': int(sum(1 for t in texts if '?' in str(t))),
        'exclamations': int(sum(1 for t in texts if '!' in str(t))),
        'urls': int(sum(1 for t in texts if 'http' in str(t).lower())),
        'numbers': int(sum(1 for t in texts if any(c.isdigit() for c in str(t)))),
        'all_caps': int(sum(1 for t in texts if str(t).isupper() and len(str(t)) > 3)),
        'single_word': int(sum(1 for t in texts if len(str(t).split()) == 1)),
        'very_short': int(sum(1 for t in texts if len(str(t)) < 10)),
        'very_long': int(sum(1 for t in texts if len(str(t)) > 500)),
    }
    return patterns


def _get_top_theme(results):
    """Get the most prominent theme across all columns"""
    all_keywords = []
    for col_results in results.get('per_column', {}).values():
        for kw in col_results.get('tfidf_keywords', [])[:3]:
            all_keywords.append(kw.get('keyword', ''))
    if all_keywords:
        freq = Counter(all_keywords)
        return freq.most_common(1)[0][0] if freq else 'N/A'
    return 'N/A'


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
            'error': 'Usage: python text_analysis.py <config_json> OR pipe JSON to stdin OR set CONFIG env var'
        }))
        sys.exit(1)

    try:
        result = perform_text_analysis(config)
        print(json.dumps(result))
        sys.exit(0 if result.get('success') else 1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)
