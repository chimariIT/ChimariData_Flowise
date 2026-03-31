"""Initial schema migration

Revision ID: 2026_03_07_00_00_initial
Revises:
Create Date: 2026-03-07 00:00

Creates all initial database tables for Chimaridata Python Backend.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '2026_03_07_00_00_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade database to this revision."""

    # Enable pgvector extension (optional — gracefully skip if not available)
    try:
        op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    except Exception:
        import warnings
        warnings.warn("pgvector extension not available — vector columns will not work")

    # ============================================================================
    # Core Tables
    # ============================================================================

    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('name', sa.String(255)),
        sa.Column('is_admin', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
    )

    # Projects table
    op.create_table(
        'projects',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('industry', sa.String(100)),
        sa.Column('journey_step', sa.String(50)),
        sa.Column('journey_progress', sa.JSON()),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
    )

    # Datasets table
    op.create_table(
        'datasets',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('source_type', sa.String(50)),
        sa.Column('file_path', sa.Text()),
        sa.Column('file_size', sa.BigInteger()),
        sa.Column('record_count', sa.Integer()),
        sa.Column('schema', sa.JSON()),
        sa.Column('pii_analysis', sa.JSON()),
        sa.Column('pii_decision', sa.JSON()),
        sa.Column('embeddings_generated', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
    )

    # Question mappings table
    op.create_table(
        'question_mappings',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('question_id', sa.String(64)),
        sa.Column('question_text', sa.Text(), nullable=False),
        sa.Column('question_embedding', sa.JSON()),
        sa.Column('related_elements', sa.JSON()),
        sa.Column('related_columns', sa.JSON()),
        sa.Column('recommended_analyses', sa.JSON()),
        sa.Column('intent_type', sa.String(50)),
        sa.Column('confidence', sa.Float()),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # Transformations table
    op.create_table(
        'transformations',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('dataset_id', sa.String(36), sa.ForeignKey('datasets.id'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('operation_type', sa.String(50)),
        sa.Column('steps', sa.JSON()),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('result', sa.JSON()),
        sa.Column('error', sa.Text()),
        sa.Column('execution_time_ms', sa.Integer()),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('completed_at', sa.DateTime(timezone=False)),
    )

    # Analysis results table
    op.create_table(
        'analysis_results',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id')),
        sa.Column('analysis_type', sa.String(50)),
        sa.Column('data', sa.JSON()),
        sa.Column('data_metadata', sa.JSON(), name='metadata'),
        sa.Column('status', sa.String(20), default='pending'),
        sa.Column('error', sa.Text()),
        sa.Column('started_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('completed_at', sa.DateTime(timezone=False)),
        sa.Column('execution_time_ms', sa.Integer()),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # Insights table
    op.create_table(
        'insights',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id')),
        sa.Column('analysis_result_id', sa.String(36), sa.ForeignKey('analysis_results.id')),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('significance', sa.String(20)),
        sa.Column('evidence', sa.JSON()),
        sa.Column('data_elements_used', sa.JSON()),
        sa.Column('confidence', sa.Float()),
        sa.Column('generated_by', sa.String(50)),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # Evidence links table
    op.create_table(
        'evidence_links',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('source_type', sa.String(20)),
        sa.Column('source_id', sa.String(64)),
        sa.Column('target_type', sa.String(20)),
        sa.Column('target_id', sa.String(64)),
        sa.Column('link_type', sa.String(50)),
        sa.Column('confidence', sa.Float()),
        sa.Column('data_metadata', sa.JSON(), name='metadata'),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # Artifacts table
    op.create_table(
        'artifacts',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id'), nullable=False),
        sa.Column('type', sa.String(20)),
        sa.Column('file_path', sa.Text()),
        sa.Column('file_size', sa.BigInteger()),
        sa.Column('data_metadata', sa.JSON(), name='metadata'),
        sa.Column('download_count', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # Sessions table
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('current_step', sa.String(50)),
        sa.Column('state', sa.JSON()),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
    )

    # Business definitions table
    op.create_table(
        'business_definitions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(255), unique=True, nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('formula', sa.Text()),
        sa.Column('source_columns', sa.JSON()),
        sa.Column('category', sa.String(100)),
        sa.Column('industry', sa.String(100)),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # Column embeddings table
    op.create_table(
        'column_embeddings',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('dataset_id', sa.String(36), sa.ForeignKey('datasets.id'), nullable=False),
        sa.Column('column_name', sa.String(255), nullable=False),
        sa.Column('embedding', sa.JSON()),
        sa.Column('embedding_model', sa.String(50)),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # ============================================================================
    # Billing Tables
    # ============================================================================

    # Subscription tiers table
    op.create_table(
        'subscription_tiers',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('display_name', sa.String(100), nullable=False),
        sa.Column('monthly_price_usd', sa.Float(), nullable=False),
        sa.Column('features', sa.JSON()),
        sa.Column('analysis_limit', sa.Integer()),
        sa.Column('projects_limit', sa.Integer()),
        sa.Column('stripe_price_id', sa.String(100)),
        sa.Column('is_active', sa.Boolean(), default=True),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
    )

    # Billing invoices table
    op.create_table(
        'billing_invoices',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('tier_id', sa.String(36), sa.ForeignKey('subscription_tiers.id')),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('currency', sa.String(3), default='USD'),
        sa.Column('status', sa.String(20), nullable=False),
        sa.Column('stripe_invoice_id', sa.String(100)),
        sa.Column('billing_period_start', sa.DateTime(timezone=False)),
        sa.Column('billing_period_end', sa.DateTime(timezone=False)),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('paid_at', sa.DateTime(timezone=True)),
        sa.Column('due_at', sa.DateTime(timezone=True)),
    )

    # Billing campaigns table
    op.create_table(
        'billing_campaigns',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('code', sa.String(50), nullable=False, unique=True),
        sa.Column('discount_percentage', sa.Float(), default=0.0),
        sa.Column('description', sa.Text()),
        sa.Column('start_date', sa.DateTime(timezone=False), nullable=False),
        sa.Column('end_date', sa.DateTime(timezone=False), nullable=False),
        sa.Column('active', sa.Boolean(), default=True),
        sa.Column('max_uses', sa.Integer()),
        sa.Column('current_uses', sa.Integer(), default=0),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id')),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
    )

    # ============================================================================
    # Knowledge Base Tables
    # ============================================================================

    # Knowledge nodes table
    op.create_table(
        'knowledge_nodes',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('type', sa.String(50), nullable=False),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('source', sa.String(100)),
        sa.Column('confidence', sa.Float(), default=1.0),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id')),
        sa.Column('is_system', sa.Boolean(), default=False),
        sa.Column('data_metadata', sa.JSON(), name='metadata', default={}),
    )

    # Knowledge edges table
    op.create_table(
        'knowledge_edges',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('from_node_id', sa.String(36), sa.ForeignKey('knowledge_nodes.id'), nullable=False),
        sa.Column('to_node_id', sa.String(36), sa.ForeignKey('knowledge_nodes.id'), nullable=False),
        sa.Column('relationship', sa.String(50), nullable=False),
        sa.Column('weight', sa.Float(), default=1.0),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id')),
    )

    # Analysis patterns table
    op.create_table(
        'analysis_patterns',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False),
        sa.Column('analysis_type', sa.String(50), nullable=False),
        sa.Column('success_rate', sa.Float(), default=0.0),
        sa.Column('usage_count', sa.Integer(), default=0),
        sa.Column('confidence', sa.Float(), default=1.0),
        sa.Column('parameters', sa.JSON(), default={}),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id')),
        sa.Column('is_active', sa.Boolean(), default=True),
    )

    # Template feedback table
    op.create_table(
        'template_feedback',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('template_id', sa.String(36), nullable=False),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=False),
        sa.Column('feedback_text', sa.Text(), nullable=True),
        sa.Column('suggested_improvements', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('is_helpful', sa.Boolean(), default=False),
    )

    # ============================================================================
    # Audit Log Table
    # ============================================================================

    # Audit logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('resource_type', sa.String(50), nullable=False),
        sa.Column('resource_id', sa.String(36)),
        sa.Column('details', sa.JSON(), default={}),
        sa.Column('ip_address', sa.String(45)),
        sa.Column('user_agent', sa.String(500)),
        sa.Column('status', sa.String(20), default='success'),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )

    # ============================================================================
    # RBAC Tables
    # ============================================================================

    # Roles table
    op.create_table(
        'roles',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), unique=True, nullable=False),
        sa.Column('display_name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('permissions', sa.JSON(), default=[]),
        sa.Column('is_system', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP'), onupdate=sa.text('CURRENT_TIMESTAMP')),
    )

    # User roles table
    op.create_table(
        'user_roles',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('role_id', sa.String(36), sa.ForeignKey('roles.id'), nullable=False),
        sa.Column('assigned_by', sa.String(36), sa.ForeignKey('users.id')),
        sa.Column('assigned_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('expires_at', sa.DateTime(timezone=False)),
    )

    # Permissions table
    op.create_table(
        'permissions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), unique=True, nullable=False),
        sa.Column('display_name', sa.String(100), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('category', sa.String(50)),
        sa.Column('created_at', sa.DateTime(timezone=False), server_default=sa.text('CURRENT_TIMESTAMP')),
    )


def downgrade() -> None:
    """Downgrade database from this revision."""

    # Drop in reverse order to respect foreign keys

    # RBAC Tables
    op.drop_table('permissions')
    op.drop_table('user_roles')
    op.drop_table('roles')

    # Audit Log
    op.drop_table('audit_logs')

    # Knowledge Base
    op.drop_table('template_feedback')
    op.drop_table('analysis_patterns')
    op.drop_table('knowledge_edges')
    op.drop_table('knowledge_nodes')

    # Billing
    op.drop_table('billing_campaigns')
    op.drop_table('billing_invoices')
    op.drop_table('subscription_tiers')

    # Core
    op.drop_table('column_embeddings')
    op.drop_table('business_definitions')
    op.drop_table('sessions')
    op.drop_table('artifacts')
    op.drop_table('evidence_links')
    op.drop_table('insights')
    op.drop_table('analysis_results')
    op.drop_table('transformations')
    op.drop_table('question_mappings')
    op.drop_table('datasets')
    op.drop_table('projects')
    op.drop_table('users')

    # Disable pgvector extension
    op.execute('DROP EXTENSION IF EXISTS pgvector')
