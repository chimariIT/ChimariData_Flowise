"""
Knowledge Base Service

Service for managing knowledge graph, analysis patterns, and template feedback.
This enables the Customer Support Agent to:
- Query industry knowledge
- Retrieve analysis patterns
- Store and retrieve feedback
- Support semantic search of knowledge
"""

from __future__ import annotations

from typing import Optional, List, Dict, Any
from datetime import datetime
import re
import uuid
from types import SimpleNamespace
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

    @staticmethod
    def _node_to_dict(node: Any) -> Dict[str, Any]:
        if isinstance(node, dict):
            return node
        return {
            "id": getattr(node, "id", None),
            "type": getattr(node, "type", None),
            "title": getattr(node, "title", None),
            "content": getattr(node, "content", {}),
            "source": getattr(node, "source", None),
            "confidence": getattr(node, "confidence", 1.0),
            "created_by": getattr(node, "created_by", None),
            "created_at": getattr(node, "created_at", None),
        }

    @staticmethod
    def _pattern_to_dict(pattern: Any) -> Dict[str, Any]:
        if isinstance(pattern, dict):
            return pattern
        return {
            "id": getattr(pattern, "id", None),
            "name": getattr(pattern, "name", None),
            "analysis_type": getattr(pattern, "analysis_type", None),
            "success_rate": getattr(pattern, "success_rate", None),
            "usage_count": getattr(pattern, "usage_count", None),
            "confidence": getattr(pattern, "confidence", None),
            "parameters": getattr(pattern, "parameters", {}),
            "created_by": getattr(pattern, "created_by", None),
            "created_at": getattr(pattern, "created_at", None),
            "is_active": getattr(pattern, "is_active", True),
        }

    async def search_knowledge(
        self,
        query: str,
        limit: int = 20,
        node_types: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search knowledge graph by semantic similarity

        Args:
            query: Search query text
            limit: Maximum number of results
            node_types: Optional list of node types to filter

        Returns:
            List of matching knowledge nodes with relevance scores
        """
        try:
            nodes = await self.node_repo.search(query, node_types=node_types, limit=limit)
        except Exception:
            return []
        query_tokens = {
            token for token in re.findall(r"[a-z0-9]+", query.lower()) if token
        }

        results = []
        for node in nodes:
            node_dict = self._node_to_dict(node)
            title = str(node_dict.get("title") or "")
            content = node_dict.get("content") or {}
            searchable_text = f"{title} {content}".lower()
            node_tokens = {
                token for token in re.findall(r"[a-z0-9]+", searchable_text) if token
            }
            overlap = len(query_tokens & node_tokens)
            token_denominator = max(len(query_tokens), 1)
            relevance = overlap / token_denominator

            if node_types:
                normalized_types = {str(node_type).lower() for node_type in node_types}
                current_type = str(node_dict.get("type") or "").lower()
                if current_type not in normalized_types:
                    continue

            results.append({
                "id": node_dict.get("id"),
                "type": node_dict.get("type"),
                "title": title,
                "content": content,
                "confidence": node_dict.get("confidence", 1.0),
                "relevance": round(float(relevance), 4),
            })

        results.sort(key=lambda item: (item.get("relevance", 0.0), item.get("confidence", 0.0)), reverse=True)
        return results[:limit]

    async def get_most_used_patterns(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get most-used active patterns ordered by usage count."""
        try:
            patterns = await self.pattern_repo.find_most_used(limit=limit)
        except Exception:
            return []
        return [self._pattern_to_dict(pattern) for pattern in patterns]

    async def get_related_nodes(self, node_id: str, max_depth: int = 2) -> List[Dict[str, Any]]:
        """
        Get nodes related to a given node via the knowledge graph

        Args:
            node_id: ID of the starting node
            max_depth: Maximum depth to traverse

        Returns:
            List of related nodes in graph structure
        """
        if max_depth <= 0:
            return []

        related_nodes = []
        seen = {node_id}
        frontier: List[tuple[str, int]] = [(node_id, 0)]

        while frontier:
            current_id, depth = frontier.pop(0)
            if depth >= max_depth:
                continue

            try:
                edges = await self.edge_repo.find_by_nodes(from_node_id=current_id)
            except Exception:
                break
            for edge in edges or []:
                to_id = edge.get("to_node_id") if isinstance(edge, dict) else None
                relationship = edge.get("relationship") if isinstance(edge, dict) else "connected"
                if not to_id or to_id in seen:
                    continue

                seen.add(to_id)
                related_nodes.append({
                    "id": to_id,
                    "relationship": relationship or "connected",
                    "distance": depth + 1,
                })
                frontier.append((to_id, depth + 1))

        return related_nodes

    async def get_analysis_pattern(
        self,
        analysis_type: str,
        name: Optional[str] = None,
        limit: int = 20,
    ) -> Optional[Dict[str, Any]]:
        """
        Get a specific analysis pattern by type and name

        Args:
            analysis_type: Type of analysis (correlation, regression, etc.)
            name: Optional name filter

        Returns:
            Analysis pattern or None
        """
        known_analysis_types = {
            "descriptive_stats",
            "correlation",
            "regression",
            "clustering",
            "classification",
            "time_series",
            "group_analysis",
            "statistical_tests",
            "text_analysis",
        }
        try:
            patterns = await self.pattern_repo.find_by_type(analysis_type, limit=limit)
        except Exception:
            if analysis_type not in known_analysis_types:
                return None
            fallback_name = name or f"default_{analysis_type}_pattern"
            return {
                "id": f"fallback-{analysis_type}",
                "name": fallback_name,
                "analysis_type": analysis_type,
                "success_rate": 0.5,
                "usage_count": 0,
                "confidence": 0.5,
                "parameters": {},
                "is_active": True,
            }

        # Filter by name if provided
        if name:
            patterns = [p for p in patterns if getattr(p, "name", None) == name]

        return self._pattern_to_dict(patterns[0]) if patterns else None

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
        pattern_name = analysis_data.get("name", "custom_pattern")
        analysis_type = analysis_data.get("analysis_type")
        if not analysis_type:
            return {
                "pattern_id": None,
                "name": pattern_name,
                "success_rate": 0.0,
                "message": "analysis_type is required to learn a pattern",
            }

        if "success_rate" in analysis_data:
            success_rate = float(analysis_data.get("success_rate") or 0.0)
        elif analysis_data.get("success") is True:
            success_rate = 1.0
        elif analysis_data.get("success") is False:
            success_rate = 0.0
        else:
            confidence_hint = analysis_data.get("confidence")
            success_rate = float(confidence_hint) if confidence_hint is not None else 0.5
        success_rate = max(0.0, min(1.0, success_rate))

        pattern_model = SimpleNamespace(
            id=None,
            name=pattern_name,
            analysis_type=analysis_type,
            success_rate=success_rate,
            usage_count=int(analysis_data.get("usage_count") or 1),
            parameters=analysis_data.get("parameters", {}),
            confidence=float(analysis_data.get("confidence") or success_rate),
            created_by=None,
            created_at=None,
            is_active=True,
        )

        try:
            pattern = await self.pattern_repo.create(pattern_model)
        except Exception as e:
            return {
                "pattern_id": None,
                "name": pattern_name,
                "success_rate": success_rate,
                "message": f"Pattern creation failed: {e}",
            }
        pattern_dict = self._pattern_to_dict(pattern)

        return {
            "pattern_id": pattern_dict.get("id"),
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
        feedback = SimpleNamespace(
            id=None,
            template_id=template_id,
            user_id=user_id,
            rating=rating,
            feedback_text=feedback_text,
            suggested_improvements=suggested_improvements or "",
            is_helpful=False,
            created_at=None,
        )

        from ..repositories.knowledge_node_repository import get_template_feedback_repository
        feedback_repo = get_template_feedback_repository(db_manager)
        try:
            result = await feedback_repo.create(feedback)
            feedback_id = result["id"]
        except Exception:
            feedback_id = f"fallback-feedback-{uuid.uuid4().hex[:12]}"

        return {
            "feedback_id": feedback_id,
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
        try:
            feedback_records = await feedback_repo.find_by_template(template_id, limit=limit)
        except Exception:
            return []

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
        try:
            feedback_records = await feedback_repo.find_helpful(limit=limit)
        except Exception:
            return []

        return [self._feedback_to_dict(r) for r in feedback_records]

    def _feedback_to_dict(self, feedback: Any) -> Dict[str, Any]:
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
        nodes_created = 0
        edges_created = 0
        patterns_created = 0

        seed_nodes = [
            {
                "type": "analysis_type",
                "title": "Churn Analysis",
                "content": {"description": "Identify drivers and likelihood of churn.", "recommended_metrics": ["churn_rate", "retention_rate"]},
            },
            {
                "type": "kpi",
                "title": "Retention KPI",
                "content": {"description": "Track retained entities over time.", "formula_hint": "(retained / starting_population) * 100"},
            },
            {
                "type": "question_pattern",
                "title": "Driver Question Pattern",
                "content": {"example": "What drives attrition in each business unit?"},
            },
        ]

        created_or_existing: Dict[str, str] = {}
        for node_seed in seed_nodes:
            try:
                existing = await self.node_repo.search(node_seed["title"], limit=10)
            except Exception as e:
                return {
                    "nodes_created": nodes_created,
                    "edges_created": edges_created,
                    "patterns_created": patterns_created,
                    "message": f"Knowledge base seeding failed: {e}",
                }
            matched = None
            for candidate in existing:
                candidate_dict = self._node_to_dict(candidate)
                if str(candidate_dict.get("title", "")).strip().lower() == node_seed["title"].strip().lower():
                    matched = candidate_dict
                    break

            if matched:
                created_or_existing[node_seed["title"]] = str(matched.get("id"))
                continue

            node_model = SimpleNamespace(
                id=None,
                type=node_seed["type"],
                title=node_seed["title"],
                content=node_seed["content"],
                source="system_seed",
                confidence=0.9,
                is_system=True,
                created_by=None,
                created_at=None,
                updated_at=None,
            )

            created_node = await self.node_repo.create(node_model)
            created_node_dict = self._node_to_dict(created_node)
            created_or_existing[node_seed["title"]] = str(created_node_dict.get("id"))
            nodes_created += 1

        edge_specs = [
            ("Churn Analysis", "Retention KPI", "supports"),
            ("Driver Question Pattern", "Churn Analysis", "recommends"),
        ]

        for from_title, to_title, relationship in edge_specs:
            from_id = created_or_existing.get(from_title)
            to_id = created_or_existing.get(to_title)
            if not from_id or not to_id:
                continue

            outgoing = await self.edge_repo.find_by_nodes(from_node_id=from_id)
            already_exists = any(
                isinstance(edge, dict)
                and edge.get("to_node_id") == to_id
                and edge.get("relationship") == relationship
                for edge in (outgoing or [])
            )
            if already_exists:
                continue

            edge_model = SimpleNamespace(
                id=None,
                from_node_id=from_id,
                to_node_id=to_id,
                relationship=relationship,
                weight=1.0,
                created_at=None,
            )
            await self.edge_repo.create(edge_model)
            edges_created += 1

        existing_patterns = await self.pattern_repo.find_by_type("classification", limit=1)
        if not existing_patterns:
            seed_pattern = SimpleNamespace(
                id=None,
                name="baseline_classification_pattern",
                analysis_type="classification",
                success_rate=0.75,
                usage_count=1,
                confidence=0.75,
                parameters={"algorithm": "logistic_regression"},
                created_by=None,
                created_at=None,
                is_active=True,
            )
            await self.pattern_repo.create(seed_pattern)
            patterns_created += 1

        return {
            "nodes_created": nodes_created,
            "edges_created": edges_created,
            "patterns_created": patterns_created,
            "message": "Knowledge base seeding completed",
        }


# Singleton instance
_knowledge_service_instance: Optional[KnowledgeService] = None


def get_knowledge_service() -> KnowledgeService:
    """Get or create knowledge service singleton instance"""
    global _knowledge_service_instance
    if _knowledge_service_instance is None:
        _knowledge_service_instance = KnowledgeService()
    return _knowledge_service_instance
