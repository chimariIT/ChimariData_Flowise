"""
Knowledge Base Repositories

Handles CRUD operations for knowledge graph, patterns, and feedback.
"""

from typing import Optional, List
from sqlalchemy import select, and_, or_
from .base_repository import BaseRepository
from ..models.database import (
    KnowledgeNode as NodeModel,
    KnowledgeEdge as EdgeModel,
    AnalysisPattern as PatternModel,
    TemplateFeedback as FeedbackModel,
    generate_uuid,
)


class KnowledgeNodeRepository(BaseRepository[NodeModel]):
    """Repository for knowledge node CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self.table_name = "knowledge_nodes"
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Optional[NodeModel]:
        """Convert database record to model instance"""
        if not record:
            return None

        model = NodeModel()
        model.id = record.get("id")
        model.type = record.get("type")
        model.title = record.get("title")
        model.content = record.get("content", {})
        model.source = record.get("source")
        model.confidence = record.get("confidence")
        model.created_at = record.get("created_at")
        model.updated_at = record.get("updated_at")
        model.created_by = record.get("created_by")
        model.is_system = record.get("is_system", False)
        model.metadata = record.get("data_metadata", {})
        return model

    def _model_to_dict(self, model: NodeModel) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "type": model.type,
            "title": model.title,
            "content": model.content,
            "source": model.source,
            "confidence": model.confidence,
            "is_system": model.is_system,
            "created_by": model.created_by,
            "created_at": model.created_at.isoformat() if model.created_at else None,
            "updated_at": model.updated_at.isoformat() if model.updated_at else None,
        }

    async def find_by_id(self, node_id: str) -> Optional[NodeModel]:
        """Find a node by ID"""
        query = select(NodeModel).where(NodeModel.id == node_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_type(
        self,
        node_type: str,
        is_system: Optional[bool] = None,
        limit: int = 100,
    ) -> List[NodeModel]:
        """Get nodes by type"""
        query = select(NodeModel).where(NodeModel.type == node_type)
        if is_system is not None:
            query = and_(query, NodeModel.is_system == is_system)
        query = query.order_by(NodeModel.created_at.desc()).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def search(
        self,
        query: str,
        node_types: Optional[List[str]] = None,
        limit: int = 20,
    ) -> List[NodeModel]:
        """Search knowledge nodes by content"""
        where_clauses = [NodeModel.title.ilike(f"%{query}%")]
        if node_types:
            where_clauses.append(NodeModel.type.in_(node_types))

        query = select(NodeModel).where(and_(*where_clauses)).order_by(
            NodeModel.confidence.desc()
        ).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def create(self, model: NodeModel) -> NodeModel:
        """Create a new knowledge node"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO knowledge_nodes ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def update(self, model: NodeModel) -> Optional[NodeModel]:
        """Update an existing knowledge node"""
        data = self._model_to_dict(model)
        data.pop("id", None)  # Don't update ID
        data.pop("created_at", None)  # Don't update created timestamp
        data.pop("created_by", None)  # Don't update creator

        if not data:
            return model

        set_clauses = [f"{key} = ${i+1}" for i, key in enumerate(data.keys())]
        query = f"""
            UPDATE knowledge_nodes
            SET {", ".join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
            WHERE id = ${len(data) + 1}
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with new values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def delete(self, node_id: str) -> bool:
        """Delete a knowledge node"""
        query = f"DELETE FROM knowledge_nodes WHERE id = $1 RETURNING id"
        result = await self._db_manager.execute(query, node_id)
        return result is not None

    async def count_by_type(self, node_type: str) -> int:
        """Count nodes by type"""
        query = select(NodeModel).where(NodeModel.type == node_type)
        result = await self._db_manager.fetchrow(query)
        return int(result.get("count", 0)) if result else 0


def get_knowledge_node_repository(db_manager=None) -> KnowledgeNodeRepository:
    """Get or create knowledge node repository instance"""
    return KnowledgeNodeRepository(db_manager)


class KnowledgeEdgeRepository(BaseRepository[EdgeModel]):
    """Repository for knowledge edge CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self.table_name = "knowledge_edges"
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Optional[EdgeModel]:
        """Convert database record to model instance"""
        if not record:
            return None

        model = EdgeModel()
        model.id = record.get("id")
        model.from_node_id = record.get("from_node_id")
        model.to_node_id = record.get("to_node_id")
        model.relationship = record.get("relationship")
        model.weight = record.get("weight")
        model.created_at = record.get("created_at")
        return model

    def _model_to_dict(self, model: EdgeModel) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "from_node_id": model.from_node_id,
            "to_node_id": model.to_node_id,
            "relationship": model.relationship,
            "weight": model.weight,
            "created_at": model.created_at.isoformat() if model.created_at else None,
        }

    async def find_by_id(self, edge_id: str) -> Optional[EdgeModel]:
        """Find an edge by ID"""
        query = select(EdgeModel).where(EdgeModel.id == edge_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_nodes(
        self,
        from_node_id: Optional[str] = None,
        to_node_id: Optional[str] = None,
    ) -> list:
        """
        Find edges by node(s)

        If only from_node_id is provided, returns all outgoing edges from that node.
        If both are provided, returns the specific edge between the two nodes.
        """
        if from_node_id and not to_node_id:
            # Get all outgoing edges from a node
            query = select(EdgeModel).where(EdgeModel.from_node_id == from_node_id)
            result = await self._db_manager.fetch(query)
            return [dict(r) for r in result] if result else []

        # Find specific edge between two nodes
        query = select(EdgeModel).where(
            and_(
                EdgeModel.from_node_id == from_node_id,
                EdgeModel.to_node_id == to_node_id
            )
        )
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def create(self, model: EdgeModel) -> EdgeModel:
        """Create a new knowledge edge"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO knowledge_edges ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def delete(self, edge_id: str) -> bool:
        """Delete a knowledge edge"""
        query = f"DELETE FROM knowledge_edges WHERE id = $1 RETURNING id"
        result = await self._db_manager.execute(query, edge_id)
        return result is not None


def get_knowledge_edge_repository(db_manager=None) -> KnowledgeEdgeRepository:
    """Get or create knowledge edge repository instance"""
    return KnowledgeEdgeRepository(db_manager)


class AnalysisPatternRepository(BaseRepository[PatternModel]):
    """Repository for analysis pattern CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self.table_name = "analysis_patterns"
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Optional[PatternModel]:
        """Convert database record to model instance"""
        if not record:
            return None

        model = PatternModel()
        model.id = record.get("id")
        model.name = record.get("name")
        model.analysis_type = record.get("analysis_type")
        model.success_rate = record.get("success_rate")
        model.usage_count = record.get("usage_count")
        model.confidence = record.get("confidence")
        model.parameters = record.get("parameters", {})
        model.created_at = record.get("created_at")
        model.created_by = record.get("created_by")
        model.is_active = record.get("is_active", True)
        return model

    def _model_to_dict(self, model: PatternModel) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "name": model.name,
            "analysis_type": model.analysis_type,
            "success_rate": model.success_rate,
            "usage_count": model.usage_count,
            "confidence": model.confidence,
            "parameters": model.parameters,
            "created_by": model.created_by,
            "created_at": model.created_at.isoformat() if model.created_at else None,
        }

    async def find_by_id(self, pattern_id: str) -> Optional[PatternModel]:
        """Find a pattern by ID"""
        query = select(PatternModel).where(PatternModel.id == pattern_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_type(
        self,
        analysis_type: str,
        limit: int = 20,
    ) -> List[PatternModel]:
        """Get patterns by analysis type"""
        query = select(PatternModel).where(
            and_(PatternModel.analysis_type == analysis_type, PatternModel.is_active == True)
        ).order_by(PatternModel.usage_count.desc()).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def create(self, model: PatternModel) -> PatternModel:
        """Create a new analysis pattern"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO analysis_patterns ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def find_most_used(
        self,
        limit: int = 10,
    ) -> List[PatternModel]:
        """Get most used patterns"""
        query = select(PatternModel).where(
            PatternModel.is_active == True
        ).order_by(PatternModel.usage_count.desc()).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def delete(self, pattern_id: str) -> bool:
        """Delete an analysis pattern"""
        query = f"DELETE FROM analysis_patterns WHERE id = $1 RETURNING id"
        result = await self._db_manager.execute(query, pattern_id)
        return result is not None


def get_analysis_pattern_repository(db_manager=None) -> AnalysisPatternRepository:
    """Get or create analysis pattern repository instance"""
    return AnalysisPatternRepository(db_manager)


class TemplateFeedbackRepository(BaseRepository[FeedbackModel]):
    """Repository for template feedback CRUD operations"""

    def __init__(self, db_manager=None):
        super().__init__()
        self.table_name = "template_feedback"
        self._db_manager = db_manager

    def _record_to_model(self, record: dict) -> Optional[FeedbackModel]:
        """Convert database record to model instance"""
        if not record:
            return None

        model = FeedbackModel()
        model.id = record.get("id")
        model.template_id = record.get("template_id")
        model.user_id = record.get("user_id")
        model.rating = record.get("rating")
        model.feedback_text = record.get("feedback_text")
        model.suggested_improvements = record.get("suggested_improvements")
        model.created_at = record.get("created_at")
        model.is_helpful = record.get("is_helpful", False)
        return model

    def _model_to_dict(self, model: FeedbackModel) -> dict:
        """Convert model instance to dictionary"""
        return {
            "id": model.id,
            "template_id": model.template_id,
            "user_id": model.user_id,
            "rating": model.rating,
            "feedback_text": model.feedback_text,
            "suggested_improvements": model.suggested_improvements,
            "is_helpful": model.is_helpful,
            "created_at": model.created_at.isoformat() if model.created_at else None,
        }

    async def find_by_id(self, feedback_id: str) -> Optional[FeedbackModel]:
        """Find feedback by ID"""
        query = select(FeedbackModel).where(FeedbackModel.id == feedback_id)
        result = await self._db_manager.fetchrow(query)
        return self._record_to_model(result)

    async def find_by_template(
        self,
        template_id: str,
        limit: int = 20,
    ) -> List[FeedbackModel]:
        """Get feedback for a template"""
        query = select(FeedbackModel).where(
            FeedbackModel.template_id == template_id
        ).order_by(FeedbackModel.created_at.desc()).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def find_helpful(self, limit: int = 20) -> List[FeedbackModel]:
        """Get helpful feedback for admin review"""
        query = select(FeedbackModel).where(
            FeedbackModel.is_helpful == True
        ).order_by(FeedbackModel.created_at.desc()).limit(limit)
        result = await self._db_manager.fetch(query)
        return self._record_list_to_model_list(result)

    async def create(self, model: FeedbackModel) -> FeedbackModel:
        """Create new template feedback"""
        if not model.id:
            model.id = generate_uuid()

        data = self._model_to_dict(model)
        columns = ", ".join(data.keys())
        placeholders = ", ".join(f"${i+1}" for i in range(len(data)))

        query = f"""
            INSERT INTO template_feedback ({columns})
            VALUES ({placeholders})
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, *data.values())

        # Update model with generated values
        for key, value in data.items():
            setattr(model, key, value)

        return self._record_to_model(result)

    async def mark_helpful(self, feedback_id: str, is_helpful: bool) -> Optional[FeedbackModel]:
        """Mark feedback as helpful or not"""
        query = f"""
            UPDATE template_feedback
            SET is_helpful = $1, updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
            RETURNING *
        """
        result = await self._db_manager.fetchrow(query, is_helpful, feedback_id)

        # Update model if found
        if result:
            model = self._record_to_model(result)
            setattr(model, "is_helpful", is_helpful)

        return self._record_to_model(result) if result else None


def get_template_feedback_repository(db_manager=None) -> TemplateFeedbackRepository:
    """Get or create template feedback repository instance"""
    return TemplateFeedbackRepository(db_manager)
