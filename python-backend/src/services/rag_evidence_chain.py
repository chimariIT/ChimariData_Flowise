"""
RAG Evidence Chain Service using LangChain

Manages the evidence chain for linking:
- Questions → Elements → Transformations → Insights → Answers

Uses LangChain for:
- Vector similarity search
- Retrieval-augmented generation (RAG)
- Chain management
- Answer generation from evidence
"""

from typing import Dict, List, Optional, Any, Tuple
import logging
import hashlib
from datetime import datetime

# LangChain imports
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain_community.vectorstores import FAISS, PGVector
from langchain_core.documents import Document
from langchain_core.retrievers import BaseRetriever
# from langchain.chains import RetrievalQA, ConversationalRetrievalChain  # Deprecated in langchain v1.0+
from langchain_core.prompts import PromptTemplate
# from langchain.memory import ConversationBufferMemory  # Deprecated in langchain v1.0+

# Local imports
from ..models.schemas import (
    EvidenceLink, EvidenceChainQuery, EvidenceChainResponse,
    LinkType, QuestionElementMapping, AnalysisResult, Insight
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Evidence Document Types
# ============================================================================

class EvidenceDocument:
    """
    Represents a document in the evidence chain

    Can be a question, element, transformation, insight, or answer
    """

    def __init__(
        self,
        doc_id: str,
        doc_type: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        embedding: Optional[List[float]] = None
    ):
        self.doc_id = doc_id
        self.doc_type = doc_type
        self.content = content
        self.metadata = metadata or {}
        self.embedding = embedding
        self.created_at = datetime.utcnow()

    def to_langchain_document(self) -> Document:
        """Convert to LangChain Document"""
        return Document(
            page_content=self.content,
            metadata={
                **self.metadata,
                "doc_id": self.doc_id,
                "doc_type": self.doc_type
            }
        )


# ============================================================================
# Evidence Chain Store
# ============================================================================

class EvidenceChainStore:
    """
    Stores and retrieves evidence chain documents

    Uses vector stores for similarity search and RAG
    """

    def __init__(self, embedding_model=None, use_pgvector: bool = True):
        """Initialize the evidence chain store"""
        self.embedding_model = embedding_model or OpenAIEmbeddings()
        self.use_pgvector = use_pgvector
        self.vector_stores: Dict[str, Any] = {}
        self.links: List[EvidenceLink] = []

    def add_document(
        self,
        project_id: str,
        document: EvidenceDocument
    ) -> str:
        """
        Add a document to the evidence chain

        Args:
            project_id: Project ID
            document: EvidenceDocument to add

        Returns:
            Document ID
        """
        # Add to vector store
        collection_name = f"evidence_{project_id}"
        vector_store = self._get_vector_store(collection_name)

        langchain_doc = document.to_langchain_document()
        vector_store.add_documents([langchain_doc])

        logger.info(f"Added {document.doc_type} document {document.doc_id} to evidence chain")
        return document.doc_id

    def add_link(self, link: EvidenceLink) -> None:
        """
        Add a link to the evidence chain

        Args:
            link: EvidenceLink to add
        """
        self.links.append(link)
        logger.info(
            f"Added link: {link.source_type}:{link.source_id} -> "
            f"{link.target_type}:{link.target_id} ({link.link_type.value})"
        )

    def get_links_for_project(self, project_id: str) -> List[EvidenceLink]:
        """Get all links for a project"""
        return [
            link for link in self.links
            if link.project_id == project_id
        ]

    def get_links_for_question(
        self,
        project_id: str,
        question_id: str
    ) -> List[EvidenceLink]:
        """Get all links starting from a question"""
        return [
            link for link in self.links
            if link.project_id == project_id
            and link.source_type == "question"
            and link.source_id == question_id
        ]

    async def retrieve_evidence(
        self,
        project_id: str,
        query: str,
        top_k: int = 10,
        min_score: float = 0.0,
        doc_types: Optional[List[str]] = None
    ) -> Tuple[List[Document], List[float]]:
        """
        Retrieve evidence documents using similarity search

        Args:
            project_id: Project ID
            query: Query text
            top_k: Number of results
            min_score: Minimum similarity score
            doc_types: Optional filter by document types

        Returns:
            Tuple of (documents, scores)
        """
        collection_name = f"evidence_{project_id}"
        vector_store = self._get_vector_store(collection_name)

        # Search with score
        results = await vector_store.asimilarity_search_with_score(
            query=query,
            k=top_k
        )

        # Filter by score and doc type
        filtered_results = []
        for doc, score in results:
            if score < min_score:
                continue
            if doc_types and doc.metadata.get("doc_type") not in doc_types:
                continue
            filtered_results.append((doc, score))

        # Unzip results
        documents = [doc for doc, _ in filtered_results]
        scores = [score for _, score in filtered_results]

        return documents, scores

    def _get_vector_store(self, collection_name: str) -> Any:
        """Get or create vector store for a collection"""
        if collection_name in self.vector_stores:
            return self.vector_stores[collection_name]

        # Create new vector store
        if self.use_pgvector:
            vector_store = PGVector(
                collection_name=collection_name,
                embedding_function=self.embedding_model,
                connection_string="postgresql://..."  # Load from env
            )
        else:
            vector_store = FAISS.from_documents(
                documents=[],
                embedding=self.embedding_model
            )

        self.vector_stores[collection_name] = vector_store
        return vector_store


# ============================================================================
# Evidence Chain Builder
# ============================================================================

class EvidenceChainBuilder:
    """
    Builds the evidence chain by linking questions, elements, transformations, and insights
    """

    def __init__(self, store: EvidenceChainStore):
        """Initialize the builder"""
        self.store = store
        self.embedding_model = store.embedding_model

    def build_chain_for_question(
        self,
        project_id: str,
        question: str,
        question_id: str,
        mappings: List[QuestionElementMapping],
        transformation_ids: List[str],
        insights: List[Insight]
    ) -> List[EvidenceLink]:
        """
        Build the complete evidence chain for a question

        Chain: Question → Elements → Transformations → Insights → Answer

        Args:
            project_id: Project ID
            question: Question text
            question_id: Question ID
            mappings: Question-element mappings
            transformation_ids: Applied transformation IDs
            insights: Generated insights

        Returns:
            List of EvidenceLink
        """
        links = []

        # Step 1: Add question document
        question_doc = EvidenceDocument(
            doc_id=question_id,
            doc_type="question",
            content=question,
            metadata={"project_id": project_id, "question": question}
        )
        self.store.add_document(project_id, question_doc)

        # Step 2: Question → Elements links
        for mapping in mappings:
            if mapping.question_id != question_id:
                continue

            for i, element_id in enumerate(mapping.related_elements):
                # Add element document if not exists
                element_doc = EvidenceDocument(
                    doc_id=element_id,
                    doc_type="element",
                    content=f"Element: {element_id}",
                    metadata={
                        "project_id": project_id,
                        "element_id": element_id,
                        "columns": mapping.related_columns,
                        "relevance_score": mapping.relevance_scores[i] if i < len(mapping.relevance_scores) else 0
                    }
                )
                self.store.add_document(project_id, element_doc)

                # Create link
                link = EvidenceLink(
                    id=self._generate_link_id(question_id, element_id, "question_element"),
                    project_id=project_id,
                    source_type="question",
                    source_id=question_id,
                    target_type="element",
                    target_id=element_id,
                    link_type=LinkType.QUESTION_ELEMENT,
                    confidence=mapping.relevance_scores[i] if i < len(mapping.relevance_scores) else 0.0,
                    metadata={"question_text": question, "element_name": element_id}
                )
                self.store.add_link(link)
                links.append(link)

        # Step 3: Elements → Transformations links
        for transformation_id in transformation_ids:
            for mapping in mappings:
                if mapping.question_id != question_id:
                    continue

                for element_id in mapping.related_elements:
                    link = EvidenceLink(
                        id=self._generate_link_id(element_id, transformation_id, "element_transformation"),
                        project_id=project_id,
                        source_type="element",
                        source_id=element_id,
                        target_type="transformation",
                        target_id=transformation_id,
                        link_type=LinkType.ELEMENT_TRANSFORMATION,
                        confidence=0.8,  # Default confidence
                        metadata={"transformation_type": "derived_column"}
                    )
                    self.store.add_link(link)
                    links.append(link)

        # Step 4: Transformations → Insights links
        for insight in insights:
            # Add insight document
            insight_doc = EvidenceDocument(
                doc_id=insight.id,
                doc_type="insight",
                content=f"{insight.title}: {insight.description}",
                metadata={
                    "project_id": project_id,
                    "insight_type": insight.type,
                    "significance": insight.significance,
                    "elements": insight.data_elements_used
                }
            )
            self.store.add_document(project_id, insight_doc)

            # Create link to first transformation (simplified)
            if transformation_ids:
                link = EvidenceLink(
                    id=self._generate_link_id(transformation_ids[0], insight.id, "transformation_insight"),
                    project_id=project_id,
                    source_type="transformation",
                    source_id=transformation_ids[0],
                    target_type="insight",
                    target_id=insight.id,
                    link_type=LinkType.TRANSFORMATION_INSIGHT,
                    confidence=insight.confidence,
                    metadata={
                        "insight_type": insight.type,
                        "significance": insight.significance
                    }
                )
                self.store.add_link(link)
                links.append(link)

        return links

    def _generate_link_id(self, source_id: str, target_id: str, link_type: str) -> str:
        """Generate a unique link ID"""
        hash_input = f"{source_id}_{target_id}_{link_type}"
        return hashlib.sha256(hash_input.encode()).hexdigest()[:16]


# ============================================================================
# RAG Answer Generator
# ============================================================================

class RAGAnswerGenerator:
    """
    Generates answers to questions using Retrieval-Augmented Generation

    Uses the evidence chain to provide context for answering questions
    """

    def __init__(
        self,
        store: EvidenceChainStore,
        llm: Optional[Any] = None
    ):
        """
        Initialize the RAG answer generator

        Args:
            store: EvidenceChainStore for retrieving evidence
            llm: LLM for generating answers (optional)
        """
        self.store = store
        self.llm = llm or ChatOpenAI(temperature=0.3)

    async def generate_answer(
        self,
        project_id: str,
        question: str,
        top_k: int = 10,
        include_context: bool = True
    ) -> Dict[str, Any]:
        """
        Generate an answer to a question using RAG

        Args:
            project_id: Project ID
            question: User's question
            top_k: Number of evidence documents to retrieve
            include_context: Whether to include context in the response

        Returns:
            Dictionary with answer, context, and metadata
        """
        # Retrieve relevant evidence
        documents, scores = await self.store.retrieve_evidence(
            project_id=project_id,
            query=question,
            top_k=top_k,
            min_score=0.5
        )

        # Build context
        context = self._build_context(documents, scores)

        # Generate answer
        answer = await self._generate_answer_with_context(
            question=question,
            context=context
        )

        return {
            "answer": answer,
            "context": context if include_context else [],
            "evidence_count": len(documents),
            "average_relevance": sum(scores) / len(scores) if scores else 0.0,
            "generated_at": datetime.utcnow().isoformat()
        }

    def _build_context(
        self,
        documents: List[Document],
        scores: List[float]
    ) -> List[Dict[str, Any]]:
        """Build context from retrieved documents"""
        context = []

        for doc, score in zip(documents, scores):
            context.append({
                "type": doc.metadata.get("doc_type", "unknown"),
                "content": doc.page_content,
                "relevance": float(score),
                "metadata": {k: v for k, v in doc.metadata.items() if k not in ["doc_type"]}
            })

        # Sort by relevance
        context.sort(key=lambda x: x["relevance"], reverse=True)

        return context

    async def _generate_answer_with_context(
        self,
        question: str,
        context: List[Dict[str, Any]]
    ) -> str:
        """
        Generate an answer using the context

        Uses LangChain's RetrievalQA chain
        """
        if not context:
            return "I couldn't find relevant information to answer this question."

        # Build context text
        context_text = "\n\n".join([
            f"{c['type']}: {c['content']}"
            for c in context[:5]  # Use top 5 for context window
        ])

        # Create prompt template
        template = PromptTemplate(
            input_variables=["context", "question"],
            template="""
Based on the following evidence from the data analysis:

{context}

Answer the user's question:
{question}

Provide a clear, concise answer based on the evidence above.
If the evidence doesn't fully answer the question, acknowledge what's missing.
"""
        )

        # Generate answer
        prompt = template.format(
            context=context_text,
            question=question
        )

        response = await self.llm.ainvoke(prompt)

        return response.content


# ============================================================================
# Evidence Chain Service (Main Interface)
# ============================================================================

class EvidenceChainService:
    """
    Main service for evidence chain management

    Coordinates storage, building, and querying of the evidence chain
    """

    def __init__(self, use_pgvector: bool = True):
        """Initialize the evidence chain service"""
        self.store = EvidenceChainStore(use_pgvector=use_pgvector)
        self.builder = EvidenceChainBuilder(self.store)
        self.answer_generator = RAGAnswerGenerator(self.store)

    def add_document(
        self,
        project_id: str,
        doc_id: str,
        doc_type: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Add a document to the evidence chain"""
        doc = EvidenceDocument(
            doc_id=doc_id,
            doc_type=doc_type,
            content=content,
            metadata=metadata
        )
        return self.store.add_document(project_id, doc)

    def add_link(
        self,
        project_id: str,
        source_type: str,
        source_id: str,
        target_type: str,
        target_id: str,
        link_type: LinkType,
        confidence: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Add a link to the evidence chain"""
        import hashlib
        link_id = hashlib.sha256(
            f"{source_id}_{target_id}_{link_type.value}".encode()
        ).hexdigest()[:16]

        link = EvidenceLink(
            id=link_id,
            project_id=project_id,
            source_type=source_type,
            source_id=source_id,
            target_type=target_type,
            target_id=target_id,
            link_type=link_type,
            confidence=confidence,
            metadata=metadata
        )

        self.store.add_link(link)
        return link_id

    def build_chain_for_question(
        self,
        project_id: str,
        question: str,
        question_id: str,
        mappings: List[QuestionElementMapping],
        transformation_ids: List[str],
        insights: List[Insight]
    ) -> List[EvidenceLink]:
        """Build the complete evidence chain for a question"""
        return self.builder.build_chain_for_question(
            project_id=project_id,
            question=question,
            question_id=question_id,
            mappings=mappings,
            transformation_ids=transformation_ids,
            insights=insights
        )

    async def query_chain(
        self,
        query: EvidenceChainQuery
    ) -> EvidenceChainResponse:
        """
        Query the evidence chain

        Args:
            query: EvidenceChainQuery with filters

        Returns:
            EvidenceChainResponse with chain and answers
        """
        # Retrieve relevant documents
        doc_types = [lt.value for lt in query.link_types] if query.link_types else None

        documents, scores = await self.store.retrieve_evidence(
            project_id=query.project_id,
            query=query.question_id,  # Use question_id as query text
            top_k=10,
            min_score=query.min_confidence,
            doc_types=doc_types
        )

        # Get links for the question
        links = self.store.get_links_for_question(
            project_id=query.project_id,
            question_id=query.question_id
        )

        # Generate answer using RAG
        answer_result = await self.answer_generator.generate_answer(
            project_id=query.project_id,
            question=query.question_id,  # In production, pass question text
            top_k=10
        )

        # Build response
        response = EvidenceChainResponse(
            chain=links,
            answers=[{
                "question_id": query.question_id,
                "answer": answer_result["answer"],
                "confidence": answer_result["average_relevance"]
            }],
            confidence=answer_result["average_relevance"],
            trace_complete=len(links) > 0
        )

        return response

    async def generate_answer(
        self,
        project_id: str,
        question: str
    ) -> Dict[str, Any]:
        """
        Generate an answer to a question using RAG

        Convenience method for simple question answering
        """
        return await self.answer_generator.generate_answer(
            project_id=project_id,
            question=question
        )

    def get_chain_for_project(self, project_id: str) -> List[EvidenceLink]:
        """Get all links in the evidence chain for a project"""
        return self.store.get_links_for_project(project_id)


# ============================================================================
# Singleton Instance
# ============================================================================

_evidence_service: Optional[EvidenceChainService] = None


def get_evidence_chain_service() -> EvidenceChainService:
    """Get the singleton evidence chain service instance"""
    global _evidence_service
    if _evidence_service is None:
        _evidence_service = EvidenceChainService()
    return _evidence_service


# ============================================================================
# Convenience Functions
# ============================================================================

async def create_link(
    project_id: str,
    source_type: str,
    source_id: str,
    target_type: str,
    target_id: str,
    confidence: float = 0.0,
    metadata: Optional[Dict[str, Any]] = None
) -> str:
    """
    Convenience function to create an evidence link

    Args:
        project_id: Project ID
        source_type: Type of source entity
        source_id: ID of source entity
        target_type: Type of target entity
        target_id: ID of target entity
        confidence: Confidence score (0-1)
        metadata: Additional metadata

    Returns:
        Link ID
    """
    service = get_evidence_chain_service()

    # Determine link type
    if source_type == "question" and target_type == "element":
        link_type = LinkType.QUESTION_ELEMENT
    elif source_type == "element" and target_type == "transformation":
        link_type = LinkType.ELEMENT_TRANSFORMATION
    elif source_type == "transformation" and target_type == "insight":
        link_type = LinkType.TRANSFORMATION_INSIGHT
    elif source_type == "question" and target_type == "answer":
        link_type = LinkType.QUESTION_ANSWER
    elif source_type == "insight" and target_type == "answer":
        link_type = LinkType.INSIGHT_ANSWER
    else:
        link_type = LinkType.QUESTION_ELEMENT  # Default

    return service.add_link(
        project_id=project_id,
        source_type=source_type,
        source_id=source_id,
        target_type=target_type,
        target_id=target_id,
        link_type=link_type,
        confidence=confidence,
        metadata=metadata
    )
