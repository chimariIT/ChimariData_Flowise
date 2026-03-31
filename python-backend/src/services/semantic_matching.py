"""
Semantic Matching Service using LangChain

Provides RAG-based semantic matching for:
- Questions to data elements/columns
- Question intent classification
- Analysis type selection
- Similarity-based retrieval

Uses vector embeddings and cosine similarity for semantic understanding.
"""

from typing import Dict, List, Optional, Any, Tuple
import logging
from dataclasses import dataclass

# LangChain imports
from langchain_community.vectorstores import FAISS, PGVector
from langchain_core.documents import Document

# Local imports
from ..models.schemas import (
    ColumnDefinition, QuestionElementMapping, QuestionIntentType,
    AnalysisType, VectorDocument, VectorSearchQuery, VectorSearchResult
)
from .llm_providers import get_embedding_provider, LLMProvider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Configuration
# ============================================================================

class SemanticConfig:
    """Configuration for semantic matching service"""

    # Embedding model settings
    EMBEDDING_MODEL = "text-embedding-3-small"  # OpenAI
    EMBEDDING_DIMENSION = 1536

    # Similarity thresholds
    SIMILARITY_THRESHOLD = 0.7
    HIGH_SIMILARITY_THRESHOLD = 0.85
    LOW_SIMILARITY_THRESHOLD = 0.5

    # Vector store settings
    USE_PGVECTOR = True  # Use PostgreSQL with pgvector for production
    LOCAL_VECTOR_STORE_PATH = "./vector_stores"

    # Search settings
    TOP_K_RESULTS = 10
    MIN_RESULTS = 3


# ============================================================================
# Embedding Providers
# ============================================================================

class EmbeddingProvider:
    """Factory for creating embedding models with multi-provider support"""

    @staticmethod
    def create(
        provider: str = "openai",
        model: str = None
    ):
        """
        Create embedding model for specified provider

        Args:
            provider: Provider name (openai, gemini, ollama)
            model: Model name (uses provider default if not specified)

        Returns:
            LangChain embeddings instance
        """
        try:
            return get_embedding_provider(
                provider=LLMProvider(provider),
                model=model or SemanticConfig.EMBEDDING_MODEL
            )
        except Exception as e:
            logger.warning(f"Failed to create embeddings for {provider}: {e}")
            # Fallback to OpenAI
            return get_embedding_provider(
                provider=LLMProvider.OPENAI,
                model=model or SemanticConfig.EMBEDDING_MODEL
            )

    @staticmethod
    def create_openai(model: str = None):
        """Legacy method - Create OpenAI embeddings model"""
        return EmbeddingProvider.create("openai", model)


# ============================================================================
# Column Embedding Generator
# ============================================================================

class ColumnEmbeddingGenerator:
    """
    Generates and stores embeddings for dataset columns

    Enables RAG-based matching of questions to columns
    """

    def __init__(self, embedding_model=None):
        """Initialize with embedding model"""
        self.embedding_model = embedding_model or EmbeddingProvider.create()

    async def generate_column_embeddings(
        self,
        dataset_id: str,
        columns: List[ColumnDefinition]
    ) -> List[VectorDocument]:
        """
        Generate embeddings for all columns in a dataset

        Args:
            dataset_id: ID of the dataset
            columns: List of column definitions

        Returns:
            List of vector documents with embeddings
        """
        documents = []

        for column in columns:
            # Create a rich text representation of the column
            column_text = self._create_column_text(column)

            # Generate embedding
            embedding = await self.embedding_model.aembed_query(column_text)

            # Create vector document
            doc = VectorDocument(
                id=f"{dataset_id}_{column.name}",
                content=column_text,
                embedding=embedding,
                metadata={
                    "dataset_id": dataset_id,
                    "column_name": column.name,
                    "column_type": column.type.value,
                    "description": column.description or "",
                    "sample_values": column.sample_values,
                    "pii_sensitivity": column.pii_sensitivity.value
                },
                project_id=dataset_id,
                document_type="column"
            )

            documents.append(doc)
            logger.info(f"Generated embedding for column: {column.name}")

        return documents

    def _create_column_text(self, column: ColumnDefinition) -> str:
        """Create a rich text representation of a column"""
        parts = [f"Column name: {column.name}"]

        if column.description:
            parts.append(f"Description: {column.description}")

        parts.append(f"Type: {column.type.value}")

        if column.sample_values:
            parts.append(f"Sample values: {', '.join(str(v) for v in column.sample_values[:5])}")

        if column.unique_count:
            parts.append(f"Unique values: {column.unique_count}")

        if column.pii_sensitivity.value != "none":
            parts.append(f"PII sensitivity: {column.pii_sensitivity.value}")

        return " | ".join(parts)

    async def store_column_embeddings(
        self,
        dataset_id: str,
        documents: List[VectorDocument],
        vector_store=None
    ):
        """
        Store column embeddings in vector store

        Args:
            dataset_id: ID of the dataset
            documents: List of vector documents
            vector_store: Optional pre-existing vector store
        """
        langchain_docs = [
            Document(
                page_content=doc.content,
                metadata=doc.metadata
            )
            for doc in documents
        ]

        if vector_store is None:
            # Create new vector store
            if SemanticConfig.USE_PGVECTOR:
                vector_store = PGVector.from_documents(
                    documents=langchain_docs,
                    embedding=self.embedding_model,
                    collection_name=f"columns_{dataset_id}"
                )
            else:
                # Use local FAISS store
                vector_store = FAISS.from_documents(
                    documents=langchain_docs,
                    embedding=self.embedding_model
                )
        else:
            # Add to existing store
            vector_store.add_documents(langchain_docs)

        logger.info(f"Stored {len(documents)} column embeddings for dataset {dataset_id}")
        return vector_store


# ============================================================================
# Question Analyzer
# ============================================================================

@dataclass
class QuestionAnalysis:
    """Analysis result for a question"""
    question: str
    intent: QuestionIntentType
    keywords: List[str]
    entities: List[str]
    time_period: Optional[str]
    comparison_target: Optional[str]
    suggested_analyses: List[AnalysisType]
    confidence: float


class QuestionAnalyzer:
    """
    Analyzes questions to extract intent and requirements

    Uses LLM for deep understanding
    """

    INTENT_PATTERNS = {
        QuestionIntentType.TREND: [
            "trend", "over time", "history", "evolution", "change", "progression",
            "increasing", "decreasing", "fluctuation"
        ],
        QuestionIntentType.COMPARISON: [
            "compare", "difference", "versus", "vs", "better", "worse",
            "higher", "lower", "between", "among", "relative"
        ],
        QuestionIntentType.CORRELATION: [
            "correlate", "relationship", "impact", "affect", "influence",
            "associated", "linked", "connection", "depends"
        ],
        QuestionIntentType.DISTRIBUTION: [
            "distribution", "spread", "range", "dispersion", "variability",
            "concentration", "frequency"
        ],
        QuestionIntentType.PREDICTION: [
            "predict", "forecast", "future", "expect", "project", "anticipate",
            "trend continues", "will be", "likely"
        ],
        QuestionIntentType.ROOT_CAUSE: [
            "why", "cause", "reason", "factor", "driver", "explanation",
            "attributable", "responsible"
        ],
        QuestionIntentType.DESCRIPTIVE: [
            "what", "how many", "how much", "list", "show", "display",
            "summary", "overview", "statistics"
        ]
    }

    ANALYSIS_TYPE_MAPPING = {
        QuestionIntentType.TREND: [AnalysisType.TIME_SERIES, AnalysisType.DESCRIPTIVE_STATS],
        QuestionIntentType.COMPARISON: [AnalysisType.DESCRIPTIVE_STATS, AnalysisType.STATISTICAL_TESTS],
        QuestionIntentType.CORRELATION: [AnalysisType.CORRELATION, AnalysisType.REGRESSION],
        QuestionIntentType.DISTRIBUTION: [AnalysisType.DESCRIPTIVE_STATS, AnalysisType.CLUSTERING],
        QuestionIntentType.PREDICTION: [AnalysisType.TIME_SERIES, AnalysisType.REGRESSION],
        QuestionIntentType.ROOT_CAUSE: [AnalysisType.REGRESSION, AnalysisType.CORRELATION],
        QuestionIntentType.DESCRIPTIVE: [AnalysisType.DESCRIPTIVE_STATS]
    }

    def analyze_question(self, question: str) -> QuestionAnalysis:
        """
        Analyze a question to extract intent and requirements

        Args:
            question: The user's question

        Returns:
            QuestionAnalysis with extracted information
        """
        question_lower = question.lower()

        # Detect intent
        intent = self._detect_intent(question_lower)

        # Extract keywords
        keywords = self._extract_keywords(question)

        # Extract entities (using simple NLP)
        entities = self._extract_entities(question)

        # Detect time period
        time_period = self._detect_time_period(question_lower)

        # Detect comparison target
        comparison_target = self._detect_comparison_target(question_lower)

        # Get suggested analyses
        suggested_analyses = self.ANALYSIS_TYPE_MAPPING.get(intent, [AnalysisType.DESCRIPTIVE_STATS])

        # Calculate confidence
        confidence = self._calculate_confidence(question, intent, keywords)

        return QuestionAnalysis(
            question=question,
            intent=intent,
            keywords=keywords,
            entities=entities,
            time_period=time_period,
            comparison_target=comparison_target,
            suggested_analyses=suggested_analyses,
            confidence=confidence
        )

    def _detect_intent(self, question: str) -> QuestionIntentType:
        """Detect the primary intent of the question"""
        scores = {}

        for intent, patterns in self.INTENT_PATTERNS.items():
            score = sum(1 for pattern in patterns if pattern in question)
            scores[intent] = score

        # Return intent with highest score, default to descriptive
        if scores:
            return max(scores, key=scores.get)  # type: ignore
        return QuestionIntentType.DESCRIPTIVE

    def _extract_keywords(self, question: str) -> List[str]:
        """Extract important keywords from the question"""
        # Simple keyword extraction - in production, use NLP libraries
        stopwords = {
            "what", "how", "why", "when", "where", "who", "which",
            "the", "a", "an", "is", "are", "was", "were", "be",
            "and", "or", "but", "for", "with", "by", "in", "on", "at"
        }

        words = question.lower().split()
        keywords = [w for w in words if w.isalpha() and w not in stopwords and len(w) > 2]

        return list(set(keywords))

    def _extract_entities(self, question: str) -> List[str]:
        """Extract named entities from the question"""
        # Simple entity extraction - in production, use spaCy or similar
        entities = []

        # Look for capitalized words (potential entities)
        words = question.split()
        for i, word in enumerate(words):
            if word[0].isupper() and len(word) > 2:
                entities.append(word)

        return list(set(entities))

    def _detect_time_period(self, question: str) -> Optional[str]:
        """Detect time period mentioned in the question"""
        time_patterns = {
            "last month": "month",
            "past month": "month",
            "this month": "month",
            "last quarter": "quarter",
            "past quarter": "quarter",
            "this quarter": "quarter",
            "last year": "year",
            "past year": "year",
            "this year": "year",
            "ytd": "year",
            "year to date": "year",
            "recent": "recent",
            "latest": "latest"
        }

        for pattern, period in time_patterns.items():
            if pattern in question:
                return period

        return None

    def _detect_comparison_target(self, question: str) -> Optional[str]:
        """Detect what we're comparing to"""
        comparison_patterns = ["vs ", "versus ", "than ", "between ", "among "]

        for pattern in comparison_patterns:
            if pattern in question:
                idx = question.find(pattern)
                return question[idx + len(pattern):].split()[0]

        return None

    def _calculate_confidence(
        self,
        question: str,
        intent: QuestionIntentType,
        keywords: List[str]
    ) -> float:
        """Calculate confidence in the analysis"""
        base_confidence = 0.5

        # More keywords = higher confidence
        keyword_boost = min(0.3, len(keywords) * 0.05)

        # Strong intent words = higher confidence
        intent_boost = 0.0
        patterns = self.INTENT_PATTERNS.get(intent, [])
        question_lower = question.lower()
        for pattern in patterns:
            if pattern in question_lower:
                intent_boost += 0.05

        # Question length factor
        length_factor = min(0.1, len(question) / 200)

        return min(1.0, base_confidence + keyword_boost + intent_boost + length_factor)


# ============================================================================
# Semantic Matcher
# ============================================================================

class SemanticMatcher:
    """
    Main semantic matching service

    Coordinates embedding generation, similarity search, and mapping creation
    """

    def __init__(self, embedding_model=None):
        """Initialize the semantic matcher"""
        self.embedding_model = embedding_model or EmbeddingProvider.create()
        self.column_generator = ColumnEmbeddingGenerator(embedding_model)
        self.question_analyzer = QuestionAnalyzer()
        self.vector_stores: Dict[str, Any] = {}

    async def get_question_element_mappings(
        self,
        questions: List[str],
        datasets: List[str],
        user_goals: List[str],
        top_k: int = SemanticConfig.TOP_K_RESULTS
    ) -> List[QuestionElementMapping]:
        """
        Get semantic mappings between questions and data elements

        Args:
            questions: List of user questions
            datasets: List of dataset IDs
            user_goals: User's analysis goals
            top_k: Number of top results to return

        Returns:
            List of QuestionElementMapping
        """
        mappings = []

        for question in questions:
            mapping = await self._map_question_to_elements(
                question=question,
                datasets=datasets,
                user_goals=user_goals,
                top_k=top_k
            )
            mappings.append(mapping)

        return mappings

    async def _map_question_to_elements(
        self,
        question: str,
        datasets: List[str],
        user_goals: List[str],
        top_k: int
    ) -> QuestionElementMapping:
        """Map a single question to relevant data elements"""

        # Analyze the question
        analysis = self.question_analyzer.analyze_question(question)

        # Generate question embedding
        question_embedding = await self.embedding_model.aembed_query(question)

        # Search for similar columns across all datasets
        all_matches = []
        for dataset_id in datasets:
            vector_store = self.vector_stores.get(dataset_id)
            if vector_store is None:
                logger.warning(f"No vector store found for dataset {dataset_id}")
                continue

            # Perform similarity search
            results = await vector_store.asimilarity_search_with_score(question, k=top_k)
            all_matches.extend(results)

        # Filter by similarity threshold
        filtered_matches = [
            (doc, score) for doc, score in all_matches
            if score >= SemanticConfig.SIMILARITY_THRESHOLD
        ]

        # Sort by similarity score
        filtered_matches.sort(key=lambda x: x[1], reverse=True)

        # Extract mapping information
        related_elements = []
        related_columns = []
        relevance_scores = []

        for doc, score in filtered_matches[:top_k]:
            related_elements.append(doc.metadata.get("column_name", ""))
            related_columns.append(doc.metadata.get("column_name", ""))
            relevance_scores.append(score)

        # Create stable question ID
        import hashlib
        question_id = hashlib.sha256(question.encode()).hexdigest()[:16]

        # Create mapping
        mapping = QuestionElementMapping(
            question_id=question_id,
            question_text=question,
            related_elements=related_elements,
            related_columns=related_columns,
            relevance_scores=relevance_scores,
            recommended_analyses=[a.value for a in analysis.suggested_analyses],
            business_context=f"Goals: {', '.join(user_goals)}",
            intent_type=analysis.intent,
            confidence=analysis.confidence,
            embedding=question_embedding
        )

        return mapping

    def calculate_similarity(
        self,
        text1: str,
        text2: str,
        embedding1: Optional[List[float]] = None,
        embedding2: Optional[List[float]] = None
    ) -> float:
        """
        Calculate semantic similarity between two texts

        Args:
            text1: First text
            text2: Second text
            embedding1: Pre-computed embedding for text1 (optional)
            embedding2: Pre-computed embedding for text2 (optional)

        Returns:
            Cosine similarity score (0-1)
        """
        import numpy as np

        if embedding1 is None:
            embedding1 = self.embedding_model.embed_query(text1)

        if embedding2 is None:
            embedding2 = self.embedding_model.embed_query(text2)

        # Convert to numpy arrays
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)

        # Calculate cosine similarity
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))

    def cosine_similarity(
        self,
        embedding1: List[float],
        embedding2: List[float]
    ) -> float:
        """
        Calculate cosine similarity between two embeddings

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Cosine similarity score (0-1)
        """
        import numpy as np

        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)

        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return float(dot_product / (norm1 * norm2))


# ============================================================================
# Helper Functions for Analysis Type Selection
# ============================================================================

def select_analysis_types_for_questions(
    questions: List[str],
    mappings: List[Dict],
    user_goals: List[str]
) -> List[str]:
    """
    Select appropriate analysis types based on questions and mappings

    Args:
        questions: User questions
        mappings: Question-element mappings
        user_goals: User goals

    Returns:
        List of analysis types to execute
    """
    analyzer = QuestionAnalyzer()

    analysis_types = set()

    # Analyze each question
    for question in questions:
        analysis = analyzer.analyze_question(question)

        # Add suggested analyses
        for analysis_type in analysis.suggested_analyses:
            analysis_types.add(analysis_type.value)

    # Always include descriptive stats as baseline
    analysis_types.add(AnalysisType.DESCRIPTIVE_STATS.value)

    return list(analysis_types)


# ============================================================================
# Singleton Instance
# ============================================================================

_matcher_instance: Optional[SemanticMatcher] = None


def get_semantic_matcher() -> SemanticMatcher:
    """Get the singleton semantic matcher instance"""
    global _matcher_instance
    if _matcher_instance is None:
        _matcher_instance = SemanticMatcher()
    return _matcher_instance


# ============================================================================
# Convenience Functions
# ============================================================================

async def get_question_element_mappings(
    questions: List[str],
    datasets: List[str],
    user_goals: List[str]
) -> List[QuestionElementMapping]:
    """
    Convenience function to get question-element mappings

    Args:
        questions: List of user questions
        datasets: List of dataset IDs
        user_goals: User's analysis goals

    Returns:
        List of QuestionElementMapping
    """
    matcher = get_semantic_matcher()
    return await matcher.get_question_element_mappings(
        questions=questions,
        datasets=datasets,
        user_goals=user_goals
    )
