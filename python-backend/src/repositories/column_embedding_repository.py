"""
Column Embedding Repository

Handles column embedding database operations for semantic matching.
"""

from typing import Optional, List, Dict, Any
from datetime import datetime

from .base_repository import BaseRepository
from ..models.database import jsonb_dumps, jsonb_loads


class ColumnEmbedding(BaseRepository):
    """Column Embedding model"""

    def __init__(self):
        super().__init__()
        self.table_name = "column_embeddings"
        self.id_field = "id"

    id: Optional[str] = None
    dataset_id: Optional[str] = None
    column_name: Optional[str] = None
    embedding: Optional[List[float]] = None
    embedding_model: Optional[str] = None
    created_at: Optional[datetime] = None

    def _record_to_model(self, record) -> Optional['ColumnEmbedding']:
        """Convert database record to ColumnEmbedding model"""
        if record is None:
            return None

        col_emb = ColumnEmbedding()
        col_emb.id = record.get('id')
        col_emb.dataset_id = record.get('dataset_id')
        col_emb.column_name = record.get('column_name')
        col_emb.embedding = jsonb_loads(record.get('embedding'))
        col_emb.embedding_model = record.get('embedding_model')
        col_emb.created_at = record.get('created_at')
        return col_emb

    def _model_to_dict(self, model: 'ColumnEmbedding') -> Dict[str, Any]:
        """Convert ColumnEmbedding model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'dataset_id': model.dataset_id,
            'column_name': model.column_name,
            'embedding': jsonb_dumps(model.embedding),
            'embedding_model': model.embedding_model,
            'created_at': model.created_at
        }


class ColumnEmbeddingRepository(BaseRepository[ColumnEmbedding]):
    """Repository for column embedding operations"""

    def __init__(self):
        super().__init__()
        self.table_name = "column_embeddings"
        self.id_field = "id"

    def _record_to_model(self, record) -> Optional[ColumnEmbedding]:
        """Convert database record to ColumnEmbedding model"""
        if record is None:
            return None

        col_emb = ColumnEmbedding()
        col_emb.id = record.get('id')
        col_emb.dataset_id = record.get('dataset_id')
        col_emb.column_name = record.get('column_name')
        col_emb.embedding = jsonb_loads(record.get('embedding'))
        col_emb.embedding_model = record.get('embedding_model')
        col_emb.created_at = record.get('created_at')
        return col_emb

    def _model_to_dict(self, model: ColumnEmbedding) -> Dict[str, Any]:
        """Convert ColumnEmbedding model to dictionary"""
        from ..models.database import jsonb_dumps
        return {
            'id': model.id,
            'dataset_id': model.dataset_id,
            'column_name': model.column_name,
            'embedding': jsonb_dumps(model.embedding),
            'embedding_model': model.embedding_model,
            'created_at': model.created_at
        }

    async def find_by_dataset_id(
        self,
        dataset_id: str,
        limit: Optional[int] = None
    ) -> List[ColumnEmbedding]:
        """Find all column embeddings for a dataset"""
        if limit:
            query = "SELECT * FROM column_embeddings WHERE dataset_id = $1 LIMIT $2"
            records = await self._db_manager.fetch(query, dataset_id, limit)
        else:
            query = "SELECT * FROM column_embeddings WHERE dataset_id = $1"
            records = await self._db_manager.fetch(query, dataset_id)

        return [self._record_to_model(r) for r in records]

    async def find_by_dataset_and_column(
        self,
        dataset_id: str,
        column_name: str
    ) -> Optional[ColumnEmbedding]:
        """Find column embedding by dataset and column name"""
        query = """
            SELECT * FROM column_embeddings
            WHERE dataset_id = $1 AND column_name = $2
        """
        record = await self._db_manager.fetchrow(query, dataset_id, column_name)
        return self._record_to_model(record)

    async def find_by_model(
        self,
        embedding_model: str,
        limit: int = 100
    ) -> List[ColumnEmbedding]:
        """Find column embeddings by model"""
        query = """
            SELECT * FROM column_embeddings
            WHERE embedding_model = $1
            ORDER BY created_at DESC
            LIMIT $2
        """
        records = await self._db_manager.fetch(query, embedding_model, limit)
        return [self._record_to_model(r) for r in records]

    async def search_similar_columns(
        self,
        query_embedding: List[float],
        dataset_id: Optional[str] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Search for columns with similar embeddings
        Uses cosine similarity

        Args:
            query_embedding: Query embedding vector
            dataset_id: Optional dataset filter
            limit: Maximum results

        Returns:
            List of columns with similarity scores
        """
        # This is a simplified implementation
        # In production, would use pgvector's cosine distance

        base_query = """
            SELECT id, dataset_id, column_name, embedding, embedding_model
            FROM column_embeddings
        """

        params = []
        if dataset_id:
            base_query += " WHERE dataset_id = $1"
            params.append(dataset_id)
        else:
            base_query += " WHERE dataset_id IS NOT NULL"

        query = base_query + f" LIMIT {limit * 10}"  # Get more for calculation
        records = await self._db_manager.fetch(query, *params)

        # Calculate cosine similarity
        import numpy as np

        results = []
        query_vec = np.array(query_embedding)

        for record in records:
            emb = record.get('embedding')
            if emb:
                emb_vec = np.array(emb)

                # Cosine similarity
                dot_product = np.dot(query_vec, emb_vec)
                norm_a = np.linalg.norm(query_vec)
                norm_b = np.linalg.norm(emb_vec)

                if norm_a > 0 and norm_b > 0:
                    similarity = float(dot_product / (norm_a * norm_b))
                else:
                    similarity = 0.0

                results.append({
                    'id': record.get('id'),
                    'dataset_id': record.get('dataset_id'),
                    'column_name': record.get('column_name'),
                    'similarity': similarity
                })

        # Sort by similarity and limit
        results.sort(key=lambda x: x['similarity'], reverse=True)
        return results[:limit]

    async def delete_by_dataset(self, dataset_id: str) -> int:
        """Delete all embeddings for a dataset"""
        query = "DELETE FROM column_embeddings WHERE dataset_id = $1"
        result = await self._db_manager.execute(query, dataset_id)
        return int(result.split()[1]) if result else 0

    async def update_embedding(
        self,
        dataset_id: str,
        column_name: str,
        embedding: List[float],
        embedding_model: str
    ) -> Optional[ColumnEmbedding]:
        """Update or create column embedding"""
        from ..models.database import jsonb_dumps, generate_uuid

        # Try to find existing
        existing = await self.find_by_dataset_and_column(dataset_id, column_name)

        if existing:
            # Update existing
            return await self.update(existing.id, {
                'embedding': jsonb_dumps(embedding),
                'embedding_model': embedding_model
            })
        else:
            # Create new
            col_emb = ColumnEmbedding()
            col_emb.id = generate_uuid()
            col_emb.dataset_id = dataset_id
            col_emb.column_name = column_name
            col_emb.embedding = embedding
            col_emb.embedding_model = embedding_model
            col_emb.created_at = datetime.utcnow()

            return await self.create(col_emb)

    @property
    def _db_manager(self):
        """Get database manager"""
        from ..models.database import db_manager
        return db_manager

def get_column_embedding_repository(db_manager=None) -> ColumnEmbeddingRepository:
    """Get or create column embedding repository instance"""
    return ColumnEmbeddingRepository()
