"""
Result Interpreter Service

Interprets analysis results and generates business-friendly outputs.

Based on PDF requirements:
- Collaborates with Data Scientist and Business Agent
- Translates technical findings into business insights
- Generates answers to user questions from analysis results
- Creates evidence chain linking questions → elements → insights → answers
- Generates supporting materials with business context
"""

from typing import Dict, List, Optional, Any
import logging
from datetime import datetime
from dataclasses import dataclass

# LangChain for LLM-powered interpretation
from langchain_openai import ChatOpenAI
from langchain_core.prompts import PromptTemplate, ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Local imports
from ..models.schemas import (
    AnalysisResult, QuestionElementMapping, Insight,
    QuestionIntentType, AnalysisType
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class AnswerContext:
    """Context for generating an answer"""
    question: str
    question_id: str
    analysis_results: Dict[str, AnalysisResult]
    question_mapping: QuestionElementMapping
    business_context: Optional[Dict[str, Any]] = None
    evidence_links: List = []


@dataclass
class BusinessContext:
    """Business context for interpretation"""
    industry: Optional[str] = None
    audience_type: Optional[str] = None  # non-tech, business, tech
    goals: List[str] = []
    key_metrics: List[str] = []
    business_definitions: Dict[str, Any] = {}


@dataclass
class InterpretationResult:
    """Result of interpretation"""
    answer: str
    confidence: float
    evidence_summary: List[str]
    business_translation: Optional[str] = None
    recommended_actions: List[str]


# ============================================================================
# Result Interpreter Service
# ============================================================================

class ResultInterpreter:
    """
    Interprets analysis results and generates business-friendly outputs

    This service collaborates with:
    - Data Scientist: For understanding statistical findings
    - Business Agent: For translating to business language
    """

    def __init__(self, llm=None):
        """
        Initialize the result interpreter

        Args:
            llm: Optional LLM for interpretation
        """
        self.llm = llm or ChatOpenAI(temperature=0.3)
        self.business_agent_prompt = self._get_business_agent_prompt()
        self.data_scientist_prompt = self._get_data_scientist_prompt()

    def _get_business_agent_prompt(self) -> str:
        """Get the system prompt for the Business Agent"""
        return """You are a Business Analyst agent for Chimaridata.

Your role is to translate technical data analysis findings into business-friendly insights.

Guidelines:
1. Use simple, clear language - avoid technical jargon
2. Focus on business impact and actionable recommendations
3. Use percentages and trends to explain data patterns
4. Always provide context for the numbers you share
5. Format insights as bullet points when listing multiple findings
6. Consider the audience (non-tech, business, tech) when explaining

Example format:
- "Employee engagement decreased by 5% in Q3"
- "Top performing team is Sales with 85% engagement"
- "Recommendation: Implement recognition program"

Return only the business-friendly interpretation, no code or technical details."""

    def _get_data_scientist_prompt(self) -> str:
        """Get the system prompt for the Data Scientist"""
        return """You are a Data Scientist agent for Chimaridata.

Your role is to interpret statistical and machine learning analysis results.

Guidelines:
1. Explain statistical significance (p-values, confidence intervals)
2. Identify patterns, trends, and anomalies in the data
3. Provide context for correlations and relationships
4. Be precise about what the numbers mean
5. Highlight important findings that answer the user's question

Return a technical but clear interpretation with supporting evidence."""

    async def generate_answers(
        self,
        questions: List[QuestionElementMapping],
        analysis_results: Dict[str, AnalysisResult],
        business_context: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate answers to user questions from analysis results

        Args:
            questions: Question-element mappings
            analysis_results: Results from all analyses
            business_context: Business context

        Returns:
            List of answers with question_id, text, confidence
        """
        answers = []

        for question_mapping in questions:
            try:
                # Build answer context
                context = AnswerContext(
                    question=question_mapping.question_text,
                    question_id=question_mapping.question_id,
                    analysis_results=analysis_results,
                    question_mapping=question_mapping,
                    business_context=business_context
                )

                # Generate answer using Business Agent
                result = await self._generate_business_answer(context)

                answers.append({
                    "question_id": question_mapping.question_id,
                    "question_text": question_mapping.question_text,
                    "answer": result.answer,
                    "confidence": result.confidence,
                    "evidence_summary": result.evidence_summary
                })

                logger.info(
                    f"Generated answer for question {question_mapping.question_id}: "
                    f"{result.answer[:100]}..."
                )

            except Exception as e:
                logger.error(
                    f"Error generating answer for {question_mapping.question_id}: {e}",
                    exc_info=True
                )
                answers.append({
                    "question_id": question_mapping.question_id,
                    "question_text": question_mapping.question_text,
                    "answer": f"Unable to generate answer: {str(e)}",
                    "confidence": 0.0,
                    "evidence_summary": []
                })

        return answers

    async def _generate_business_answer(
        self,
        context: AnswerContext
    ) -> InterpretationResult:
        """
        Generate a business-friendly answer

        Uses the Business Agent LLM to interpret findings

        Args:
            context: Answer context with question and results

        Returns:
            InterpretationResult with answer and metadata
        """
        # Gather relevant evidence from analysis results
        evidence_texts = self._gather_evidence(context)

        # Build prompt for LLM
        prompt = self._build_answer_prompt(context, evidence_texts)

        # Generate answer
        response = await self.llm.ainvoke(prompt)

        # Extract confidence based on evidence quality
        confidence = self._calculate_confidence(context, evidence_texts)

        return InterpretationResult(
            answer=response.content,
            confidence=confidence,
            evidence_summary=evidence_texts,
            business_translation=self._extract_business_meaning(response.content),
            recommended_actions=self._extract_actions(response.content)
        )

    def _gather_evidence(self, context: AnswerContext) -> List[str]:
        """Gather evidence from analysis results"""
        evidence = []

        for analysis_type, result in context.analysis_results.items():
            if not result.success:
                continue

            # Extract key findings from the result
            if "summary" in result.data:
                summary = result.data["summary"]
                evidence.append(f"{analysis_type}: {str(summary)}")

            # Extract statistics if available
            if "statistics" in result.data:
                stats = result.data["statistics"]
                evidence.append(f"{analysis_type}: {str(stats)}")

        return evidence

    def _build_answer_prompt(
        self,
        context: AnswerContext,
        evidence: List[str]
    ) -> str:
        """Build a prompt for generating a business answer"""
        prompt = f"""{self.business_agent_prompt}

Question: {context.question}

Available Analysis Results:
{chr(10).join(f'- {e}' for e in evidence)}

Related Data Elements: {', '.join(context.question_mapping.related_elements)}

Recommended Analysis Types: {', '.join(context.question_mapping.recommended_analyses)}

Intent Type: {context.question_mapping.intent_type.value if context.question_mapping.intent_type else 'general'}

Generate a clear, business-friendly answer that directly addresses the question.
Use the evidence above to support your answer.
If the evidence doesn't fully answer the question, acknowledge what's available.
"""

        return prompt

    def _calculate_confidence(
        self,
        context: AnswerContext,
        evidence: List[str]
    ) -> float:
        """Calculate confidence in the answer"""
        base_confidence = context.question_mapping.confidence

        # Adjust based on amount of evidence
        evidence_factor = min(0.2, len(evidence) * 0.05)

        # Adjust based on analysis completion
        completed_types = sum(
            1 for r in context.analysis_results.values()
            if r.success
        )
        completion_factor = min(0.2, completed_types * 0.05)

        confidence = min(1.0, base_confidence + evidence_factor + completion_factor)

        return round(confidence, 2)

    def _extract_business_meaning(self, text: str) -> Optional[str]:
        """Extract business translation from LLM response"""
        # Look for business impact patterns
        business_patterns = [
            "this means", "this indicates", "this suggests",
            "impact", "affect", "result in"
        ]

        for pattern in business_patterns:
            if pattern in text.lower():
                # Return the sentence containing the pattern
                sentences = text.split('.')
                for sentence in sentences:
                    if pattern in sentence.lower():
                        return sentence.strip()

        return None

    def _extract_actions(self, text: str) -> List[str]:
        """Extract recommended actions from LLM response"""
        actions = []

        # Look for action-oriented patterns
        action_patterns = [
            "recommend", "should", "consider", "implement",
            "take action", "address"
        ]

        sentences = text.split('.')
        for sentence in sentences:
            if any(pattern in sentence.lower() for pattern in action_patterns):
                # Extract the actionable part
                action = sentence.strip()
                if len(action) > 10 and len(action) < 200:
                    actions.append(action)

        return actions

    async def generate_insights(
        self,
        analysis_results: Dict[str, AnalysisResult],
        question_mappings: List[QuestionElementMapping]
    ) -> List[Insight]:
        """
        Generate business-friendly insights from analysis results

        Collaborates with Data Scientist for technical interpretation

        Args:
            analysis_results: Results from all analyses
            question_mappings: Question-element mappings

        Returns:
            List of Insight objects
        """
        insights = []

        try:
            # Build comprehensive context
            full_context = {
                "analysis_results": analysis_results,
                "question_mappings": question_mappings
            }

            # Generate insights using Data Scientist prompt
            prompt = f"""{self.data_scientist_prompt}

Analysis Results:
{self._format_analysis_results(analysis_results)}

Questions:
{chr(10).join(f'- {m.question_text}' for m in question_mappings)}

Generate business-friendly insights from the analysis results above.
Each insight should have:
- A clear title (max 200 chars)
- A description (max 1000 chars)
- Significance level (low, medium, high)
- Evidence from the analysis
- Confidence score (0-1)

Format as JSON array:
[
  {{
    "id": "insight_id",
    "type": "statistical|correlation|trend|anomaly|prediction",
    "title": "Clear business title",
    "description": "Business-friendly explanation",
    "significance": "low|medium|high",
    "evidence": {{key_finding1: value1, key_finding2: value2}},
    "data_elements_used": ["element1", "element2"],
    "confidence": 0.85,
    "generated_by": "Data Scientist Agent"
  }}
]
"""

            # Generate insights
            response = await self.llm.ainvoke(prompt)

            # Parse insights from response
            try:
                import json
                insights_data = json.loads(response.content)
                for insight_data in insights_data:
                    insights.append(Insight(**insight_data))
            except json.JSONDecodeError:
                # If LLM didn't return JSON, create fallback
                insights = self._create_fallback_insights(analysis_results)

            logger.info(f"Generated {len(insights)} insights from analysis results")

        except Exception as e:
            logger.error(f"Error generating insights: {e}", exc_info=True)
            # Return fallback insights on error
            insights = self._create_fallback_insights(analysis_results)

        return insights

    def _format_analysis_results(self, results: Dict[str, AnalysisResult]) -> str:
        """Format analysis results for LLM prompt"""
        formatted = []

        for analysis_type, result in results.items():
            if not result.success:
                formatted.append(f"{analysis_type}: FAILED - {result.errors}")
                continue

            # Format key data points
            parts = [f"## {analysis_type}"]
            if "summary" in result.data:
                parts.append(f"Summary: {str(result.data['summary'])}")
            if "statistics" in result.data:
                parts.append(f"Statistics: {str(result.data['statistics'])}")
            if "visualizations" in result.data:
                viz_count = len(result.data['visualizations'])
                parts.append(f"Visualizations: {viz_count}")

            formatted.append(" | ".join(parts))

        return "\n\n".join(formatted)

    def _create_fallback_insights(
        self,
        analysis_results: Dict[str, AnalysisResult]
    ) -> List[Insight]:
        """Create simple insights when LLM fails"""
        insights = []
        insight_id = 1

        for analysis_type, result in analysis_results.items():
            if not result.success:
                continue

            # Create insight from summary
            summary = result.data.get("summary", {})
            for key, value in summary.items():
                insights.append(Insight(
                    id=f"ins_{insight_id}",
                    type="statistical",
                    title=f"{analysis_type}: {key}",
                    description=str(value),
                    significance="medium",
                    evidence={key: str(value)},
                    data_elements_used=[],
                    confidence=0.7,
                    generated_by="Data Scientist Agent (fallback)"
                ))
                insight_id += 1

        return insights

    def calculate_answer_quality(
        self,
        answer: str,
        question: str,
        evidence: List[str]
    ) -> Dict[str, Any]:
        """
        Calculate quality metrics for a generated answer

        Args:
            answer: The generated answer
            question: The original question
            evidence: List of evidence texts

        Returns:
            Dictionary with quality metrics
        """
        metrics = {
            "answer_length": len(answer),
            "evidence_count": len(evidence),
            "contains_actionable_insight": any(
                word in answer.lower()
                for word in ["recommend", "should", "consider", "implement"]
            )
        }

        # Check if answer addresses the question
        question_words = set(question.lower().split())
        answer_words = set(answer.lower().split())
        overlap = len(question_words & answer_words) / len(question_words)
        metrics["question_relevance"] = round(overlap, 2)

        return metrics


# ============================================================================
# Singleton Instance
# ============================================================================

_interpreter: Optional[ResultInterpreter] = None


def get_result_interpreter() -> ResultInterpreter:
    """Get the singleton result interpreter instance"""
    global _interpreter
    if _interpreter is None:
        _interpreter = ResultInterpreter()
    return _interpreter
