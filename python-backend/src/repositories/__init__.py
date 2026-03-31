"""
Database Repository Pattern

Provides a clean abstraction layer for database operations.
Each repository handles CRUD operations for a specific entity.

Repositories:
- UserRepository
- ProjectRepository
- DatasetRepository
- QuestionMappingRepository
- TransformationRepository
- AnalysisResultRepository
- InsightRepository
- EvidenceLinkRepository
- ArtifactRepository
- SessionRepository
- BusinessDefinitionRepository
- ColumnEmbeddingRepository
- SubscriptionTierRepository
- BillingInvoiceRepository
- BillingCampaignRepository
- KnowledgeNodeRepository
- KnowledgeEdgeRepository
- AnalysisPatternRepository
- TemplateFeedbackRepository
- AuditLogRepository (Admin)
- RoleRepository (Admin/RBAC)
- PermissionRepository (Admin/RBAC)
- UserRoleRepository (Admin/RBAC)
"""

from .base_repository import BaseRepository
from .user_repository import UserRepository
from .project_repository import ProjectRepository
from .dataset_repository import DatasetRepository
from .question_mapping_repository import QuestionMappingRepository
from .transformation_repository import TransformationRepository
from .analysis_result_repository import AnalysisResultRepository
from .insight_repository import InsightRepository
from .evidence_link_repository import EvidenceLinkRepository
from .artifact_repository import ArtifactRepository
from .session_repository import SessionRepository
from .business_definition_repository import BusinessDefinitionRepository
from .column_embedding_repository import ColumnEmbeddingRepository

# Billing Repositories
from .subscription_tier_repository import SubscriptionTierRepository
from .billing_invoice_repository import BillingInvoiceRepository
from .billing_campaign_repository import BillingCampaignRepository

# Knowledge Base Repositories
from .knowledge_node_repository import KnowledgeNodeRepository
# from .knowledge_edge_repository import KnowledgeEdgeRepository  # File doesn't exist yet
# from .analysis_pattern_repository import AnalysisPatternRepository  # File doesn't exist yet
# from .template_feedback_repository import TemplateFeedbackRepository  # File doesn't exist yet

# Admin / RBAC Repositories
from .audit_log_repository import AuditLogRepository
from .role_repository import RoleRepository
from .permission_repository import PermissionRepository
from .user_role_repository import UserRoleRepository

__all__ = [
    "BaseRepository",
    "UserRepository",
    "ProjectRepository",
    "DatasetRepository",
    "QuestionMappingRepository",
    "TransformationRepository",
    "AnalysisResultRepository",
    "InsightRepository",
    "EvidenceLinkRepository",
    "ArtifactRepository",
    "SessionRepository",
    "BusinessDefinitionRepository",
    "ColumnEmbeddingRepository",
    # Billing
    "SubscriptionTierRepository",
    "BillingInvoiceRepository",
    "BillingCampaignRepository",
    # Knowledge Base
    "KnowledgeNodeRepository",
    # "KnowledgeEdgeRepository",  # File doesn't exist yet
    # "AnalysisPatternRepository",  # File doesn't exist yet
    # "TemplateFeedbackRepository",  # File doesn't exist yet
    # Admin / RBAC
    "AuditLogRepository",
    "RoleRepository",
    "PermissionRepository",
    "UserRoleRepository",
]
