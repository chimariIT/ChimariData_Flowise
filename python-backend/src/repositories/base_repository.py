"""
Base Repository

Provides common database operations for all repositories.
"""

import logging
from typing import Optional, List, Dict, Any, TypeVar, Generic
from abc import ABC, abstractmethod

from ..models.database import db_manager, record_to_dict, records_to_list, generate_uuid

logger = logging.getLogger(__name__)


T = TypeVar('T')


class BaseRepository(Generic[T], ABC):
    """Base repository with common CRUD operations"""

    def __init__(self):
        self.table_name: str = ""
        self.id_field: str = "id"

    @abstractmethod
    def _record_to_model(self, record) -> Optional[T]:
        """Convert a database record to a model instance"""
        pass

    @abstractmethod
    def _model_to_dict(self, model: T) -> Dict[str, Any]:
        """Convert a model instance to a dictionary"""
        pass

    def _record_list_to_model_list(self, records: List) -> List[T]:
        """Convert a list of database records to model instances"""
        return [self._record_to_model(r) for r in records if r]

    async def find_by_id(self, id: str) -> Optional[T]:
        """
        Find a record by ID

        Args:
            id: Record ID

        Returns:
            Model instance or None
        """
        query = f"SELECT * FROM {self.table_name} WHERE {self.id_field} = $1"
        record = await db_manager.fetchrow(query, id)
        return self._record_to_model(record)

    async def find_all(
        self,
        limit: Optional[int] = None,
        offset: int = 0
    ) -> List[T]:
        """
        Find all records

        Args:
            limit: Maximum number of records
            offset: Number of records to skip

        Returns:
            List of model instances
        """
        query = f"SELECT * FROM {self.table_name}"
        params = []

        if limit:
            query += " LIMIT $1"
            params.append(limit)

        if offset > 0:
            if limit:
                query += " OFFSET $2"
            else:
                query += " OFFSET $1"
            params.append(offset)

        records = await db_manager.fetch(query, *params)
        return [self._record_to_model(r) for r in records]

    async def find_where(
        self,
        conditions: Dict[str, Any],
        limit: Optional[int] = None
    ) -> List[T]:
        """
        Find records matching conditions

        Args:
            conditions: Dictionary of field=value pairs
            limit: Maximum number of records

        Returns:
            List of model instances
        """
        if not conditions:
            return await self.find_all(limit)

        # Build WHERE clause
        where_clauses = []
        params = []
        for i, (field, value) in enumerate(conditions.items()):
            where_clauses.append(f"{field} = ${i + 1}")
            params.append(value)

        query = f"SELECT * FROM {self.table_name} WHERE {' AND '.join(where_clauses)}"

        if limit:
            query += f" LIMIT ${len(params) + 1}"
            params.append(limit)

        records = await db_manager.fetch(query, *params)
        return [self._record_to_model(r) for r in records]

    async def create(self, model: T) -> Optional[T]:
        """
        Create a new record

        Args:
            model: Model instance to create

        Returns:
            Created model instance with ID
        """
        data = self._model_to_dict(model)

        # Generate ID if not present
        if self.id_field not in data or not data[self.id_field]:
            data[self.id_field] = generate_uuid()

        # Build INSERT query
        columns = list(data.keys())
        placeholders = [f"${i+1}" for i in range(len(columns))]
        values = list(data.values())

        query = f"""
            INSERT INTO {self.table_name} ({', '.join(columns)})
            VALUES ({', '.join(placeholders)})
            RETURNING *
        """

        record = await db_manager.fetchrow(query, *values)
        return self._record_to_model(record)

    async def create_many(self, models: List[T]) -> List[T]:
        """
        Create multiple records

        Args:
            models: List of model instances to create

        Returns:
            List of created model instances
        """
        if not models:
            return []

        created = []
        for model in models:
            result = await self.create(model)
            if result:
                created.append(result)

        return created

    async def update(
        self,
        id: str,
        updates: Dict[str, Any]
    ) -> Optional[T]:
        """
        Update a record

        Args:
            id: Record ID
            updates: Dictionary of field=value pairs to update

        Returns:
            Updated model instance or None
        """
        if not updates:
            return await self.find_by_id(id)

        # Build SET clause
        set_clauses = []
        params = []
        for i, (field, value) in enumerate(updates.items()):
            set_clauses.append(f"{field} = ${i+1}")
            params.append(value)

        params.append(id)

        query = f"""
            UPDATE {self.table_name}
            SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
            WHERE {self.id_field} = ${len(params)}
            RETURNING *
        """

        record = await db_manager.fetchrow(query, *params)
        return self._record_to_model(record)

    async def update_where(
        self,
        conditions: Dict[str, Any],
        updates: Dict[str, Any]
    ) -> int:
        """
        Update records matching conditions

        Args:
            conditions: Dictionary of field=value pairs
            updates: Dictionary of field=value pairs to update

        Returns:
            Number of records updated
        """
        if not conditions or not updates:
            return 0

        # Build WHERE clause
        where_clauses = []
        params = []
        for i, (field, value) in enumerate(conditions.items()):
            where_clauses.append(f"{field} = ${i+1}")
            params.append(value)

        # Build SET clause
        set_clauses = []
        for i, (field, value) in enumerate(updates.items()):
            param_index = len(params) + i + 1
            set_clauses.append(f"{field} = ${param_index}")
            params.append(value)

        params.append(params)  # Add param count for WHERE

        query = f"""
            UPDATE {self.table_name}
            SET {', '.join(set_clauses)}, updated_at = CURRENT_TIMESTAMP
            WHERE {' AND '.join(where_clauses)}
            RETURNING {self.id_field}
        """

        records = await db_manager.fetch(query, *params)
        return len(records)

    async def delete(self, id: str) -> bool:
        """
        Delete a record by ID

        Args:
            id: Record ID

        Returns:
            True if deleted, False otherwise
        """
        query = f"DELETE FROM {self.table_name} WHERE {self.id_field} = $1"
        result = await db_manager.execute(query, id)
        return "DELETE 1" in result

    async def delete_where(self, conditions: Dict[str, Any]) -> int:
        """
        Delete records matching conditions

        Args:
            conditions: Dictionary of field=value pairs

        Returns:
            Number of records deleted
        """
        if not conditions:
            return 0

        where_clauses = []
        params = []
        for i, (field, value) in enumerate(conditions.items()):
            where_clauses.append(f"{field} = ${i+1}")
            params.append(value)

        query = f"""
            DELETE FROM {self.table_name}
            WHERE {' AND '.join(where_clauses)}
            RETURNING {self.id_field}
        """

        records = await db_manager.fetch(query, *params)
        return len(records)

    async def count(self, conditions: Optional[Dict[str, Any]] = None) -> int:
        """
        Count records

        Args:
            conditions: Optional filtering conditions

        Returns:
            Number of records
        """
        if conditions:
            where_clauses = []
            params = []
            for i, (field, value) in enumerate(conditions.items()):
                where_clauses.append(f"{field} = ${i+1}")
                params.append(value)

            query = f"""
                SELECT COUNT(*) FROM {self.table_name}
                WHERE {' AND '.join(where_clauses)}
            """
            result = await db_manager.fetchval(query, *params)
        else:
            query = f"SELECT COUNT(*) FROM {self.table_name}"
            result = await db_manager.fetchval(query)

        return int(result) if result else 0

    async def exists(self, id: str) -> bool:
        """
        Check if a record exists

        Args:
            id: Record ID

        Returns:
            True if exists, False otherwise
        """
        query = f"SELECT EXISTS(SELECT 1 FROM {self.table_name} WHERE {self.id_field} = $1)"
        result = await db_manager.fetchval(query, id)
        return bool(result)

    async def batch_create(
        self,
        models: List[T],
        batch_size: int = 100
    ) -> List[T]:
        """
        Create multiple records in batches

        Args:
            models: List of model instances to create
            batch_size: Number of records per batch

        Returns:
            List of created model instances
        """
        if not models:
            return []

        created = []
        for i in range(0, len(models), batch_size):
            batch = models[i:i + batch_size]
            batch_created = await self.create_many(batch)
            created.extend(batch_created)

        return created

    async def upsert(
        self,
        model: T,
        conflict_columns: List[str]
    ) -> Optional[T]:
        """
        Insert or update a record (upsert)

        Args:
            model: Model instance
            conflict_columns: Columns to check for conflicts

        Returns:
            Created or updated model instance
        """
        data = self._model_to_dict(model)

        # Generate ID if not present
        if self.id_field not in data or not data[self.id_field]:
            data[self.id_field] = generate_uuid()

        columns = list(data.keys())
        placeholders = [f"${i+1}" for i in range(len(columns))]
        values = list(data.values())

        # Build ON CONFLICT clause
        conflict_targets = ", ".join(conflict_columns)
        update_clauses = [f"{col} = EXCLUDED.{col}" for col in columns if col != self.id_field]

        query = f"""
            INSERT INTO {self.table_name} ({', '.join(columns)})
            VALUES ({', '.join(placeholders)})
            ON CONFLICT ({conflict_targets}) DO UPDATE
            SET {', '.join(update_clauses)}, updated_at = CURRENT_TIMESTAMP
            RETURNING *
        """

        record = await db_manager.fetchrow(query, *values)
        return self._record_to_model(record)
