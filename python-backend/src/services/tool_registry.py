"""
Tool Registry for LangChain Agents

Centralizes all tool definitions that agents can call through LangChain.
Wraps service functions as LangChain tools with proper schema validation.

Features:
- Semantic matching tools
- Transformation tools
- Analysis execution tools
- Data ingestion tools
- Business definition tools
"""

from typing import Dict, List, Any, Optional
from logging import getLogger
from datetime import datetime
import os
import subprocess
import tempfile

# LangChain imports
from langchain_core.tools import tool
# Use pydantic directly for v2 compatibility
try:
    from pydantic import BaseModel, Field
except ImportError:
    from langchain_core.pydantic_v1 import BaseModel, Field

# Local imports
from .semantic_matching import (
    get_question_element_mappings,
    select_analysis_types_for_questions,
    get_semantic_matcher,
    SemanticConfig
)
from .transformation_engine import (
    compile_and_execute_transformation_plan,
    get_transformation_executor,
    get_business_registry
)
from .analysis_orchestrator import (
    AnalysisOrchestrator,
    get_analysis_orchestrator,
    AnalysisType
)
from .rag_evidence_chain import (
    get_evidence_chain_service
)
from .data_ingestion import (
    DataIngestionService
)
from ..models.schemas import (
    QuestionElementMapping,
    TransformationPlan,
    TransformationStep,
    AnalysisResult,
    BusinessDefinition
)

logger = getLogger(__name__)


# ============================================================================
# Tool Input Schemas (Pydantic models for validation)
# ============================================================================

class MatchQuestionsInput(BaseModel):
    """Input for question matching tool"""
    questions: List[str] = Field(..., description="User questions to match")
    datasets: List[str] = Field(..., description="Dataset IDs to search")
    user_goals: List[str] = Field(default_factory=list, description="User analysis goals")


class GenerateEmbeddingsInput(BaseModel):
    """Input for generating embeddings tool"""
    dataset_id: str = Field(..., description="Dataset ID")
    columns: List[Dict[str, Any]] = Field(..., description="Column definitions")


class SelectAnalysesInput(BaseModel):
    """Input for analysis selection tool"""
    questions: List[str] = Field(..., description="User questions")
    mappings: List[Dict[str, Any]] = Field(..., description="Question-element mappings")
    user_goals: List[str] = Field(default_factory=list, description="User goals")


class ExecuteTransformationInput(BaseModel):
    """Input for transformation execution tool"""
    project_id: str = Field(..., description="Project ID")
    datasets: List[str] = Field(..., description="Dataset IDs")
    mappings: List[Dict[str, Any]] = Field(..., description="Question-element mappings")
    business_context: Optional[Dict[str, Any]] = Field(None, description="Business context")


class ExecuteAnalysisInput(BaseModel):
    """Input for analysis execution tool"""
    project_id: str = Field(..., description="Project ID")
    analysis_types: List[str] = Field(..., description="Analysis types to execute")
    data: Optional[Dict[str, Any]] = Field(None, description="Data to analyze")
    config: Optional[Dict[str, Any]] = Field(None, description="Analysis configuration")


class QueryEvidenceChainInput(BaseModel):
    """Input for evidence chain query tool"""
    project_id: str = Field(..., description="Project ID")
    question_id: str = Field(..., description="Question ID")
    link_types: Optional[List[str]] = Field(None, description="Filter by link types")
    min_confidence: float = Field(default=0.0, description="Minimum confidence")


class LookupBusinessDefinitionInput(BaseModel):
    """Input for business definition lookup tool"""
    query: str = Field(..., description="Search query")
    category: Optional[str] = Field(None, description="Filter by category")


class GetDatasetSchemaInput(BaseModel):
    """Input for getting dataset schema tool"""
    dataset_id: str = Field(..., description="Dataset ID")


# ============================================================================
# Semantic Matching Tools
# ============================================================================

@tool
async def match_questions_to_elements(
    questions: List[str],
    datasets: List[str],
    user_goals: List[str]
) -> Dict[str, Any]:
    """
    Match user questions to data elements using semantic matching.

    Uses vector embeddings and cosine similarity to find the most relevant
    data elements (columns) for each user question.

    Args:
        questions: User questions to match
        datasets: List of dataset IDs to search
        user_goals: User's analysis goals

    Returns:
        Dictionary with list of QuestionElementMapping
    """
    try:
        mappings = await get_question_element_mappings(
            questions=questions,
            datasets=datasets,
            user_goals=user_goals
        )

        return {
            "success": True,
            "mappings": [m.dict() if hasattr(m, 'dict') else m for m in mappings],
            "count": len(mappings)
        }
    except Exception as e:
        logger.error(f"Error matching questions: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "mappings": []
        }


@tool
async def generate_column_embeddings(
    dataset_id: str,
    columns: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Generate vector embeddings for dataset columns.

    Creates embeddings for column names, descriptions, and sample values
    to enable semantic search and matching.

    Args:
        dataset_id: Dataset ID
        columns: List of column definitions

    Returns:
        Dictionary with embedding generation results
    """
    try:
        from ..models.schemas import ColumnDefinition
        from .semantic_matching import SemanticMatcher

        # Convert dicts to ColumnDefinition models
        column_defs = [ColumnDefinition(**col) for col in columns]

        matcher = get_semantic_matcher()
        documents = await matcher.column_generator.generate_column_embeddings(
            dataset_id=dataset_id,
            columns=column_defs
        )

        # Store embeddings
        await matcher.column_generator.store_column_embeddings(
            dataset_id=dataset_id,
            documents=documents
        )

        return {
            "success": True,
            "count": len(documents),
            "dataset_id": dataset_id
        }
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "count": 0
        }


@tool
def select_analysis_types(
    questions: List[str],
    mappings: List[Dict[str, Any]],
    user_goals: List[str]
) -> Dict[str, Any]:
    """
    Select appropriate analysis types based on questions and mappings.

    Analyzes question intent to determine which analysis types are needed.

    Args:
        questions: User questions
        mappings: Question-element mappings
        user_goals: User analysis goals

    Returns:
        Dictionary with list of recommended analysis types
    """
    try:
        analysis_types = select_analysis_types_for_questions(
            questions=questions,
            mappings=mappings,
            user_goals=user_goals
        )

        return {
            "success": True,
            "analysis_types": analysis_types,
            "count": len(analysis_types)
        }
    except Exception as e:
        logger.error(f"Error selecting analyses: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "analysis_types": ["descriptive_stats"]  # Fallback
        }


# ============================================================================
# Transformation Tools
# ============================================================================

@tool
async def execute_transformations(
    project_id: str,
    datasets: List[str],
    mappings: List[Dict[str, Any]],
    business_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Execute transformation plan on dataset(s).

    Compiles transformation steps from mappings and applies them
    with business context awareness.

    Args:
        project_id: Project ID
        datasets: List of dataset IDs
        mappings: Question-element mappings
        business_context: Business context for transformations

    Returns:
        Dictionary with transformation execution results
    """
    try:
        result = await compile_and_execute_transformation_plan(
            project_id=project_id,
            datasets=datasets,
            mappings=mappings,
            business_context=business_context
        )

        return {
            "success": result.get("success", True),
            "transformation_plan": result.get("transformation_plan"),
            "steps_executed": result.get("steps_executed", []),
            "transformed_data": result.get("transformed_data"),
            "row_count": result.get("row_count", 0),
            "column_count": result.get("column_count", 0)
        }
    except Exception as e:
        logger.error(f"Error executing transformations: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "steps_executed": []
        }


@tool
async def compile_transformation_plan(
    project_id: str,
    mappings: List[Dict[str, Any]],
    business_context: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Compile transformation plan without executing.

    Generates the transformation steps but doesn't execute them.
    Useful for preview and validation.

    Args:
        project_id: Project ID
        mappings: Question-element mappings
        business_context: Business context for transformations

    Returns:
        Dictionary with compiled transformation plan
    """
    try:
        from .transformation_engine import TransformationExecutor

        executor = get_transformation_executor()

        # Create transformation plan
        plan = await executor.compile_plan(
            project_id=project_id,
            mappings=mappings,
            business_context=business_context
        )

        return {
            "success": True,
            "plan": plan.dict() if hasattr(plan, 'dict') else plan,
            "estimated_runtime_ms": plan.estimated_runtime_ms
        }
    except Exception as e:
        logger.error(f"Error compiling transformation plan: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


# ============================================================================
# Analysis Execution Tools
# ============================================================================

@tool
async def execute_analysis(
    project_id: str,
    analysis_types: List[str],
    data: Optional[Dict[str, Any]] = None,
    config: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Execute analysis on project data.

    Runs specified analysis types and returns results.

    Args:
        project_id: Project ID
        analysis_types: List of analysis types to execute
        data: Optional data to analyze (uses project data if not provided)
        config: Optional analysis configuration

    Returns:
        Dictionary with analysis execution results
    """
    try:
        orchestrator = get_analysis_orchestrator()

        # Convert string analysis types to enums
        analysis_type_objs = []
        for at in analysis_types:
            try:
                analysis_type_objs.append(AnalysisType(at))
            except ValueError:
                logger.warning(f"Unknown analysis type: {at}")

        if not analysis_type_objs:
            return {
                "success": False,
                "error": "No valid analysis types provided",
                "results": []
            }

        # Execute analyses
        results = []
        for analysis_type in analysis_type_objs:
            result = await orchestrator.execute_single_analysis(
                context=type('Context', (), {'project_id': project_id})(),
                analysis_type=analysis_type,
                data=data or {}
            )
            results.append({
                "analysis_type": analysis_type.value,
                "success": result.success,
                "data": result.data,
                "errors": result.errors
            })

        return {
            "success": True,
            "results": results,
            "count": len(results)
        }
    except Exception as e:
        logger.error(f"Error executing analysis: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "results": []
        }


@tool
async def get_analysis_status(
    project_id: str,
    analysis_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get the status of an analysis execution.

    Args:
        project_id: Project ID
        analysis_id: Optional specific analysis ID

    Returns:
        Dictionary with analysis status
    """
    try:
        orchestrator = get_analysis_orchestrator()
        context = orchestrator.active_sessions.get(project_id)

        if not context:
            return {
                "success": False,
                "error": "No active analysis found",
                "status": "not_found"
            }

        return {
            "success": True,
            "status": "running" if context else "completed",
            "project_id": project_id,
            "analysis_id": analysis_id
        }
    except Exception as e:
        logger.error(f"Error getting analysis status: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "status": "error"
        }


# ============================================================================
# Evidence Chain Tools
# ============================================================================

@tool
async def query_evidence_chain(
    project_id: str,
    question_id: str,
    link_types: Optional[List[str]] = None,
    min_confidence: float = 0.0
) -> Dict[str, Any]:
    """
    Query the evidence chain for a question.

    Traces the complete evidence chain from question → element →
    transformation → insight → answer.

    Args:
        project_id: Project ID
        question_id: Question ID
        link_types: Optional filter by link types
        min_confidence: Minimum confidence threshold

    Returns:
        Dictionary with evidence chain results
    """
    try:
        evidence_service = get_evidence_chain_service()

        chain = await evidence_service.query_evidence_chain(
            project_id=project_id,
            question_id=question_id,
            link_types=link_types,
            min_confidence=min_confidence
        )

        return {
            "success": True,
            "chain": [link.dict() if hasattr(link, 'dict') else link for link in chain],
            "answers": chain.get("answers", []),
            "confidence": chain.get("confidence", 0.0),
            "trace_complete": chain.get("trace_complete", False)
        }
    except Exception as e:
        logger.error(f"Error querying evidence chain: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "chain": []
        }


# ============================================================================
# Business Definition Tools
# ============================================================================

@tool
def lookup_business_definition(
    query: str,
    category: Optional[str] = None
) -> Dict[str, Any]:
    """
    Look up business definitions from the knowledge base.

    Searches for business metrics, KPIs, and formulas.

    Args:
        query: Search query
        category: Optional filter by category

    Returns:
        Dictionary with matching business definitions
    """
    try:
        registry = get_business_registry()

        # Search by name or category
        results = []
        query_lower = query.lower()

        for definition in registry.definitions.values():
            # Match by name, description, or category
            if (query_lower in definition.name.lower() or
                query_lower in definition.description.lower() or
                (category and definition.category == category) or
                (not category and query_lower in definition.category.lower())):
                results.append(definition)

        return {
            "success": True,
            "definitions": [d.dict() if hasattr(d, 'dict') else d for d in results],
            "count": len(results)
        }
    except Exception as e:
        logger.error(f"Error looking up business definition: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "definitions": []
        }


@tool
def get_business_definition(
    definition_id: str
) -> Dict[str, Any]:
    """
    Get a specific business definition by ID.

    Args:
        definition_id: Business definition ID

    Returns:
        Dictionary with business definition details
    """
    try:
        registry = get_business_registry()
        definition = registry.get(definition_id)

        if not definition:
            return {
                "success": False,
                "error": f"Business definition not found: {definition_id}"
            }

        return {
            "success": True,
            "definition": definition.dict() if hasattr(definition, 'dict') else definition
        }
    except Exception as e:
        logger.error(f"Error getting business definition: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


# ============================================================================
# Data Ingestion Tools
# ============================================================================

@tool
async def get_dataset_schema(
    dataset_id: str
) -> Dict[str, Any]:
    """
    Get the schema of a dataset.

    Returns column definitions with types, sample values, and PII info.

    Args:
        dataset_id: Dataset ID

    Returns:
        Dictionary with dataset schema
    """
    try:
        # Import here to avoid circular dependency
        from .data_ingestion import DataIngestionService

        ingestion_service = DataIngestionService()
        schema = await ingestion_service.get_dataset_schema(dataset_id)

        if not schema:
            return {
                "success": False,
                "error": f"Dataset not found: {dataset_id}"
            }

        return {
            "success": True,
            "schema": schema.dict() if hasattr(schema, 'dict') else schema
        }
    except Exception as e:
        logger.error(f"Error getting dataset schema: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


# ============================================================================
# Utility Tools
# ============================================================================

@tool
def search_web(query: str) -> str:
    """
    Search the web for industry patterns, benchmarks, and best practices.

    Requires a configured external search provider.

    Args:
        query: Search query

    Returns:
        Search results
    """
    provider = os.getenv("WEB_SEARCH_PROVIDER", "").strip().lower()
    if provider != "serper":
        return (
            "Web search is not configured. "
            "Set WEB_SEARCH_PROVIDER=serper and WEB_SEARCH_API_KEY to enable external search."
        )

    api_key = os.getenv("WEB_SEARCH_API_KEY", "").strip()
    if not api_key:
        return "WEB_SEARCH_API_KEY is missing. No external search results were returned."

    try:
        import requests  # Imported lazily to keep startup light

        response = requests.post(
            "https://google.serper.dev/search",
            headers={
                "X-API-KEY": api_key,
                "Content-Type": "application/json",
            },
            json={"q": query, "num": 5},
            timeout=20,
        )
        response.raise_for_status()
        payload = response.json()
        organic = payload.get("organic", []) if isinstance(payload, dict) else []
        if not organic:
            return "No search results returned by provider."

        lines: List[str] = []
        for item in organic[:5]:
            title = str(item.get("title", "")).strip()
            link = str(item.get("link", "")).strip()
            snippet = str(item.get("snippet", "")).strip()
            if not title and not link:
                continue
            lines.append(f"- {title} ({link}) {snippet}".strip())

        return "\n".join(lines) if lines else "No parsable search results returned by provider."
    except Exception as e:
        logger.error(f"search_web failed: {e}", exc_info=True)
        return f"Web search failed: {e}"


@tool
def execute_python(code: str) -> str:
    """
    Execute Python code for data transformations and calculations.

    Disabled by default. Enable explicitly via ENABLE_UNSAFE_PYTHON_TOOL=true.

    Args:
        code: Python code to execute

    Returns:
        Execution result
    """
    if os.getenv("ENABLE_UNSAFE_PYTHON_TOOL", "false").lower() != "true":
        return (
            "Python execution tool is disabled. "
            "Set ENABLE_UNSAFE_PYTHON_TOOL=true to allow execution in controlled environments."
        )

    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".py", delete=False, encoding="utf-8") as tmp_file:
            tmp_file.write(code)
            script_path = tmp_file.name

        completed = subprocess.run(
            ["python", script_path],
            capture_output=True,
            text=True,
            timeout=30,
            check=False,
        )
        stdout = (completed.stdout or "").strip()
        stderr = (completed.stderr or "").strip()
        if completed.returncode != 0:
            return f"Python execution failed (exit {completed.returncode}): {stderr or 'no stderr output'}"
        return stdout if stdout else "Python executed successfully with no stdout output."
    except Exception as e:
        logger.error(f"execute_python failed: {e}", exc_info=True)
        return f"Python execution failed: {e}"
    finally:
        try:
            if "script_path" in locals() and script_path and os.path.exists(script_path):
                os.remove(script_path)
        except Exception:
            pass


# ============================================================================
# Tool Registry Factory
# ============================================================================

def get_all_tools() -> List:
    """
    Get all available tools for agent use.

    Returns a list of all LangChain tools that agents can call.
    """
    return [
        # Semantic matching tools
        match_questions_to_elements,
        generate_column_embeddings,
        select_analysis_types,

        # Transformation tools
        execute_transformations,
        compile_transformation_plan,

        # Analysis tools
        execute_analysis,
        get_analysis_status,

        # Evidence chain tools
        query_evidence_chain,

        # Business definition tools
        lookup_business_definition,
        get_business_definition,

        # Data ingestion tools
        get_dataset_schema,

        # Utility tools
        search_web,
        execute_python,
    ]


def get_tools_by_agent(agent_type: str) -> List:
    """
    Get tools appropriate for a specific agent type.

    Args:
        agent_type: Type of agent (project_manager, data_scientist, etc.)

    Returns:
        List of tools available to the agent
    """
    all_tools = get_all_tools()

    # Define tool permissions by agent
    agent_tool_permissions = {
        "project_manager": [
            "match_questions_to_elements",
            "select_analysis_types",
            "execute_transformations",
            "get_dataset_schema",
        ],
        "data_scientist": [
            "match_questions_to_elements",
            "select_analysis_types",
            "execute_analysis",
            "get_analysis_status",
            "query_evidence_chain",
            "execute_python",
        ],
        "data_engineer": [
            "get_dataset_schema",
            "execute_transformations",
            "compile_transformation_plan",
            "execute_python",
        ],
        "business_agent": [
            "query_evidence_chain",
            "lookup_business_definition",
            "get_business_definition",
        ],
        "template_research": [
            "search_web",
            "lookup_business_definition",
        ],
        "customer_support": [
            "get_dataset_schema",
            "get_analysis_status",
        ]
    }

    # Get allowed tools for the agent
    allowed_tools = agent_tool_permissions.get(agent_type, [])
    if not allowed_tools:
        # Default to all tools for unknown agent types
        return all_tools

    # Filter tools by name
    tool_map = {tool.name: tool for tool in all_tools}
    return [tool_map[name] for name in allowed_tools if name in tool_map]


# ============================================================================
# Singleton Instance
# ============================================================================

_tool_registry_instance = None


def get_tool_registry() -> 'ToolRegistry':
    """Get the singleton tool registry instance"""
    global _tool_registry_instance
    if _tool_registry_instance is None:
        _tool_registry_instance = ToolRegistry()
    return _tool_registry_instance


class ToolRegistry:
    """
    Central registry for all LangChain tools.

    Provides methods for getting tools by agent type and
    for tool discovery.
    """

    def __init__(self):
        """Initialize the tool registry"""
        self._tools = get_all_tools()
        self._tool_map = {tool.name: tool for tool in self._tools}

    def get_all_tools(self) -> List:
        """Get all available tools"""
        return self._tools

    def get_tools_for_agent(self, agent_type: str) -> List:
        """Get tools available to a specific agent type"""
        return get_tools_by_agent(agent_type)

    def get_tool(self, tool_name: str):
        """Get a specific tool by name"""
        return self._tool_map.get(tool_name)

    def list_tools(self) -> List[str]:
        """List all available tool names"""
        return list(self._tool_map.keys())


# ============================================================================
# Convenience Functions
# ============================================================================

async def call_tool(tool_name: str, **kwargs) -> Any:
    """
    Call a tool by name with parameters.

    Convenience function for calling tools without directly
    importing the tool registry.

    Args:
        tool_name: Name of the tool to call
        **kwargs: Parameters to pass to the tool

    Returns:
        Tool execution result
    """
    registry = get_tool_registry()
    tool = registry.get_tool(tool_name)

    if not tool:
        raise ValueError(f"Tool not found: {tool_name}")

    # Call the tool
    if asyncio.iscoroutinefunction(tool.func):
        return await tool(**kwargs)
    else:
        return tool(**kwargs)


# Import asyncio for the call_tool function
import asyncio
