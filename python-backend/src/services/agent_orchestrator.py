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

from typing import Dict, List, Optional, Any, Literal, TypedDict
from enum import Enum
from datetime import datetime
import logging
import uuid
from functools import partial

# LangChain and LangGraph imports
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool, Tool

# Local imports
from ..models.schemas import (
    JourneyState, JourneyStep, OrchestratorState, AgentState,
    AgentMessage, AgentToolCall, AgentType, QuestionElementMapping,
    AnalysisType, TransformationPlan, Insight
)
from .tool_registry import get_tools_by_agent, get_tool_registry, ToolRegistry
from .llm_providers import get_llm, LLMProvider, LLMConfig

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


def get_tools_by_agent_type(agent_type: AgentType) -> List:
    """
    Get tools appropriate for a specific agent type.

    Args:
        agent_type: Type of agent (from AgentType enum)

    Returns:
        List of tools available to the agent
    """
    return get_tools_by_agent(agent_type.value)


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

    # In a real implementation, this would:
    # 1. Receive uploaded file
    # 2. Parse and validate
    # 3. Infer schema
    # 4. Store in database

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
    from .semantic_matching import get_question_element_mappings

    mappings = await get_question_element_mappings(
        questions=state["user_questions"],
        datasets=state["datasets"],
        user_goals=state["user_goals"]
    )

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

    # Trigger analysis execution (would be async in real implementation)
    # For now, mock results
    state["analysis_results"] = {}

    # Emit execution completion
    try:
        from ..main import emit_progress
        await emit_progress(
            session_id=state.get("session_id", state["project_id"]),
            step="execution",
            progress=90,
            message="Analysis execution complete"
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

    # Use result interpreter
    from .result_interpreter import interpret_and_generate_insights

    insights = await interpret_and_generate_insights(
        analysis_results=state["analysis_results"],
        questions=state["user_questions"],
        mappings=state["question_mappings"],
        user_goals=state["user_goals"]
    )

    state["evidence_chain"] = insights.get("evidence_chain", [])

    # Emit workflow completion
    try:
        from ..main import emit_completion
        await emit_completion(
            session_id=state.get("session_id", state["project_id"]),
            step="results",
            message=f"Analysis complete: {len(state['evidence_chain'])} insights generated",
            results={
                "insights_count": len(state["evidence_chain"]),
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
    if "upload" in state["completed_steps"] and state["primary_dataset_id"]:
        return "mapping"
    return "upload"


def should_continue_to_transformation(state: WorkflowState) -> Literal["transformation", "mapping"]:
    """Check if we should continue to transformation step"""
    if "mapping" in state["completed_steps"] and state["question_mappings"]:
        return "transformation"
    return "mapping"


def should_continue_to_execution(state: WorkflowState) -> Literal["execution", "transformation"]:
    """Check if we should continue to execution step"""
    if "transformation" in state["completed_steps"] and state["transformation_executed"]:
        return "execution"
    return "transformation"


def should_continue_to_results(state: WorkflowState) -> Literal["results", "execution"]:
    """Check if we should continue to results step"""
    if "execution" in state["completed_steps"] and state["analysis_results"]:
        return "results"
    return "execution"


def should_end(state: WorkflowState) -> Literal["end", "results"]:
    """Check if we should end the workflow"""
    if "results" in state["completed_steps"] and state["evidence_chain"]:
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

    # Add conditional edges (for branching logic)
    workflow.add_conditional_edges(
        "upload",
        should_continue_to_mapping,
        {
            "mapping": "mapping",
            "upload": "upload"
        }
    )

    workflow.add_conditional_edges(
        "mapping",
        should_continue_to_transformation,
        {
            "transformation": "transformation",
            "mapping": "mapping"
        }
    )

    workflow.add_conditional_edges(
        "transformation",
        should_continue_to_execution,
        {
            "execution": "execution",
            "transformation": "transformation"
        }
    )

    workflow.add_conditional_edges(
        "execution",
        should_continue_to_results,
        {
            "results": "results",
            "execution": "execution"
        }
    )

    workflow.add_conditional_edges(
        "results",
        should_end,
        {
            "end": END,
            "results": "results"
        }
    )

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
        self.llm = LLMFactory.create()
        self.tools = get_agent_tools()
        self.tool_registry = get_tool_registry()

    def create_agent_with_tools(self, agent_type: AgentType):
        """
        Create an agent instance with tools bound for the specific agent type.

        Args:
            agent_type: Type of agent to create

        Returns:
            LangChain agent with tools bound
        """
        from langchain.agents import AgentExecutor, create_openai_functions_agent
        from langchain.prompts import PromptTemplate

        # Get tools appropriate for this agent type
        tools = get_tools_by_agent_type(agent_type.value)

        # Get agent configuration
        config = AgentConfig.get_config(agent_type)

        # Create prompt with system message
        prompt = PromptTemplate(
            template=config.get("system_prompt", "You are a helpful assistant."),
            input_variables=["input"]
        )

        # Create agent with tools
        # Note: In production, you'd use the appropriate agent type
        # (e.g., create_openai_functions_agent for OpenAI)
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
