"""
Analysis Orchestrator Service

Coordinates analysis execution across the platform.

Based on PDF requirements:
- Executes all analysis types recommended from preparation
- Maintains consistency across data elements and transformed datasets
- Reconciles results to answer user questions
- Creates evidence chain including PDFs, PowerPoint, and dashboard
- Collaborates with BA and PM for result interpretation

This service coordinates the actual Python analysis modules.
"""

from typing import Dict, List, Optional, Any, AsyncGenerator
import logging
import asyncio
from datetime import datetime
from dataclasses import dataclass, asdict

# Local imports
from ..models.schemas import (
    AnalysisType, AnalysisRequest, AnalysisResult,
    Insight, EvidenceLink, QuestionElementMapping,
    TransformationResult
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class AnalysisContext:
    """Context for an analysis execution"""
    project_id: str
    user_id: str
    dataset_id: str
    analysis_types: List[AnalysisType]
    question_mappings: List[QuestionElementMapping]
    business_context: Optional[Dict[str, Any]] = None
    transformed_data: Optional[Dict[str, Any]] = None
    column_filters: Optional[Dict[str, Any]] = None


@dataclass
class AnalysisProgress:
    """Progress update for analysis execution"""
    session_id: str
    step: str
    percentage: float
    message: str
    timestamp: datetime
    data: Optional[Dict[str, Any]] = None


@dataclass
class ReconciledResult:
    """Result after reconciling all analyses"""
    answers: List[Dict[str, Any]]
    insights: List[Insight]
    evidence_chain: List[EvidenceLink]
    artifacts: Dict[str, Any]
    success: bool
    errors: List[str]


# ============================================================================
# Analysis Orchestration Service
# ============================================================================

class AnalysisOrchestrator:
    """
    Main service for coordinating analysis execution

    This service:
    1. Dispatches analysis requests to appropriate modules
    2. Tracks progress across all analyses
    3. Reconciles results to answer user questions
    4. Creates evidence chain
    5. Generates artifacts (PDFs, presentations)
    """

    def __init__(self, embedding_model=None):
        """
        Initialize the analysis orchestrator

        Args:
            embedding_model: Optional embedding model for RAG
        """
        self.active_sessions: Dict[str, AnalysisContext] = {}
        self.progress_listeners: List[callable] = []

    def add_progress_listener(self, listener: callable):
        """Add a listener for progress updates"""
        self.progress_listeners.append(listener)

    def _notify_progress(self, progress: AnalysisProgress):
        """Notify all progress listeners"""
        for listener in self.progress_listeners:
            try:
                asyncio.create_task(listener(progress))
            except Exception as e:
                logger.error(f"Error notifying listener: {e}", exc_info=True)

    async def execute_single_analysis(
        self,
        context: AnalysisContext,
        analysis_type: AnalysisType,
        data: Any
    ) -> AnalysisResult:
        """
        Execute a single analysis type

        Args:
            context: Analysis context
            analysis_type: Type of analysis to execute
            data: Data to analyze (dict or DataFrame)

        Returns:
            AnalysisResult with standardized output
        """
        try:
            logger.info(
                f"Executing {analysis_type.value} analysis "
                f"for project {context.project_id}"
            )

            # Notify start
            self._notify_progress(AnalysisProgress(
                session_id=context.project_id,
                step=analysis_type.value,
                percentage=0.0,
                message=f"Starting {analysis_type.value} analysis...",
                timestamp=datetime.utcnow()
            ))

            # Import and run the appropriate analysis module
            result = await self._run_analysis_module(
                analysis_type=analysis_type,
                data=data,
                context=context
            )

            # Notify completion
            self._notify_progress(AnalysisProgress(
                session_id=context.project_id,
                step=analysis_type.value,
                percentage=100.0,
                message=f"Completed {analysis_type.value} analysis",
                timestamp=datetime.utcnow(),
                data={"result": result.data}
            ))

            return result

        except Exception as e:
            logger.error(
                f"Error executing {analysis_type.value}: {e}",
                exc_info=True
            )
            return AnalysisResult(
                success=False,
                analysis_type=analysis_type,
                data={},
                metadata={"error_time": datetime.utcnow().isoformat()},
                errors=[f"Analysis failed: {str(e)}"]
            )

    async def _run_analysis_module(
        self,
        analysis_type: AnalysisType,
        data: Any,
        context: AnalysisContext
    ) -> AnalysisResult:
        """
        Run the appropriate analysis module

        Args:
            analysis_type: Type of analysis
            data: Data to analyze
            context: Analysis context

        Returns:
            AnalysisResult with standardized output
        """
        # Map analysis types to modules
        module_map = {
            AnalysisType.DESCRIPTIVE_STATS: "descriptive_stats",
            AnalysisType.CORRELATION: "correlation_analysis",
            AnalysisType.REGRESSION: "regression_analysis",
            AnalysisType.CLUSTERING: "clustering_analysis",
            AnalysisType.CLASSIFICATION: "classification_analysis",
            AnalysisType.TIME_SERIES: "time_series_analysis",
            AnalysisType.STATISTICAL_TESTS: "statistical_tests",
            AnalysisType.TEXT_ANALYSIS: "text_analysis",
            AnalysisType.GROUP_ANALYSIS: "group_analysis"
        }

        module_name = module_map.get(analysis_type)
        if not module_name:
            return AnalysisResult(
                success=False,
                analysis_type=analysis_type,
                data={},
                errors=[f"Unknown analysis type: {analysis_type.value}"]
            )

        # Dynamically import and run the analysis module
        try:
            # Import the analysis module
            from ..analysis_modules import module_name as analysis_module

            # Check if module has a main function
            if hasattr(analysis_module, "main"):
                # Prepare input for the module
                import json
                input_data = {
                    "data": data,
                    "project_id": context.project_id,
                    "pii_columns_to_exclude": [],
                    "question_mappings": [m.dict() for m in context.question_mappings]
                }

                # Run the module
                import subprocess
                import io
                import sys

                # Execute Python script with input
                process = subprocess.Popen(
                    [sys.executable, "-c",
                     f"import json; input_data = json.dumps({json.dumps(input_data)}); "
                     f"exec(open('src/analysis_modules/{module_name}.py').read(), globals())"],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )

                stdout, stderr = process.communicate()

                if process.returncode != 0:
                    raise Exception(f"Module execution failed: {stderr}")

                # Parse result
                result = json.loads(stdout)

                return AnalysisResult(
                    success=result.get("success", False),
                    analysis_type=analysis_type,
                    data=result.get("data", {}),
                    metadata=result.get("metadata", {}),
                    errors=result.get("errors", [])
                )
            else:
                return AnalysisResult(
                    success=False,
                    analysis_type=analysis_type,
                    data={},
                    errors=[f"Module {module_name} has no main function"]
                )

        except ImportError as e:
            return AnalysisResult(
                success=False,
                analysis_type=analysis_type,
                data={},
                errors=[f"Analysis module not found: {str(e)}"]
            )
        except Exception as e:
            return AnalysisResult(
                success=False,
                analysis_type=analysis_type,
                data={},
                errors=[f"Module execution error: {str(e)}"]
            )

    async def execute_multiple_analyses(
        self,
        context: AnalysisContext,
        data: Any
    ) -> Dict[str, AnalysisResult]:
        """
        Execute multiple analysis types in parallel

        Args:
            context: Analysis context
            data: Data to analyze

        Returns:
            Dictionary mapping analysis_type to results
        """
        results = {}

        # Execute all requested analyses
        tasks = []
        for analysis_type in context.analysis_types:
            task = self.execute_single_analysis(
                context=context,
                analysis_type=analysis_type,
                data=data
            )
            tasks.append(task)

        # Wait for all analyses to complete
        completed_results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        for i, result in enumerate(completed_results):
            if isinstance(result, Exception):
                analysis_type = context.analysis_types[i]
                results[analysis_type.value] = AnalysisResult(
                    success=False,
                    analysis_type=analysis_type,
                    data={},
                    errors=[str(result)]
                )
            else:
                results[result.analysis_type.value] = result

        logger.info(
            f"Completed {len(results)}/{len(context.analysis_types)} analyses "
            f"for project {context.project_id}"
        )

        return results

    async def reconcile_results(
        self,
        context: AnalysisContext,
        analysis_results: Dict[str, AnalysisResult]
    ) -> ReconciledResult:
        """
        Reconcile all analysis results to answer user questions

        Collaborates with BA and PM agents to:
        1. Map results to user questions
        2. Generate insights
        3. Create evidence chain
        4. Generate supporting documents

        Args:
            context: Analysis context
            analysis_results: Results from all executed analyses

        Returns:
            ReconciledResult with answers, insights, and artifacts
        """
        try:
            # Import services for reconciliation
            from .result_interpreter import ResultInterpreter
            from .rag_evidence_chain import get_evidence_chain_service

            interpreter = ResultInterpreter()
            evidence_service = get_evidence_chain_service()

            # Generate answers to questions
            answers = await interpreter.generate_answers(
                questions=context.question_mappings,
                analysis_results=analysis_results,
                business_context=context.business_context
            )

            # Generate insights
            insights = await interpreter.generate_insights(
                analysis_results=analysis_results,
                question_mappings=context.question_mappings
            )

            # Create evidence chain
            evidence_chain = []
            for mapping in context.question_mappings:
                # Add question-element links
                for element_id in mapping.related_elements:
                    evidence_chain.append(EvidenceLink(
                        id=f"{mapping.question_id}_{element_id}",
                        project_id=context.project_id,
                        source_type="question",
                        source_id=mapping.question_id,
                        target_type="element",
                        target_id=element_id,
                        link_type="question_element",
                        confidence=mapping.confidence
                    ))

                # Add transformation-insight links
                for insight in insights:
                    for element_id in insight.data_elements_used:
                        evidence_chain.append(EvidenceLink(
                            id=f"{element_id}_{insight.id}",
                            project_id=context.project_id,
                            source_type="element",
                            source_id=element_id,
                            target_type="insight",
                            target_id=insight.id,
                            link_type="transformation_insight",
                            confidence=insight.confidence
                        ))

            # Generate artifacts
            artifacts = await self.generate_artifacts(
                context=context,
                analysis_results=analysis_results,
                insights=insights,
                answers=answers
            )

            return ReconciledResult(
                answers=answers,
                insights=insights,
                evidence_chain=evidence_chain,
                artifacts=artifacts,
                success=True,
                errors=[]
            )

        except Exception as e:
            logger.error(f"Error reconciling results: {e}", exc_info=True)
            return ReconciledResult(
                answers=[],
                insights=[],
                evidence_chain=[],
                artifacts={},
                success=False,
                errors=[f"Reconciliation failed: {str(e)}"]
            )

    async def generate_artifacts(
        self,
        context: AnalysisContext,
        analysis_results: Dict[str, AnalysisResult],
        insights: List[Insight],
        answers: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Generate analysis artifacts (PDFs, PowerPoint, etc.)

        Based on PDF requirements:
        - Generate PDF reports
        - Generate PowerPoint presentations
        - Create dashboard data

        Args:
            context: Analysis context
            analysis_results: Results from all analyses
            insights: Generated insights
            answers: Generated answers

        Returns:
            Dictionary with artifact references
        """
        artifacts = {
            "summary": {
                "total_analyses": len(context.analysis_types),
                "completed_analyses": len(analysis_results),
                "total_insights": len(insights),
                "total_answers": len(answers)
            },
            "visualizations": self._extract_visualizations(analysis_results),
            "insights": [insight.dict() for insight in insights],
            "answers": answers
        }

        # Artifact export is not fabricated: report/presentation are only marked available
        # when a real generator has produced persisted files.
        artifacts["report_pdf"] = None
        artifacts["presentation"] = None
        artifacts["artifact_status"] = {
            "report_pdf": "not_generated",
            "presentation": "not_generated",
            "reason": "No report export generator is configured in this environment.",
        }

        logger.info(f"Generated artifacts for project {context.project_id}")

        return artifacts

    def _extract_visualizations(
        self,
        analysis_results: Dict[str, AnalysisResult]
    ) -> List[Dict[str, Any]]:
        """
        Extract visualization configs from analysis results

        Args:
            analysis_results: Analysis results

        Returns:
            List of visualization configurations
        """
        visualizations = []

        for analysis_type, result in analysis_results.items():
            if not result.success:
                continue

            # Extract visualizations from result data
            if "visualizations" in result.data:
                for viz in result.data["visualizations"]:
                    viz["analysis_type"] = analysis_type
                    visualizations.append(viz)

        return visualizations


# ============================================================================
# Async Analysis Stream
# ============================================================================

class AnalysisStream:
    """
    Async generator for streaming analysis progress

    Provides real-time updates during long-running analyses
    """

    async def stream_analysis(
        self,
        context: AnalysisContext,
        orchestrator: AnalysisOrchestrator
    ) -> AsyncGenerator[AnalysisProgress, None]:
        """
        Stream analysis progress

        Args:
            context: Analysis context
            orchestrator: Analysis orchestrator instance

        Yields:
            AnalysisProgress updates
        """
        total_analyses = len(context.analysis_types)

        # Emit start
        yield AnalysisProgress(
            session_id=context.project_id,
            step="initialization",
            percentage=0.0,
            message="Initializing analysis...",
            timestamp=datetime.utcnow()
        )

        # Execute analyses
        results = await orchestrator.execute_multiple_analyses(context, {})

        completed = 0
        for analysis_type, result in results.items():
            completed += 1
            percentage = (completed / total_analyses) * 100

            yield AnalysisProgress(
                session_id=context.project_id,
                step=analysis_type,
                percentage=percentage,
                message=f"Completed {analysis_type}",
                timestamp=datetime.utcnow()
            )

        # Reconcile results
        yield AnalysisProgress(
            session_id=context.project_id,
            step="reconciliation",
            percentage=95.0,
            message="Reconciling results...",
            timestamp=datetime.utcnow()
        )

        reconciled = await orchestrator.reconcile_results(context, results)

        # Emit completion
        yield AnalysisProgress(
            session_id=context.project_id,
            step="complete",
            percentage=100.0,
            message="Analysis complete",
            timestamp=datetime.utcnow(),
            data={
                "results": reconciled.artifacts,
                "success": reconciled.success
            }
        )


# ============================================================================
# Singleton Instance
# ============================================================================

_orchestrator: Optional[AnalysisOrchestrator] = None


def get_analysis_orchestrator() -> AnalysisOrchestrator:
    """Get the singleton analysis orchestrator instance"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = AnalysisOrchestrator()
    return _orchestrator
