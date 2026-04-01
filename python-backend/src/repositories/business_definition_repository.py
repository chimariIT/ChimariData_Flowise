"""
Business Definition Repository

Handles business metric/formula definition database operations.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class BusinessDefinition(BaseRepository):
    """Business Definition model"""

    def __init__(self):
        super().__init__()
        self.table_name = "business_definitions"
        self.id_field = "id"

    id: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    formula: Optional[str] = None
    source_columns: Optional[List[str]] = None
    category: Optional[str] = None
    industry: Optional[str] = None
    created_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['BusinessDefinition']:
        """Convert database record to BusinessDefinition model"""
        if record is None:
            return None

        definition = BusinessDefinition()
        definition.id = record.get('id')
        definition.name = record.get('name')
        definition.description = record.get('description')
        definition.formula = record.get('formula')
        definition.source_columns = jsonb_loads(record.get('source_columns'))
        definition.category = record.get('category')
        definition.industry = record.get('industry')
        definition.created_at = record.get('created_at')
        return definition

    def _model_to_dict(self, model: 'BusinessDefinition') -> Dict[str, Any]:
        """Convert BusinessDefinition model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'name': model.name,
            'description': model.description,
            'formula': model.formula,
            'source_columns': jsonb_dumps(model.source_columns),
            'category': model.category,
            'industry': model.industry,
            'created_at': model.created_at
        }


class BusinessDefinitionRepository(BaseRepository[BusinessDefinition]):
    """Repository for business definition operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "business_definitions"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[BusinessDefinition]:
        """Convert database record to BusinessDefinition model"""
        if record is None:
            return None

        definition = BusinessDefinition()
        definition.id = record.get('id')
        definition.name = record.get('name')
        definition.description = record.get('description')
        definition.formula = record.get('formula')
        definition.source_columns = jsonb_loads(record.get('source_columns'))
        definition.category = record.get('category')
        definition.industry = record.get('industry')
        definition.created_at = record.get('created_at')
        return definition

    def _model_to_dict(self, model: BusinessDefinition) -> Dict[str, Any]:
        """Convert BusinessDefinition model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'name': model.name,
            'description': model.description,
            'formula': model.formula,
            'source_columns': jsonb_dumps(model.source_columns),
            'category': model.category,
            'industry': model.industry,
            'created_at': model.created_at
        }

    async def find_by_name(self, name: str) -> Optional[BusinessDefinition]:
        """Find a business definition by name"""
        query = "SELECT * FROM business_definitions WHERE name = $1"
        record = await self._db_manager.fetchrow(query, name)
        return self._record_to_model(record)

    async def search_by_name(
        self,
        search_term: str,
        limit: int = 20
    ) -> List[BusinessDefinition]:
        """Search business definitions by name"""
        term = f"%{search_term}%"
        query = """
            SELECT * FROM business_definitions
            WHERE name ILIKE $1
            ORDER BY name
            LIMIT $2
        """
        records = await self._db_manager.fetch(query, term, limit)
        return [self._record_to_model(r) for r in records]

    async def find_by_category(
        self,
        category: str,
        limit: Optional[int] = None
    ) -> List[BusinessDefinition]:
        """Find business definitions by category"""
        if limit:
            query = "SELECT * FROM business_definitions WHERE category = $1 LIMIT $2"
            records = await self._db_manager.fetch(query, category, limit)
        else:
            query = "SELECT * FROM business_definitions WHERE category = $1"
            records = await self._db_manager.fetch(query, category)

        return [self._record_to_model(r) for r in records]

    async def find_by_industry(
        self,
        industry: str,
        limit: Optional[int] = None
    ) -> List[BusinessDefinition]:
        """Find business definitions by industry"""
        if limit:
            query = "SELECT * FROM business_definitions WHERE industry = $1 LIMIT $2"
            records = await self._db_manager.fetch(query, industry, limit)
        else:
            query = "SELECT * FROM business_definitions WHERE industry = $1"
            records = await self._db_manager.fetch(query, industry)

        return [self._record_to_model(r) for r in records]

    async def find_applicable(
        self,
        columns: List[str],
        limit: int = 20
    ) -> List[BusinessDefinition]:
        """Find business definitions applicable to given columns"""
        if not columns:
            return []

        # Find definitions that can be applied based on source columns
        query = """
            SELECT * FROM business_definitions
            WHERE source_columns IS NOT NULL
            ORDER BY name
            LIMIT $1
        """
        records = await self._db_manager.fetch(query, limit)

        # Filter by matching columns
        applicable = []
        for record in records:
            definition = self._record_to_model(record)
            if definition and definition.source_columns:
                # Check if any of the required columns are present
                for src_col in definition.source_columns:
                    if any(src_col.lower() in col.lower() for col in columns):
                        applicable.append(definition)
                        break

        return applicable

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_business_definition_repository(db_manager=None) -> BusinessDefinitionRepository:
    """Get or create business definition repository instance"""
    return BusinessDefinitionRepository()
