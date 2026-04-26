"""
Agentic Orchestrator using LangGraph

Replaces Node.js Project Manager, Data Scientist, Business, and Data Engineer agents
with stateful LangGraph workflows for reliable multi-step coordination.

Features:
- Stateful multi-agent orchestration
- Message passing between agents
- Tool calling and routing
- Workflow visualization support
- Checkpoint/resume capability
"""

from typing import Dict, List, Optional, Any, Literal, TypedDict, Tuple
from enum import Enum
from datetime import datetime
import logging
import uuid
from functools import partial
import asyncio
import json
import sys
from pathlib import Path

# LangChain and LangGraph imports
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool, Tool
from sqlalchemy import text as sa_text

# Local imports
from ..models.schemas import (
    JourneyState, JourneyStep, OrchestratorState, AgentState,
    AgentMessage, AgentToolCall, AgentType, QuestionElementMapping,
    AnalysisType, TransformationPlan, Insight
)
from ..db import get_db_context
from .tool_registry import get_tools_by_agent, get_tool_registry, ToolRegistry
from .llm_providers import get_llm, LLMProvider, LLMConfig
from .deepagent_runtime import DeepAgentRuntime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Agent Workflow State (TypedDict for LangGraph)
# ============================================================================

class WorkflowState(TypedDict):
    """State for LangGraph workflow"""
    project_id: str
    user_id: str
    user_goals: List[str]
    user_questions: List[str]
    current_step: str
    messages: List[BaseMessage]
    datasets: List[str]
    primary_dataset_id: Optional[str]
    question_mappings: List[Dict]
    transformation_plan: Optional[Dict]
    transformation_executed: bool
    analysis_types: List[str]
    analysis_results: Dict
    evidence_chain: List[Dict]
    agent_states: Dict[str, Dict]
    completed_steps: List[str]
    next_step: Optional[str]
    error: Optional[str]


# ============================================================================
# Agent Configuration
# ============================================================================

class AgentConfig:
    """Configuration for each agent type"""

    AGENT_CONFIGS = {
        AgentType.PROJECT_MANAGER: {
            "name": "Project Manager",
            "description": "Coordinates the entire data analysis workflow",
            "llm_model": "gpt-4",
            "system_prompt": """You are the Project Manager agent for Chimaridata.

Your role is to coordinate the data analysis workflow across these steps:
1. Upload - Guide users to upload datasets
2. PII Review - Ensure PII is handled appropriately
3. Mapping - Match questions to data elements
4. Transformation - Apply transformations with business context
5. Execution - Run analyses
6. Results - Interpret results and generate insights

Always ensure each step is completed before moving to the next.
Verify data consistency between steps.
"""
        },
        AgentType.DATA_SCIENTIST: {
            "name": "Data Scientist",
            "description": "Designs and executes statistical analyses",
            "llm_model": "gpt-4",
            "system_prompt": """You are the Data Scientist agent for Chimaridata.

Your role is to:
1. Select appropriate analysis types based on questions
2. Design statistical models
3. Interpret statistical results
4. Generate insights from analysis outputs
5. Ensure statistical validity

Consider data distributions, correlation, regression, and other statistical methods.
"""
        },
        AgentType.DATA_ENGINEER: {
            "name": "Data Engineer",
            "description": "Handles data quality, transformations, and ETL",
            "llm_model": "gpt-4",
            "system_prompt": """You are the Data Engineer agent for Chimaridata.

Your role is to:
1. Assess data quality and completeness
2. Design transformation plans with business context
3. Handle joins between datasets
4. Resolve dependencies between transformation steps
5. Execute transformations efficiently

Ensure transformations are valid and handle edge cases.
"""
        },
        AgentType.BUSINESS_AGENT: {
            "name": "Business Agent",
            "description": "Translates technical findings into business insights",
            "llm_model": "gpt-4",
            "system_prompt": """You are the Business Agent for Chimaridata.

Your role is to:
1. Understand business goals and questions
2. Translate technical findings into business language
3. Identify business impact and opportunities
4. Recommend actions based on data insights
5. Use industry-specific knowledge and KPIs

Make findings actionable for business stakeholders.
"""
        },
        AgentType.TEMPLATE_RESEARCH: {
            "name": "Template Research",
            "description": "Finds and recommends industry-specific templates",
            "llm_model": "gpt-4",
            "system_prompt": """You are the Template Research agent for Chimaridata.

Your role is to:
1. Search for industry-specific analysis templates
2. Find benchmark data and KPIs
3. Recommend best practices
4. Provide contextual information for analyses

Use web search and your knowledge of industry standards.
"""
        },
        AgentType.CUSTOMER_SUPPORT: {
            "name": "Customer Support",
            "description": "Handles user questions and diagnostics",
            "llm_model": "gpt-4",
            "system_prompt": """You are the Customer Support agent for Chimaridata.

Your role is to:
1. Answer user questions
2. Diagnose issues
3. Guide users through the workflow
4. Provide helpful error messages
5. Escalate complex issues

Be helpful, patient, and clear in your communications.
"""
        }
    }

    @classmethod
    def get_config(cls, agent_type: AgentType) -> Dict:
        """Get configuration for an agent type"""
        return cls.AGENT_CONFIGS.get(agent_type, {})


# ============================================================================
# Tool Definitions
# ============================================================================

# Tools are now centralized in tool_registry.py
# This provides:
# - Semantic matching tools (match_questions_to_elements, select_analysis_types)
# - Transformation tools (execute_transformations, compile_transformation_plan)
# - Analysis tools (execute_analysis, get_analysis_status)
# - Evidence chain tools (query_evidence_chain)
# - Business definition tools (lookup_business_definition, get_business_definition)
# - Data ingestion tools (get_dataset_schema)
# - Utility tools (search_web, execute_python)

def get_agent_tools() -> List:
    """
    Get available tools for agents (legacy function for backward compatibility).

    Note: This returns all tools. For agent-specific tools,
    use get_tools_by_agent(agent_type) from tool_registry.
    """
    from .tool_registry import get_all_tools
    return get_all_tools()


def get_tools_by_agent_type(agent_type: AgentType | str) -> List:
    """
    Get tools appropriate for a specific agent type.

    Args:
        agent_type: Type of agent (from AgentType enum)

    Returns:
        List of tools available to the agent
    """
    normalized_agent_type = agent_type.value if isinstance(agent_type, AgentType) else str(agent_type)
    return get_tools_by_agent(normalized_agent_type)


# ============================================================================
# LLM Factory
# ============================================================================

class LLMFactory:
    """Factory for creating LLM instances"""

    @staticmethod
    def create(
        model: str = None,
        provider: str = "openai",
        temperature: float = 0.3
    ):
        """Create an LLM instance with support for multiple providers

        Args:
            model: Model name (uses provider default if not specified)
            provider: Provider name (openai, anthropic, gemini, openrouter, ollama)
            temperature: Sampling temperature

        Returns:
            LangChain Chat model instance
        """
        try:
            return get_llm(
                provider=LLMProvider(provider),
                model=model,
                temperature=temperature
            )
        except ValueError as e:
            logger.error(f"Failed to create LLM: {e}")
            # Fallback to default OpenAI
            return get_llm(
                provider=LLMProvider.OPENAI,
                model=model or "gpt-4",
                temperature=temperature
            )


# ============================================================================
# Workflow Step Functions
# ============================================================================

ANALYSIS_MODULE_FILE_MAP: Dict[str, str] = {
    "descriptive_stats": "descriptive_stats.py",
    "descriptive": "descriptive_stats.py",
    "correlation": "correlation_analysis.py",
    "regression": "regression_analysis.py",
    "clustering": "clustering_analysis.py",
    "time_series": "time_series_analysis.py",
    "statistical_tests": "statistical_tests.py",
    "classification": "classification_analysis.py",
    "eda": "eda_analysis.py",
    "comparative": "statistical_tests.py",
}


def _coerce_json(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return value
    return value


def _extract_rows(payload: Any) -> List[Dict[str, Any]]:
    normalized = _coerce_json(payload)

    if isinstance(normalized, dict):
        for key in ("data", "rows", "records"):
            candidate = normalized.get(key)
            if isinstance(candidate, list):
                rows = [row for row in candidate if isinstance(row, dict)]
                if rows:
                    return rows
    elif isinstance(normalized, list):
        rows = [row for row in normalized if isinstance(row, dict)]
        if rows:
            return rows

    return []


def _safe_scalar_pairs(summary: Dict[str, Any], limit: int = 2) -> List[str]:
    points: List[str] = []
    for key, value in summary.items():
        if isinstance(value, (str, int, float, bool)):
            points.append(f"{key}: {value}")
        elif isinstance(value, list) and value and all(isinstance(v, (str, int, float, bool)) for v in value[:3]):
            points.append(f"{key}: {', '.join(str(v) for v in value[:3])}")
        if len(points) >= limit:
            break
    return points


async def _load_project_dataset_ids(project_id: str) -> List[str]:
    async with get_db_context() as session:
        result = await session.execute(
            sa_text(
                "SELECT id FROM datasets "
                "WHERE project_id = :project_id "
                "ORDER BY created_at ASC"
            ),
            {"project_id": project_id},
        )
        return [str(row[0]) for row in result.fetchall() if row and row[0]]


async def _load_dataset_rows(
    project_id: str,
    dataset_ids: List[str],
) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    normalized_dataset_ids = [str(dataset_id) for dataset_id in (dataset_ids or []) if str(dataset_id).strip()]

    async with get_db_context() as session:
        column_result = await session.execute(
            sa_text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'datasets'"
            )
        )
        dataset_columns = {row[0] for row in column_result.fetchall()}

        selectable_columns = ["id", "project_id"]
        for candidate in ("ingestion_metadata", "metadata", "data", "preview"):
            if candidate in dataset_columns:
                selectable_columns.append(candidate)

        where_parts = ["d.project_id = :project_id"]
        params: Dict[str, Any] = {"project_id": project_id}

        if normalized_dataset_ids:
            placeholders: List[str] = []
            for index, dataset_id in enumerate(normalized_dataset_ids):
                key = f"dataset_id_{index}"
                params[key] = dataset_id
                placeholders.append(f":{key}")
            where_parts.append(f"d.id IN ({', '.join(placeholders)})")

        select_clause = ", ".join([f'd.\"{col}\"' for col in selectable_columns])
        dataset_query = (
            f"SELECT {select_clause} FROM datasets d "
            f"WHERE {' AND '.join(where_parts)} "
            f"ORDER BY d.created_at ASC LIMIT 1"
        )
        dataset_result = await session.execute(sa_text(dataset_query), params)
        dataset_row = dataset_result.first()
        if dataset_row is None:
            return None, []

        dataset_data = dict(zip(dataset_result.keys(), dataset_row))
        candidates = [
            (_coerce_json(dataset_data.get("ingestion_metadata")) or {}).get("transformedData")
            if isinstance(_coerce_json(dataset_data.get("ingestion_metadata")), dict)
            else None,
            (_coerce_json(dataset_data.get("metadata")) or {}).get("transformedData")
            if isinstance(_coerce_json(dataset_data.get("metadata")), dict)
            else None,
            _coerce_json(dataset_data.get("data")),
            _coerce_json(dataset_data.get("preview")),
        ]

        for candidate in candidates:
            rows = _extract_rows(candidate)
            if rows:
                return str(dataset_data.get("id")), rows

    return None, []


def _normalize_analysis_output(analysis_type: str, payload: Any, error: Optional[str] = None) -> Dict[str, Any]:
    if not isinstance(payload, dict):
        payload = {}

    raw_errors = payload.get("errors")
    normalized_errors: List[str] = []
    if isinstance(raw_errors, list):
        normalized_errors.extend([str(item) for item in raw_errors if item is not None and str(item).strip()])
    elif raw_errors is not None:
        normalized_errors.append(str(raw_errors))
    if error:
        normalized_errors.append(error)

    return {
        "success": bool(payload.get("success", False)) and not normalized_errors,
        "analysis_type": str(payload.get("analysis_type") or analysis_type),
        "data": payload.get("data") if isinstance(payload.get("data"), dict) else {},
        "metadata": payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
        "errors": normalized_errors,
    }


async def _execute_analysis_module(
    analysis_type: str,
    project_id: str,
    dataset_id: Optional[str],
    rows: List[Dict[str, Any]],
    pii_columns: Optional[List[str]] = None,
) -> Dict[str, Any]:
    module_file = ANALYSIS_MODULE_FILE_MAP.get(str(analysis_type).strip().lower())
    if not module_file:
        return _normalize_analysis_output(
            analysis_type,
            {},
            error=f"Unsupported analysis type: {analysis_type}",
        )

    module_path = Path(__file__).resolve().parent.parent / "analysis_modules" / module_file
    if not module_path.exists():
        return _normalize_analysis_output(
            analysis_type,
            {},
            error=f"Analysis module not found: {module_file}",
        )

    input_payload = {
        "data": rows[:1000],
        "project_id": project_id,
        "dataset_id": dataset_id,
        "pii_columns_to_exclude": pii_columns or [],
        "analysis_type": analysis_type,
    }

    try:
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            str(module_path),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate(
            input=json.dumps(input_payload).encode("utf-8")
        )
    except Exception as exc:
        return _normalize_analysis_output(
            analysis_type,
            {},
            error=f"Failed to start module {module_file}: {exc}",
        )

    if process.returncode != 0:
        error_text = stderr.decode("utf-8", errors="ignore").strip() or "Unknown module failure"
        return _normalize_analysis_output(
            analysis_type,
            {},
            error=f"Module execution failed ({module_file}): {error_text}",
        )

    raw_output = stdout.decode("utf-8", errors="ignore").strip()
    if not raw_output:
        return _normalize_analysis_output(
            analysis_type,
            {},
            error=f"Module {module_file} returned empty output",
        )

    parsed_output: Optional[Dict[str, Any]] = None
    try:
        parsed_output = json.loads(raw_output)
    except Exception:
        start = raw_output.find("{")
        end = raw_output.rfind("}")
        if start != -1 and end > start:
            try:
                parsed_output = json.loads(raw_output[start:end + 1])
            except Exception:
                parsed_output = None

    if parsed_output is None:
        return _normalize_analysis_output(
            analysis_type,
            {},
            error=f"Unable to parse JSON output from {module_file}",
        )

    return _normalize_analysis_output(analysis_type, parsed_output)


def _build_insights_from_results(analysis_results: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    insights: List[Dict[str, Any]] = []
    timestamp = datetime.utcnow().isoformat()

    for analysis_type, result in analysis_results.items():
        if not isinstance(result, dict):
            continue
        if not result.get("success"):
            continue

        data = result.get("data") if isinstance(result.get("data"), dict) else {}
        summary = data.get("summary") if isinstance(data.get("summary"), dict) else {}
        points = _safe_scalar_pairs(summary, limit=3)
        description = (
            "; ".join(points)
            if points
            else f"{analysis_type.replace('_', ' ').title()} completed with grounded dataset output."
        )

        insights.append({
            "id": f"ins_{analysis_type}",
            "type": "statistical",
            "title": f"{analysis_type.replace('_', ' ').title()} Findings",
            "description": description,
            "significance": "medium",
            "evidence": {
                "analysis_type": analysis_type,
                "summary_points": points,
            },
            "data_elements_used": [],
            "confidence": 0.7,
            "generated_by": "Data Scientist Agent",
            "created_at": timestamp,
        })

    if not insights:
        insights.append({
            "id": "ins_no_results",
            "type": "statistical",
            "title": "No Computable Insights",
            "description": "The current dataset/question configuration did not produce valid analysis output.",
            "significance": "low",
            "evidence": {"reason": "no_successful_analysis"},
            "data_elements_used": [],
            "confidence": 0.2,
            "generated_by": "Data Scientist Agent",
            "created_at": timestamp,
        })

    return insights


def _build_answers_from_results(
    user_questions: List[str],
    question_mappings: List[Dict[str, Any]],
    analysis_results: Dict[str, Dict[str, Any]],
) -> List[Dict[str, Any]]:
    answers: List[Dict[str, Any]] = []
    success_results = {
        analysis_type: result
        for analysis_type, result in analysis_results.items()
        if isinstance(result, dict) and result.get("success")
    }

    for index, question in enumerate(user_questions):
        mapping = question_mappings[index] if index < len(question_mappings) and isinstance(question_mappings[index], dict) else {}
        question_id = str(mapping.get("question_id") or f"q_{index + 1}")
        recommended = mapping.get("recommended_analyses")
        recommended_set = set(recommended) if isinstance(recommended, list) else set()

        if recommended_set:
            matched = [atype for atype in success_results.keys() if atype in recommended_set]
        else:
            matched = list(success_results.keys())

        if matched:
            first_result = success_results[matched[0]]
            summary = first_result.get("data", {}).get("summary", {})
            points = _safe_scalar_pairs(summary, limit=2) if isinstance(summary, dict) else []
            detail = f" Key points: {'; '.join(points)}." if points else ""
            answer_text = (
                f"We answered this question using {', '.join(matched[:3])}."
                f"{detail}"
            )
            confidence = float(mapping.get("confidence")) if mapping.get("confidence") is not None else 0.7
        else:
            answer_text = (
                "We could not generate a grounded numeric answer from the current data. "
                "Please verify the mapped metrics and required columns."
            )
            confidence = 0.2

        answers.append({
            "question_id": question_id,
            "question_text": question,
            "answer": answer_text,
            "confidence": max(0.0, min(1.0, confidence)),
            "evidence_summary": matched[:3],
        })

    return answers


def _build_evidence_chain(
    project_id: str,
    question_mappings: List[Dict[str, Any]],
    insights: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    chain: List[Dict[str, Any]] = []
    insight_ids = [insight.get("id") for insight in insights if isinstance(insight, dict) and insight.get("id")]

    for mapping in question_mappings:
        if not isinstance(mapping, dict):
            continue
        question_id = str(mapping.get("question_id") or "")
        if not question_id:
            continue
        confidence = mapping.get("confidence")
        try:
            confidence_value = float(confidence)
        except Exception:
            confidence_value = 0.6

        for insight_id in insight_ids:
            chain.append({
                "id": f"{question_id}_{insight_id}",
                "project_id": project_id,
                "source_type": "question",
                "source_id": question_id,
                "target_type": "insight",
                "target_id": insight_id,
                "link_type": "question_element",
                "confidence": max(0.0, min(1.0, confidence_value)),
                "created_at": datetime.utcnow().isoformat(),
            })

    return chain


async def step_upload(state: WorkflowState) -> WorkflowState:
    """
    Upload Step - Handle dataset upload
    """
    logger.info(f"[Project Manager] Upload step for project {state['project_id']}")

    # Update messages
    state["messages"].append(
        SystemMessage(content="Processing dataset upload...")
    )

    # Emit progress via WebSocket
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="upload",
            progress=10,
            message="Processing dataset upload..."
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    # Load existing project datasets as the execution context for downstream steps.
    try:
        dataset_ids = await _load_project_dataset_ids(state["project_id"])
        state["datasets"] = dataset_ids
        state["primary_dataset_id"] = dataset_ids[0] if dataset_ids else None
        if not dataset_ids:
            state["error"] = "No datasets found for this project. Upload data before running analysis."
    except Exception as e:
        logger.warning(
            f"Dataset loading unavailable for project {state['project_id']}: {e}. "
            "Continuing with any pre-populated dataset context."
        )
        datasets = state.get("datasets") or []
        state["datasets"] = datasets
        if not state.get("primary_dataset_id") and datasets:
            state["primary_dataset_id"] = datasets[0]

    state["completed_steps"].append("upload")
    state["next_step"] = "pii_review"

    return state


async def step_pii_review(state: WorkflowState) -> WorkflowState:
    """
    PII Review Step - Review and handle PII detection
    """
    logger.info(f"[Project Manager] PII review step for project {state['project_id']}")

    state["messages"].append(
        SystemMessage(content="Reviewing PII detection results...")
    )

    # Emit progress via WebSocket
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="pii_review",
            progress=25,
            message="Reviewing PII detection results..."
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    # In a real implementation, this would:
    # 1. Check PII detection results
    # 2. Present to user for decision
    # 3. Store user's PII decision

    state["completed_steps"].append("pii_review")
    state["next_step"] = "mapping"

    return state


async def step_mapping(state: WorkflowState) -> WorkflowState:
    """
    Mapping Step - Match questions to data elements using semantic matching
    """
    logger.info(f"[Project Manager] Mapping step for project {state['project_id']}")

    state["messages"].append(
        SystemMessage(content="Mapping questions to data elements...")
    )

    # Emit progress via WebSocket
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="mapping",
            progress=50,
            message="Mapping questions to data elements..."
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    # Use semantic matching service
    from .semantic_matching import (
        get_question_element_mappings,
        select_analysis_types_for_questions,
    )

    try:
        mappings = await get_question_element_mappings(
            questions=state["user_questions"],
            datasets=state["datasets"],
            user_goals=state["user_goals"]
        )
    except Exception as e:
        logger.warning(
            f"Semantic mapping service unavailable for project {state['project_id']}: {e}. "
            "Using deterministic fallback mappings."
        )
        mappings = []
        for index, question in enumerate(state.get("user_questions", [])):
            suggested_analyses = select_analysis_types_for_questions(
                questions=[question],
                mappings=[],
                user_goals=state.get("user_goals", []),
            )
            mappings.append({
                "question_id": f"q_{index + 1}",
                "question_text": question,
                "related_elements": [],
                "related_columns": [],
                "relevance_scores": [],
                "recommended_analyses": suggested_analyses,
                "business_context": f"Goals: {', '.join(state.get('user_goals', []))}",
                "intent_type": None,
                "confidence": 0.4,
                "embedding": None,
            })

    # Emit completion with mapping results
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="mapping",
            progress=100,
            message=f"Completed mapping: {len(mappings)} questions mapped",
            data={"mappings_count": len(mappings)}
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    state["question_mappings"] = [m.dict() if hasattr(m, 'dict') else m for m in mappings]
    state["completed_steps"].append("mapping")
    state["next_step"] = "transformation"

    return state


async def step_transformation(state: WorkflowState) -> WorkflowState:
    """
    Transformation Step - Compile and execute transformations
    """
    logger.info(f"[Project Manager] Transformation step for project {state['project_id']}")

    state["messages"].append(
        SystemMessage(content="Executing transformations...")
    )

    # Emit progress via WebSocket
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="transformation",
            progress=60,
            message="Executing transformations with business context..."
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    # Use transformation engine
    from .transformation_engine import compile_and_execute_transformation_plan

    result = await compile_and_execute_transformation_plan(
        project_id=state["project_id"],
        datasets=state["datasets"],
        mappings=state["question_mappings"],
        business_context={"user_goals": state["user_goals"]}
    )

    if result.get("success"):
        state["transformation_plan"] = result.get("transformation_plan")
        state["transformation_steps"] = result.get("steps_executed", [])
        state["transformation_executed"] = True
        state["transformed_data"] = result.get("transformed_data")
        state["transformed_dataset_id"] = result.get("transformed_dataset_id") or state.get("primary_dataset_id")

        # Emit transformation completion
        try:
            from ..main import emit_progress
            await emit_progress(
                session_id=state.get("session_id", state["project_id"]),
                step="transformation",
                progress=75,
                message=f"Transformation complete: {len(result.get('steps_executed', []))} steps executed",
                data={"steps_count": len(result.get("steps_executed", []))}
            )
        except Exception as e:
            logger.warning(f"Could not emit progress: {e}")
    else:
        state["error"] = result.get("error", "Transformation failed")

        # Emit error
        try:
            from ..main import emit_error
            await emit_error(
                session_id=state.get("session_id", state["project_id"]),
                step="transformation",
                error=state["error"]
            )
        except Exception as e:
            logger.warning(f"Could not emit error: {e}")

    state["completed_steps"].append("transformation")
    state["next_step"] = "execution"

    return state


async def step_execution(state: WorkflowState) -> WorkflowState:
    """
    Execution Step - Run analyses
    """
    logger.info(f"[Project Manager] Execution step for project {state['project_id']}")

    state["messages"].append(
        SystemMessage(content="Running analyses...")
    )

    # Emit progress via WebSocket
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="execution",
            progress=80,
            message="Selecting and executing analyses..."
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    # Select analysis types based on question intents
    from .semantic_matching import select_analysis_types_for_questions

    analysis_types = select_analysis_types_for_questions(
        questions=state["user_questions"],
        mappings=state["question_mappings"],
        user_goals=state["user_goals"]
    )

    state["analysis_types"] = analysis_types
    state["analysis_in_progress"] = True

    # Emit analysis types selected
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="execution",
            progress=85,
            message=f"Executing {len(analysis_types)} analysis types...",
            data={"analysis_types": analysis_types}
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    transformed_rows = _extract_rows(state.get("transformed_data"))
    dataset_id = state.get("transformed_dataset_id") or state.get("primary_dataset_id")

    if not transformed_rows:
        try:
            fallback_dataset_id, fallback_rows = await _load_dataset_rows(
                project_id=state["project_id"],
                dataset_ids=state.get("datasets", []),
            )
            transformed_rows = fallback_rows
            if fallback_dataset_id and not dataset_id:
                dataset_id = fallback_dataset_id
        except Exception as e:
            logger.warning(
                f"Dataset row fallback unavailable for project {state['project_id']}: {e}"
            )

    if not transformed_rows:
        state["analysis_results"] = {}
        state["analysis_in_progress"] = False
        state["error"] = "No dataset rows available for analysis execution."
        try:
            from ..main import emit_error
            await emit_error(
                session_id=state.get("session_id", state["project_id"]),
                step="execution",
                error=state["error"],
            )
        except Exception as e:
            logger.warning(f"Could not emit error: {e}")
    else:
        analysis_results: Dict[str, Dict[str, Any]] = {}
        total = max(len(analysis_types), 1)

        for idx, analysis_type in enumerate(analysis_types):
            run_result = await _execute_analysis_module(
                analysis_type=analysis_type,
                project_id=state["project_id"],
                dataset_id=str(dataset_id) if dataset_id else None,
                rows=transformed_rows,
                pii_columns=[],
            )
            analysis_results[analysis_type] = run_result

            try:
                from ..main import emit_progress
                per_type_progress = 85 + int(((idx + 1) / total) * 8)
                await emit_progress(
                    session_id=state.get("session_id", state["project_id"]),
                    step="execution",
                    progress=per_type_progress,
                    message=f"Completed {analysis_type}",
                    data={
                        "analysis_type": analysis_type,
                        "success": run_result.get("success", False),
                    },
                )
            except Exception as e:
                logger.warning(f"Could not emit progress: {e}")

        success_count = sum(1 for result in analysis_results.values() if result.get("success"))
        state["analysis_results"] = analysis_results
        state["analysis_in_progress"] = False
        if success_count == 0:
            state["error"] = "All analysis modules failed. Check dataset validity and module errors."

    # Emit execution completion
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="execution",
            progress=90,
            message="Analysis execution complete",
            data={
                "analysis_count": len(state.get("analysis_results", {})),
                "successful_count": sum(
                    1 for result in state.get("analysis_results", {}).values()
                    if isinstance(result, dict) and result.get("success")
                ),
            }
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    state["completed_steps"].append("execution")
    state["next_step"] = "results"

    return state


async def step_results(state: WorkflowState) -> WorkflowState:
    """
    Results Step - Interpret results and generate insights
    """
    logger.info(f"[Project Manager] Results step for project {state['project_id']}")

    state["messages"].append(
        SystemMessage(content="Generating insights from analysis results...")
    )

    # Emit progress via WebSocket
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="results",
            progress=95,
            message="Generating insights from analysis results..."
        )
    except Exception as e:
        logger.warning(f"Could not emit progress: {e}")

    insights = _build_insights_from_results(state.get("analysis_results", {}))
    answers = _build_answers_from_results(
        user_questions=state.get("user_questions", []),
        question_mappings=state.get("question_mappings", []),
        analysis_results=state.get("analysis_results", {}),
    )
    evidence_chain = _build_evidence_chain(
        project_id=state["project_id"],
        question_mappings=state.get("question_mappings", []),
        insights=insights,
    )

    state["insights"] = insights
    state["answers"] = answers
    state["evidence_chain"] = evidence_chain

    # Emit workflow completion
    try:
        from ..main import emit_completion
        await emit_completion(
            session_id=state.get("session_id", state["project_id"]),
            step="results",
            message=f"Analysis complete: {len(state.get('insights', []))} insights generated",
            results={
                "insights_count": len(state.get("insights", [])),
                "answers_count": len(state.get("answers", [])),
                "analysis_types": state["analysis_types"],
                "questions_answered": len(state["user_questions"])
            }
        )
    except Exception as e:
        logger.warning(f"Could not emit completion: {e}")

    state["completed_steps"].append("results")
    state["next_step"] = None  # End of workflow

    return state


# ============================================================================
# Conditional Edge Functions
# ============================================================================

def should_continue_to_mapping(state: WorkflowState) -> Literal["mapping", "upload"]:
    """Check if we should continue to mapping step"""
    if "upload" in state["completed_steps"]:
        return "mapping"
    return "upload"


def should_continue_to_transformation(state: WorkflowState) -> Literal["transformation", "mapping"]:
    """Check if we should continue to transformation step"""
    if "mapping" in state["completed_steps"]:
        return "transformation"
    return "mapping"


def should_continue_to_execution(state: WorkflowState) -> Literal["execution", "transformation"]:
    """Check if we should continue to execution step"""
    if "transformation" in state["completed_steps"]:
        return "execution"
    return "transformation"


def should_continue_to_results(state: WorkflowState) -> Literal["results", "execution"]:
    """Check if we should continue to results step"""
    if "execution" in state["completed_steps"]:
        return "results"
    return "execution"


def should_end(state: WorkflowState) -> Literal["end", "results"]:
    """Check if we should end the workflow"""
    if "results" in state["completed_steps"]:
        return "end"
    return "results"


# ============================================================================
# Workflow Graph Builder
# ============================================================================

def create_analysis_workflow() -> StateGraph:
    """
    Create a LangGraph state machine for the analysis workflow

    Returns a StateGraph that can be executed and visualized
    """
    # Create the workflow graph
    workflow = StateGraph(WorkflowState)

    # Add nodes (workflow steps)
    workflow.add_node("upload", step_upload)
    workflow.add_node("pii_review", step_pii_review)
    workflow.add_node("mapping", step_mapping)
    workflow.add_node("transformation", step_transformation)
    workflow.add_node("execution", step_execution)
    workflow.add_node("results", step_results)

    # Add edges (connections between steps)
    workflow.set_entry_point("upload")

    workflow.add_edge("upload", "pii_review")
    workflow.add_edge("pii_review", "mapping")
    workflow.add_edge("mapping", "transformation")
    workflow.add_edge("transformation", "execution")
    workflow.add_edge("execution", "results")
    workflow.add_edge("results", END)

    # Add checkpoint saver for state persistence
    memory = MemorySaver()
    workflow.checkpointer = memory

    return workflow


# ============================================================================
# Orchestrator Class
# ============================================================================

class AgentOrchestrator:
    """
    Main orchestrator for agentic workflows

    Coordinates multiple agents through LangGraph state machine.
    Handles session management, state persistence, and real-time updates.
    """

    def __init__(self):
        """Initialize the orchestrator"""
        self.workflow = create_analysis_workflow()
        self.sessions: Dict[str, WorkflowState] = {}
        # Gracefully handle missing API key — orchestrator can run without LLM
        try:
            self.llm = LLMFactory.create()
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"LLM unavailable, orchestrator running in degraded mode: {e}")
            self.llm = None
        self.tools = get_agent_tools()
        self.tool_registry = get_tool_registry()
        self.deepagent_runtime = DeepAgentRuntime(llm=self.llm)
        if self.deepagent_runtime.enabled and not self.deepagent_runtime.is_available():
            logger.warning(
                "DeepAgent is enabled but unavailable (%s). Falling back to legacy agent executor.",
                self.deepagent_runtime.availability_error or "unknown_error",
            )

    def _build_deepagent_subagents(self, agent_type: AgentType) -> List[Dict[str, Any]]:
        """
        Build subagent specifications for DeepAgent.

        Project Manager is configured with specialist subagents so delegation
        follows the platform's modular role boundaries.
        """
        if agent_type != AgentType.PROJECT_MANAGER:
            return []

        specialist_types = [
            AgentType.DATA_ENGINEER,
            AgentType.DATA_SCIENTIST,
            AgentType.BUSINESS_AGENT,
        ]
        subagents: List[Dict[str, Any]] = []
        for specialist in specialist_types:
            specialist_config = AgentConfig.get_config(specialist)
            specialist_tools = get_tools_by_agent_type(specialist.value)
            subagents.append(
                {
                    "name": specialist.value,
                    "description": specialist_config.get("description", specialist.value),
                    "system_prompt": specialist_config.get("system_prompt", "You are a helpful specialist."),
                    "tools": specialist_tools,
                }
            )
        return subagents

    def create_agent_with_tools(self, agent_type: AgentType):
        """
        Create an agent instance with tools bound for the specific agent type.

        Args:
            agent_type: Type of agent to create

        Returns:
            LangChain agent with tools bound
        """
        # Get tools appropriate for this agent type
        tools = get_tools_by_agent_type(agent_type.value)

        # Get agent configuration
        config = AgentConfig.get_config(agent_type)
        system_prompt = config.get("system_prompt", "You are a helpful assistant.")

        # Preferred runtime path: DeepAgent (LangChain native deep orchestration).
        if self.deepagent_runtime.is_available():
            deep_agent = self.deepagent_runtime.create_agent(
                name=agent_type.value,
                instructions=system_prompt,
                tools=tools,
                subagents=self._build_deepagent_subagents(agent_type),
            )
            if deep_agent is not None:
                return deep_agent

        # Fallback runtime path: legacy OpenAI function agent.
        if self.llm is None:
            return None

        from langchain.agents import AgentExecutor, create_openai_functions_agent
        from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", system_prompt),
                ("human", "{input}"),
                MessagesPlaceholder(variable_name="agent_scratchpad"),
            ]
        )

        agent = create_openai_functions_agent(
            llm=self.llm,
            tools=tools,
            prompt=prompt
        )

        # Create agent executor
        agent_executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True,
            handle_parsing_errors=True
        )

        return agent_executor

    async def run_agent_task(
        self,
        *,
        agent_type: AgentType,
        task: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Run a single task through the configured agent runtime.

        Prefers DeepAgent when available; falls back to AgentExecutor.
        """
        agent = self.create_agent_with_tools(agent_type)
        if agent is None:
            return {
                "success": False,
                "agent_type": agent_type.value,
                "error": "No agent runtime available",
                "response": "",
            }

        context_payload = json.dumps(context or {}, ensure_ascii=False)
        user_message = (
            f"Task:\n{task.strip()}\n\n"
            f"Context JSON:\n{context_payload}\n\n"
            "Requirements:\n"
            "1. Stay grounded in provided context and available tools.\n"
            "2. Do not invent unavailable data or unsupported tool outputs.\n"
            "3. If data is missing, explain what is needed."
        )

        # DeepAgent path
        if self.deepagent_runtime.is_available() and not hasattr(agent, "ainvoke") and not hasattr(agent, "invoke"):
            # Defensive fallback for unexpected object types.
            return {
                "success": False,
                "agent_type": agent_type.value,
                "error": "Agent runtime returned non-invokable object",
                "response": "",
            }

        if self.deepagent_runtime.is_available():
            deep_result = await self.deepagent_runtime.invoke(agent, user_message)
            return {
                "success": deep_result.success,
                "agent_type": agent_type.value,
                "error": deep_result.error,
                "response": deep_result.content,
                "runtime": "deepagent",
                "raw": deep_result.raw,
            }

        # Legacy AgentExecutor path
        try:
            if hasattr(agent, "ainvoke"):
                raw = await agent.ainvoke({"input": user_message})
            elif hasattr(agent, "invoke"):
                raw = await asyncio.to_thread(agent.invoke, {"input": user_message})
            else:
                return {
                    "success": False,
                    "agent_type": agent_type.value,
                    "error": "Legacy agent runtime is not invokable",
                    "response": "",
                }

            response_text = ""
            if isinstance(raw, dict):
                response_text = str(raw.get("output") or raw.get("result") or raw)
            else:
                response_text = str(raw)

            return {
                "success": True,
                "agent_type": agent_type.value,
                "error": None,
                "response": response_text,
                "runtime": "legacy_agent_executor",
                "raw": raw,
            }
        except Exception as exc:
            logger.error("Agent task failed for %s: %s", agent_type.value, exc, exc_info=True)
            return {
                "success": False,
                "agent_type": agent_type.value,
                "error": str(exc),
                "response": "",
            }

    def create_session(
        self,
        project_id: str,
        user_id: str,
        user_goals: List[str],
        user_questions: List[str]
    ) -> str:
        """
        Create a new workflow session

        Returns the session ID
        """
        session_id = f"session_{uuid.uuid4().hex}"

        initial_state: WorkflowState = {
            "project_id": project_id,
            "user_id": user_id,
            "user_goals": user_goals,
            "user_questions": user_questions,
            "current_step": "upload",
            "messages": [
                SystemMessage(content="Analysis workflow initialized.")
            ],
            "datasets": [],
            "primary_dataset_id": None,
            "question_mappings": [],
            "transformation_plan": None,
            "transformation_executed": False,
            "analysis_types": [],
            "analysis_results": {},
            "evidence_chain": [],
            "agent_states": {},
            "completed_steps": [],
            "next_step": "upload",
            "error": None
        }
        initial_state["session_id"] = session_id

        self.sessions[session_id] = initial_state
        logger.info(f"Created session {session_id} for project {project_id}")

        return session_id

    def get_session(self, session_id: str) -> Optional[WorkflowState]:
        """Get a session by ID"""
        return self.sessions.get(session_id)

    def advance_session(
        self,
        session_id: str,
        user_input: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Advance a session to the next step

        Returns the updated state
        """
        session = self.get_session(session_id)
        if not session:
            return {"error": f"Session {session_id} not found"}

        # Apply user input to state if provided
        if user_input:
            session.update(user_input)

        # Execute the next step
        try:
            # Compile and invoke the workflow
            compiled_workflow = self.workflow.compile()

            # Run from current state
            result = compiled_workflow.invoke(session)

            # Update session state
            self.sessions[session_id] = result

            logger.info(f"Advanced session {session_id} to {result.get('current_step')}")

            return {
                "session_id": session_id,
                "current_step": result.get("current_step"),
                "next_step": result.get("next_step"),
                "completed_steps": result.get("completed_steps", []),
                "error": result.get("error")
            }

        except Exception as e:
            logger.error(f"Error advancing session {session_id}: {e}", exc_info=True)
            return {
                "error": f"Failed to advance session: {str(e)}",
                "session_id": session_id
            }

    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """Get the status of a session"""
        session = self.get_session(session_id)
        if not session:
            return {"error": f"Session {session_id} not found"}

        return {
            "session_id": session_id,
            "current_step": session.get("current_step"),
            "completed_steps": session.get("completed_steps", []),
            "next_step": session.get("next_step"),
            "error": session.get("error"),
            "datasets": len(session.get("datasets", [])),
            "mappings": len(session.get("question_mappings", [])),
            "analyses": len(session.get("analysis_results", {}))
        }

    def cleanup_session(self, session_id: str) -> bool:
        """Remove a session from memory"""
        if session_id in self.sessions:
            del self.sessions[session_id]
            logger.info(f"Cleaned up session {session_id}")
            return True
        return False

    async def invoke_tool(
        self,
        tool_name: str,
        agent_type: AgentType,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Invoke a tool on behalf of an agent.

        This allows agents to call tools through the orchestrator,
        with proper tool filtering and logging.

        Args:
            tool_name: Name of the tool to invoke
            agent_type: Type of agent making the call
            **kwargs: Parameters to pass to the tool

        Returns:
            Tool execution result
        """
        try:
            logger.info(f"Agent {agent_type.value} invoking tool: {tool_name}")

            # Get the tool from registry
            from .tool_registry import call_tool
            result = await call_tool(tool_name, **kwargs)

            return {
                "success": True,
                "tool_name": tool_name,
                "agent_type": agent_type.value,
                "result": result
            }
        except Exception as e:
            logger.error(f"Error invoking tool {tool_name}: {e}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "tool_name": tool_name,
                "agent_type": agent_type.value
            }

    def get_tools_by_agent(self, agent_type: AgentType) -> List:
        """
        Get tools available to a specific agent type.

        Args:
            agent_type: Type of agent

        Returns:
            List of tools available to the agent
        """
        return get_tools_by_agent_type(agent_type)

    def list_all_tools(self) -> List[str]:
        """
        List all available tool names.

        Returns:
            List of tool names
        """
        return self.tool_registry.list_tools()

    def get_workflow_graph(self) -> Dict[str, Any]:
        """Get the workflow graph structure for visualization"""
        return {
            "nodes": [
                {"id": "upload", "label": "Upload"},
                {"id": "pii_review", "label": "PII Review"},
                {"id": "mapping", "label": "Mapping"},
                {"id": "transformation", "label": "Transformation"},
                {"id": "execution", "label": "Execution"},
                {"id": "results", "label": "Results"}
            ],
            "edges": [
                {"source": "upload", "target": "pii_review"},
                {"source": "pii_review", "target": "mapping"},
                {"source": "mapping", "target": "transformation"},
                {"source": "transformation", "target": "execution"},
                {"source": "execution", "target": "results"}
            ]
        }


# ============================================================================
# Singleton Instance
# ============================================================================

_orchestrator_instance: Optional[AgentOrchestrator] = None


def get_orchestrator() -> AgentOrchestrator:
    """Get the singleton orchestrator instance"""
    global _orchestrator_instance
    if _orchestrator_instance is None:
        _orchestrator_instance = AgentOrchestrator()
    return _orchestrator_instance


# ============================================================================
# Test/Example Usage
# ============================================================================

if __name__ == "__main__":
    import asyncio

    async def main():
        """Example workflow execution"""
        orchestrator = get_orchestrator()

        # Create a session
        session_id = orchestrator.create_session(
            project_id="test-project-123",
            user_id="test-user",
            user_goals=["Understand employee engagement trends"],
            user_questions=["What is the overall engagement score trend?"]
        )

        print(f"Created session: {session_id}")

        # Advance through workflow
        for _ in range(6):  # Number of steps
            result = orchestrator.advance_session(session_id)
            print(f"Step result: {result}")

            # Check if workflow is complete
            status = orchestrator.get_session_status(session_id)
            if not status.get("next_step"):
                print("Workflow complete!")
                break

    asyncio.run(main())
