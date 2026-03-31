"""
Knowledge Base Service

Service for managing knowledge graph, analysis patterns, and template feedback.
This enables the Customer Support Agent to:
- Query industry knowledge
- Retrieve analysis patterns
- Store and retrieve feedback
- Support semantic search of knowledge
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from ..repositories.knowledge_node_repository import (
    get_knowledge_node_repository,
    get_knowledge_edge_repository,
    get_analysis_pattern_repository,
    get_template_feedback_repository,
)
from ..models.database import db_manager


class KnowledgeService:
    """
    Knowledge base service for agentic platform

    Provides:
    - Knowledge graph query (nodes and edges)
    - Analysis pattern management
    - Template feedback collection
    - Knowledge base seeding
    - Semantic search capabilities
    """

    def __init__(
        self,
        node_repo: Optional["KnowledgeNodeRepository"] = None,
        edge_repo: Optional["KnowledgeEdgeRepository"] = None,
        pattern_repo: Optional["AnalysisPatternRepository"] = None,
        feedback_repo: Optional["TemplateFeedbackRepository"] = None,
    ):
        self.node_repo = node_repo or get_knowledge_node_repository(db_manager)
        self.edge_repo = edge_repo or get_knowledge_edge_repository(db_manager)
        self.pattern_repo = pattern_repo or get_analysis_pattern_repository(db_manager)
        self.feedback_repo = feedback_repo or get_template_feedback_repository(db_manager)

    # ========================================================================
    # Knowledge Graph Operations
    # ========================================================================

    async def search_knowledge(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Search knowledge graph by semantic similarity

        Args:
            query: Search query text
            limit: Maximum number of results
            node_types: Optional list of node types to filter

        Returns:
            List of matching knowledge nodes with relevance scores
        """
        # For now, do simple text matching on titles
        nodes = await self.node_repo.search(query, limit=limit)

        # Add semantic matching would be done with embeddings in production
        results = []
        for node in nodes:
            results.append({
                "id": node["id"],
                "type": node["type"],
                "title": node["title"],
                "content": node.get("content", {}),
                "confidence": node.get("confidence", 1.0),
                "relevance": 1.0,  # Placeholder for semantic relevance
            })

        return results

    async def get_related_nodes(self, node_id: str, max_depth: int = 2) -> List[Dict[str, Any]]:
        """
        Get nodes related to a given node via the knowledge graph

        Args:
            node_id: ID of the starting node
            max_depth: Maximum depth to traverse

        Returns:
            List of related nodes in graph structure
        """
        # Get outgoing edges
        edges = await self.edge_repo.find_by_nodes(from_node_id=node_id)

        # Build graph structure
        related_nodes = []
        seen = {node_id}

        for edge in edges:
            to_id = edge["to_node_id"]

            if to_id not in seen:
                related_nodes.append({
                    "id": to_id,
                    "relationship": edge["relationship"],
                    "distance": 1
                })
                seen[to_id] = True

                # Add more nodes if within depth
                if len(related_nodes) < max_depth:
                    more_nodes = await self.get_related_nodes(to_id, max_depth - 1)
                    for node in more_nodes:
                        if node["id"] not in seen:
                            related_nodes.append({
                                "id": node["id"],
                                "relationship": "connected",
                                "distance": 2
                            })
                            seen[node["id"]] = True

        return related_nodes

    async def get_analysis_pattern(
        self,
        analysis_type: str,
        name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific analysis pattern by type and name

        Args:
            analysis_type: Type of analysis (correlation, regression, etc.)
            name: Optional name filter

        Returns:
            Analysis pattern or None
        """
        patterns = await self.pattern_repo.find_by_type(analysis_type, limit=20)

        # Filter by name if provided
        if name:
            patterns = [p for p in patterns if p.get("name") == name]

        return patterns[0] if patterns else None

    async def learn_from_analysis(
        self,
        analysis_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Learn a new analysis pattern from successful analysis results

        Args:
            analysis_data: Analysis result data

        Returns:
            Created pattern ID and learning metrics
        """
        # Extract pattern characteristics
        pattern_name = analysis_data.get("name", "custom_pattern")
        analysis_type = analysis_data.get("analysis_type")

        # Calculate success rate (would come from historical data)
        success_rate = 0.8  # Placeholder - would be calculated from usage

        # Create pattern record
        from ..models.database import generate_uuid
        pattern_id = generate_uuid()

        pattern_data = {
            "name": pattern_name,
            "analysis_type": analysis_type,
            "success_rate": success_rate,
            "usage_count": 1,
            "parameters": analysis_data.get("parameters", {}),
            "confidence": 1.0,
        }

        # In production, this would:
        # 1. Store the pattern in the database
        # 2. Extract common parameters from multiple runs
        # 3. Update the pattern as more confidence builds

        from ..repositories.knowledge_node_repository import get_analysis_pattern_repository
        pattern_repo = get_analysis_pattern_repository(db_manager)
        pattern = await pattern_repo.create(pattern_data)

        return {
            "pattern_id": pattern_id,
            "name": pattern_name,
            "success_rate": success_rate,
            "message": "Analysis pattern created",
        }

    # ========================================================================
    # Template Feedback Operations
    # ========================================================================

    async def add_feedback(
        self,
        template_id: str,
        user_id: str,
        rating: int,
        feedback_text: str,
        suggested_improvements: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Add user feedback for a template

        Args:
            template_id: ID of the template
            user_id: ID of the user providing feedback
            rating: 1-5 star rating
            feedback_text: User's feedback
            suggested_improvements: Optional suggestions

        Returns:
            Created feedback record
        """
        from ..models.database import TemplateFeedback

        feedback = TemplateFeedback()
        feedback.template_id = template_id
        feedback.user_id = user_id
        feedback.rating = rating
        feedback.feedback_text = feedback_text
        feedback.suggested_improvements = suggested_improvements or ""

        from ..repositories.knowledge_node_repository import get_template_feedback_repository
        feedback_repo = get_template_feedback_repository(db_manager)
        result = await feedback_repo.create(feedback)

        return {
            "feedback_id": result["id"],
            "template_id": template_id,
            "rating": rating,
            "message": "Feedback recorded successfully",
        }

    async def get_template_feedback(
        self,
        template_id: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Get all feedback for a template

        Args:
            template_id: ID of the template
            limit: Maximum number of feedback records

        Returns:
            List of feedback records
        """
        from ..repositories.knowledge_node_repository import get_template_feedback_repository
        feedback_repo = get_template_feedback_repository(db_manager)
        feedback_records = await feedback_repo.find_by_template(template_id, limit=limit)

        return [self._feedback_to_dict(r) for r in feedback_records]

    async def get_helpful_feedback(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get helpful feedback for admin review

        Args:
            limit: Maximum number of feedback records

        Returns:
            List of helpful feedback records
        """
        from ..repositories.knowledge_node_repository import get_template_feedback_repository
        feedback_repo = get_template_feedback_repository(db_manager)
        feedback_records = await feedback_repo.find_helpful(limit=limit)

        return [self._feedback_to_dict(r) for r in feedback_records]

    def _feedback_to_dict(self, feedback: TemplateFeedback) -> Dict[str, Any]:
        """Convert feedback model to dictionary"""
        return {
            "id": feedback.id,
            "template_id": feedback.template_id,
            "user_id": feedback.user_id,
            "rating": feedback.rating,
            "feedback_text": feedback.feedback_text,
            "suggested_improvements": feedback.suggested_improvements,
            "is_helpful": feedback.is_helpful,
            "created_at": feedback.created_at.isoformat() if feedback.created_at else None,
        }

    # ========================================================================
    # Knowledge Base Seeding
    # ========================================================================

    async def seed_knowledge_base(self) -> Dict[str, Any]:
        """
        Seed knowledge base with initial industry knowledge

        Returns:
            Seeding statistics
        """
        # In production, this would:
        # 1. Load industry knowledge from YAML files
        # 2. Load analysis patterns from successful analyses
        # 3. Create knowledge nodes
        # 4. Create knowledge edges

        nodes_created = 0
        edges_created = 0
        patterns_created = 0

        # Seed industry-specific knowledge
        # For now, return summary
        return {
            "nodes_created": nodes_created,
            "edges_created": edges_created,
            "patterns_created": patterns_created,
            "message": "Knowledge base seeding placeholder - requires industry knowledge files",
        }


# Singleton instance
_knowledge_service_instance: Optional[KnowledgeService] = None


def get_knowledge_service() -> KnowledgeService:
    """Get or create knowledge service singleton instance"""
    global _knowledge_service_instance
    if _knowledge_service_instance is None:
        _knowledge_service_instance = KnowledgeService()
    return _knowledge_service_instance
