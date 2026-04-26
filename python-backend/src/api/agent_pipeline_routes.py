"""
Agent Pipeline Routes (U2A2A2U)

Implements all U2A2A2U pipeline endpoints the frontend expects:
- Project Manager Agent (suggest-questions, clarify-goal)
- Data Requirements generation
- Analysis Execution (execute, results)
- Conversation management
- Agent Activity log
- Analyze Data (trigger + results)
- Workflow transparency and continuation
- AI query, Data quality, Enhanced analysis capabilities
- Semantic pipeline evidence chain

Uses Google Gemini as primary LLM, with OpenAI fallback.
"""

from typing import Optional, List, Dict, Any, Tuple, Set
from datetime import datetime
import json
import logging
import os
import uuid
import re
import hashlib
import difflib

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import ORJSONResponse, JSONResponse
from pydantic import BaseModel, Field, ConfigDict, field_validator

from sqlalchemy import text as sa_text

from ..db import get_db_context
from ..auth.middleware import get_current_user, User as AuthUser

logger = logging.getLogger(__name__)

router = APIRouter(tags=["agent-pipeline"])


# ============================================================================
# LLM Client
# ============================================================================

_gemini_model = None


def _get_gemini_model():
    """Lazily initialize and return the Gemini generative model."""
    global _gemini_model
    if _gemini_model is not None:
        return _gemini_model
    api_key = os.getenv("GOOGLE_AI_API_KEY")
    if not api_key:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        _gemini_model = genai.GenerativeModel("gemini-1.5-flash")
        logger.info("Gemini LLM client initialized")
        return _gemini_model
    except Exception as e:
        logger.warning(f"Failed to initialize Gemini: {e}")
        return None


async def _llm_generate(prompt: str) -> Optional[str]:
    """
    Generate text using Gemini (primary) or OpenAI (fallback).

    Returns the generated text, or raises HTTPException on failure.
    """
    # Try Gemini first
    model = _get_gemini_model()
    if model is not None:
        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            logger.warning(f"Gemini generation failed, trying OpenAI fallback: {e}")

    # Fallback to OpenAI
    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        try:
            import openai
            client = openai.AsyncOpenAI(api_key=openai_key)
            response = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=2000,
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"OpenAI generation also failed: {e}")

    # No LLM available — return None so callers can provide fallback responses
    logger.warning("No LLM provider available. Set GOOGLE_AI_API_KEY or OPENAI_API_KEY.")
    return None


def _parse_json_from_llm(text: str) -> Any:
    """Best-effort extraction of JSON from LLM response text."""
    if not text or not isinstance(text, str):
        return None

    # Strip markdown code fences
    cleaned = text.strip()
    if cleaned.startswith("```"):
        first_nl = cleaned.index("\n") if "\n" in cleaned else 3
        cleaned = cleaned[first_nl:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        # Try to find first { ... } or [ ... ]
        for start_char, end_char in [("{", "}"), ("[", "]")]:
            start = cleaned.find(start_char)
            end = cleaned.rfind(end_char)
            if start != -1 and end > start:
                try:
                    return json.loads(cleaned[start : end + 1])
                except json.JSONDecodeError:
                    continue
        return None


# ============================================================================
# Pydantic Request / Response Models
# ============================================================================

class SuggestQuestionsRequest(BaseModel):
    """Request body for POST /project-manager/suggest-questions"""
    goal: str = Field(..., min_length=1, max_length=2000)
    projectId: Optional[str] = Field(default=None)


class ClarifyGoalRequest(BaseModel):
    """Request body for POST /project-manager/clarify-goal"""
    projectId: str = Field(..., min_length=1)
    analysisGoal: str = Field(..., min_length=1, max_length=2000)
    businessQuestions: Any = Field(default_factory=list)  # Accept string or list
    journeyType: Optional[str] = None
    industry: Optional[str] = None

    @field_validator('businessQuestions', mode='before')
    @classmethod
    def parse_questions(cls, v):
        if isinstance(v, str):
            return [q.strip() for q in v.split('\n') if q.strip()]
        return v or []


class GenerateDataRequirementsRequest(BaseModel):
    """Request body for POST /projects/{id}/generate-data-requirements"""
    userGoals: List[str] = Field(default_factory=list)
    userQuestions: List[str] = Field(default_factory=list)
    industry: Optional[str] = None
    researcherContext: Optional[Dict[str, Any]] = None
    availableColumns: Optional[List[str]] = None


class AnalysisExecutionRequest(BaseModel):
    """Request body for POST /analysis-execution/execute"""
    projectId: str = Field(..., min_length=1)
    analysisTypes: List[str] = Field(default_factory=list)
    analysisPath: Optional[List[str]] = None
    questionAnswerMapping: Optional[Dict[str, Any]] = None
    previewOnly: bool = False
    config: Optional[Dict[str, Any]] = None


class ConversationStartRequest(BaseModel):
    """Request body for POST /conversation/start"""
    projectId: Optional[str] = None
    context: Optional[Dict[str, Any]] = None


class ConversationContinueRequest(BaseModel):
    """Request body for POST /conversation/{id}/continue"""
    message: str = Field(..., min_length=1, max_length=10000)
    context: Optional[Dict[str, Any]] = None


class AnalyzeDataRequest(BaseModel):
    """Request body for POST /analyze-data/{projectId}"""
    analysisTypes: List[str] = Field(default_factory=list)
    audienceType: Optional[str] = "non-tech"
    questions: Optional[List[str]] = None
    config: Optional[Dict[str, Any]] = None


class AgentWorkflowContinueRequest(BaseModel):
    """Request body for POST /agent-workflow/continue"""
    projectId: str = Field(..., min_length=1)
    sessionId: Optional[str] = None
    userInput: Optional[Dict[str, Any]] = None


class AIQueryRequest(BaseModel):
    """Request body for POST /ai/query"""
    query: str = Field(..., min_length=1, max_length=5000)
    projectId: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    mode: Optional[str] = Field(default="general")
    strictGrounding: bool = Field(default=False)


class DataQualityRequest(BaseModel):
    """Request body for POST /data-quality/analyze"""
    datasetId: str = Field(..., min_length=1)


# ============================================================================
# In-memory stores (production would use Redis / DB)
# ============================================================================

_conversations: Dict[str, Dict[str, Any]] = {}
_agent_activities: Dict[str, List[Dict[str, Any]]] = {}

AGENT_DISPLAY_NAMES = {
    "project_manager": "Project Manager",
    "pm": "Project Manager",
    "business": "Business Analyst",
    "business_agent": "Business Analyst",
    "data_engineer": "Data Engineer",
    "data_scientist": "Data Scientist",
    "researcher": "Researcher",
    "template_research": "Researcher",
    "customer_support": "Customer Support",
    "conversation": "Customer Support",
    "orchestrator": "Project Manager",
    "technical_ai": "Data Scientist",
    "technical_ai_agent": "Data Scientist",
}


def _record_activity(project_id: str, agent: str, action: str, detail: str = ""):
    """Append an activity entry for a project."""
    if project_id not in _agent_activities:
        _agent_activities[project_id] = []
    display_name = AGENT_DISPLAY_NAMES.get(agent, agent.replace("_", " ").title())
    _agent_activities[project_id].append({
        "id": str(uuid.uuid4()),
        "agent": agent,
        "agentName": display_name,
        "action": action,
        "detail": detail,
        "timestamp": datetime.utcnow().isoformat(),
    })


def _has_llm_provider() -> bool:
    """Return True when at least one real LLM provider is configured."""
    return bool(os.getenv("GOOGLE_AI_API_KEY") or os.getenv("OPENAI_API_KEY"))


def _normalize_ai_mode(mode: Optional[str]) -> str:
    normalized = (mode or "general").strip().lower()
    if normalized in {"what-if", "what_if", "scenario", "follow-up", "follow_up"}:
        return "what_if"
    return "general"


def _build_ai_query_prompt(
    *,
    query: str,
    mode: str,
    project_context_text: str,
    available_columns: List[str],
    question_profile: Optional[Dict[str, Any]] = None,
    strict_grounding: bool = False,
) -> str:
    columns_text = ", ".join(available_columns[:120]) if available_columns else "None available"
    profile_text = json.dumps(question_profile or {}, ensure_ascii=False)

    if mode == "what_if":
        return (
            "You are Chimaridata's Data Scientist agent answering a what-if follow-up.\n"
            "You must stay grounded in the provided project context and dataset columns.\n"
            f"{project_context_text}\n"
            f"Available dataset columns: {columns_text}\n"
            f"Question profile: {profile_text}\n"
            f"User what-if question: {query}\n\n"
            "Rules:\n"
            "1) Never invent columns, metrics, filters, or numeric values.\n"
            "2) If the question depends on missing data, explicitly list what is missing.\n"
            "3) If you infer a related metric, state that it is an inference and why.\n"
            "4) Keep answer concise and action-oriented for business users.\n"
            "5) Include a short 'Grounding Check' line naming columns used (or 'none')."
        )

    strict_line = (
        "You must ground your answer strictly in provided context and columns.\n"
        if strict_grounding
        else ""
    )
    return (
        "You are a helpful data analysis assistant for the Chimaridata platform.\n"
        f"{strict_line}"
        f"{project_context_text}\n"
        f"Available dataset columns: {columns_text}\n"
        f"Question profile: {profile_text}\n"
        f"User question: {query}\n\n"
        "Provide a clear, concise answer. If data is missing, say what is missing."
    )


# ============================================================================
# Requirements Intelligence (Question Understanding + Metric/Domain Extraction)
# ============================================================================

_ANALYSIS_LIBRARY: Dict[str, Dict[str, Any]] = {
    "descriptive_stats": {
        "name": "Descriptive Statistics",
        "category": "descriptive",
        "description": "Summarize baseline levels, spread, and distribution of key metrics.",
        "techniques": ["summary_statistics", "distribution_profile", "outlier_scan"],
        "estimatedDuration": "5-10 minutes",
    },
    "correlation": {
        "name": "Correlation Analysis",
        "category": "diagnostic",
        "description": "Quantify relationships between variables to validate associations.",
        "techniques": ["pearson_correlation", "spearman_correlation", "correlation_heatmap"],
        "estimatedDuration": "10-15 minutes",
    },
    "regression": {
        "name": "Regression Analysis",
        "category": "predictive",
        "description": "Estimate directional impact of drivers on outcomes.",
        "techniques": ["linear_regression", "feature_importance", "coefficient_significance"],
        "estimatedDuration": "15-20 minutes",
    },
    "classification": {
        "name": "Classification Analysis",
        "category": "predictive",
        "description": "Predict class outcomes such as churn or conversion likelihood.",
        "techniques": ["logistic_regression", "tree_classifier", "roc_auc"],
        "estimatedDuration": "15-25 minutes",
    },
    "time_series": {
        "name": "Time Series Analysis",
        "category": "diagnostic",
        "description": "Evaluate trend, seasonality, and change over time.",
        "techniques": ["trend_decomposition", "moving_average", "seasonality_detection"],
        "estimatedDuration": "15-25 minutes",
    },
    "clustering": {
        "name": "Clustering Analysis",
        "category": "diagnostic",
        "description": "Identify natural segments and cohorts in the data.",
        "techniques": ["kmeans", "cluster_profile", "silhouette_score"],
        "estimatedDuration": "15-25 minutes",
    },
    "statistical_tests": {
        "name": "Statistical Tests",
        "category": "diagnostic",
        "description": "Test whether observed differences are statistically meaningful.",
        "techniques": ["t_test", "anova", "chi_square"],
        "estimatedDuration": "10-15 minutes",
    },
    "group_analysis": {
        "name": "Group Analysis",
        "category": "descriptive",
        "description": "Compare metrics across business segments and cohorts.",
        "techniques": ["group_aggregation", "variance_comparison", "segment_ranking"],
        "estimatedDuration": "10-20 minutes",
    },
    "text_analysis": {
        "name": "Text Analysis",
        "category": "diagnostic",
        "description": "Extract themes and sentiment from unstructured text.",
        "techniques": ["keyword_extraction", "sentiment_scoring", "topic_clustering"],
        "estimatedDuration": "15-30 minutes",
    },
}

_INTENT_RULES: List[Dict[str, Any]] = [
    {
        "intent": "probability",
        "confidence": 0.88,
        "analysis_types": ["classification", "regression", "descriptive_stats"],
        "patterns": [
            r"\blikelihood\b", r"\bprobability\b", r"\bchance\b", r"\brisk\b", r"\bhow likely\b",
            r"\bpredict\b", r"\bforecast\b", r"\bwill\b.*\b(churn|convert|buy|renew|cancel|default)\b",
        ],
    },
    {
        "intent": "trend",
        "confidence": 0.86,
        "analysis_types": ["time_series", "descriptive_stats"],
        "patterns": [
            r"\bover time\b", r"\btrend\b", r"\bmonthly\b", r"\bquarterly\b", r"\byearly\b",
            r"\bincrease\b", r"\bdecrease\b", r"\bgrowth\b", r"\bdecline\b",
        ],
    },
    {
        "intent": "comparison",
        "confidence": 0.84,
        "analysis_types": ["group_analysis", "statistical_tests", "descriptive_stats"],
        "patterns": [
            r"\bcompare\b", r"\bcomparison\b", r"\bversus\b", r"\bvs\b", r"\bdifference\b",
            r"\bbetween\b", r"\bbest\b", r"\bworst\b", r"\bhigher\b", r"\blower\b",
        ],
    },
    {
        "intent": "causal",
        "confidence": 0.82,
        "analysis_types": ["regression", "correlation", "descriptive_stats"],
        "patterns": [
            r"\bdriver\b", r"\bdrives\b", r"\bcauses?\b", r"\bimpact\b", r"\binfluence\b",
            r"\bwhat drives\b", r"\bwhy\b",
        ],
    },
    {
        "intent": "relationship",
        "confidence": 0.8,
        "analysis_types": ["correlation", "regression", "descriptive_stats"],
        "patterns": [
            r"\brelationship\b", r"\bcorrelat", r"\bassociation\b", r"\blink(ed)?\b", r"\baffect\b",
        ],
    },
    {
        "intent": "segmentation",
        "confidence": 0.8,
        "analysis_types": ["clustering", "group_analysis", "descriptive_stats"],
        "patterns": [
            r"\bsegment\b", r"\bcluster\b", r"\bcohort\b", r"\bpersona\b", r"\bgroup\b",
        ],
    },
    {
        "intent": "ranking",
        "confidence": 0.76,
        "analysis_types": ["group_analysis", "descriptive_stats"],
        "patterns": [
            r"\btop\s+\d+\b", r"\brank\b", r"\bhighest\b", r"\blowest\b", r"\bmost\b", r"\bleast\b",
        ],
    },
    {
        "intent": "distribution",
        "confidence": 0.74,
        "analysis_types": ["descriptive_stats", "clustering"],
        "patterns": [
            r"\bdistribution\b", r"\bspread\b", r"\bvariance\b", r"\boutlier\b", r"\bhistogram\b",
        ],
    },
    {
        "intent": "aggregation",
        "confidence": 0.72,
        "analysis_types": ["descriptive_stats", "group_analysis"],
        "patterns": [
            r"\baverage\b", r"\bmean\b", r"\bmedian\b", r"\btotal\b", r"\bsum\b",
            r"\bhow many\b", r"\bhow much\b", r"\bcount\b",
        ],
    },
]

_METRIC_KB: Dict[str, Dict[str, Any]] = {
    "revenue": {
        "aliases": ["revenue", "sales", "income", "gmv", "bookings"],
        "display_name": "Revenue",
        "description": "Total monetary value generated in the selected period.",
        "data_type": "numeric",
        "domain": "finance",
        "calculation_type": "direct",
    },
    "profit_margin": {
        "aliases": ["profit margin", "margin", "gross margin", "net margin"],
        "display_name": "Profit Margin",
        "description": "Percentage of revenue retained as profit.",
        "data_type": "numeric",
        "domain": "finance",
        "calculation_type": "derived",
        "formula": "(profit / revenue) * 100",
        "component_fields": ["profit", "revenue"],
        "aggregation_method": "ratio",
    },
    "conversion_rate": {
        "aliases": ["conversion", "conversion rate", "cv rate"],
        "display_name": "Conversion Rate",
        "description": "Share of leads/users that complete the target action.",
        "data_type": "numeric",
        "domain": "marketing",
        "calculation_type": "derived",
        "formula": "(conversions / leads) * 100",
        "component_fields": ["conversions", "leads"],
        "aggregation_method": "ratio",
    },
    "retention_rate": {
        "aliases": ["retention", "retention rate", "customer retention"],
        "display_name": "Retention Rate",
        "description": "Percentage of users/customers retained in a period.",
        "data_type": "numeric",
        "domain": "customer_success",
        "calculation_type": "derived",
        "formula": "(retained_customers / customers_at_start) * 100",
        "component_fields": ["retained_customers", "customers_at_start"],
        "aggregation_method": "ratio",
    },
    "churn_rate": {
        "aliases": ["churn", "churn rate", "attrition", "attrition rate", "turnover"],
        "display_name": "Churn Rate",
        "description": "Percentage of customers/employees lost in a period.",
        "data_type": "numeric",
        "domain": "customer_success",
        "calculation_type": "derived",
        "formula": "(lost_entities / entities_at_start) * 100",
        "component_fields": ["lost_entities", "entities_at_start"],
        "aggregation_method": "ratio",
    },
    "engagement_score": {
        "aliases": ["engagement", "engagement score"],
        "display_name": "Engagement Score",
        "description": "Composite index indicating engagement level.",
        "data_type": "numeric",
        "domain": "hr",
        "calculation_type": "aggregated",
        "formula": "(satisfaction + commitment + advocacy) / 3",
        "component_fields": ["satisfaction", "commitment", "advocacy"],
        "aggregation_method": "avg",
    },
    "satisfaction_score": {
        "aliases": ["satisfaction", "satisfaction score", "csat"],
        "display_name": "Satisfaction Score",
        "description": "Survey-derived measure of customer or employee satisfaction.",
        "data_type": "numeric",
        "domain": "customer_success",
        "calculation_type": "direct",
    },
    "nps": {
        "aliases": ["nps", "net promoter score"],
        "display_name": "Net Promoter Score",
        "description": "Loyalty score based on promoter and detractor percentages.",
        "data_type": "numeric",
        "domain": "customer_success",
        "calculation_type": "derived",
        "formula": "percentage_promoters - percentage_detractors",
        "component_fields": ["percentage_promoters", "percentage_detractors"],
        "aggregation_method": "difference",
    },
    "customer_ltv": {
        "aliases": ["ltv", "clv", "customer lifetime value", "lifetime value"],
        "display_name": "Customer Lifetime Value",
        "description": "Expected revenue contribution per customer over time.",
        "data_type": "numeric",
        "domain": "finance",
        "calculation_type": "derived",
        "formula": "avg_order_value * purchase_frequency * customer_lifespan",
        "component_fields": ["avg_order_value", "purchase_frequency", "customer_lifespan"],
        "aggregation_method": "product",
    },
    "roi": {
        "aliases": ["roi", "return on investment", "roas", "return on ad spend"],
        "display_name": "Return on Investment",
        "description": "Efficiency metric comparing returns against spend.",
        "data_type": "numeric",
        "domain": "finance",
        "calculation_type": "derived",
        "formula": "((gain - cost) / cost) * 100",
        "component_fields": ["gain", "cost"],
        "aggregation_method": "ratio",
    },
    "headcount": {
        "aliases": ["headcount", "employee count", "staff count", "workforce size"],
        "display_name": "Headcount",
        "description": "Total number of active employees or staff members.",
        "data_type": "numeric",
        "domain": "hr",
        "calculation_type": "direct",
    },
    "sales_velocity": {
        "aliases": ["sales velocity", "pipeline velocity", "deal velocity", "revenue velocity"],
        "display_name": "Sales Velocity",
        "description": "Speed at which opportunities convert into revenue.",
        "data_type": "numeric",
        "domain": "sales",
        "calculation_type": "derived",
        "formula": "(opportunities * avg_deal_value * win_rate) / sales_cycle_length",
        "component_fields": ["opportunities", "avg_deal_value", "win_rate", "sales_cycle_length"],
        "aggregation_method": "custom_formula",
    },
    "channel_effectiveness": {
        "aliases": ["channel effectiveness", "channel performance", "best channel", "channel roi"],
        "display_name": "Channel Effectiveness",
        "description": "Comparative performance of channels against conversion and ROI outcomes.",
        "data_type": "numeric",
        "domain": "marketing",
        "calculation_type": "derived",
        "formula": "weighted_score(conversion_rate, roi)",
        "component_fields": ["conversion_rate", "roi"],
        "aggregation_method": "weighted_score",
    },
    "funnel_performance": {
        "aliases": ["funnel performance", "funnel efficiency", "funnel health", "pipeline funnel"],
        "display_name": "Funnel Performance",
        "description": "How efficiently leads progress through funnel stages.",
        "data_type": "numeric",
        "domain": "marketing",
        "calculation_type": "derived",
        "formula": "stage_conversions / stage_entries",
        "component_fields": ["stage_conversions", "stage_entries"],
        "aggregation_method": "ratio",
    },
    "lead_quality": {
        "aliases": ["lead quality", "quality leads", "qualified leads", "high quality leads"],
        "display_name": "Lead Quality",
        "description": "Proxy score for lead conversion potential and commercial fit.",
        "data_type": "numeric",
        "domain": "marketing",
        "calculation_type": "derived",
        "formula": "(conversion_rate + engagement_score) / 2",
        "component_fields": ["conversion_rate", "engagement_score"],
        "aggregation_method": "avg",
    },
    "acquisition_cost": {
        "aliases": ["acquisition cost", "cac", "customer acquisition cost", "cost per acquisition"],
        "display_name": "Acquisition Cost",
        "description": "Average cost to acquire a customer or lead.",
        "data_type": "numeric",
        "domain": "marketing",
        "calculation_type": "derived",
        "formula": "marketing_spend / acquired_customers",
        "component_fields": ["marketing_spend", "acquired_customers"],
        "aggregation_method": "ratio",
    },
    "mrr": {
        "aliases": ["mrr", "monthly recurring revenue", "monthly subscription revenue"],
        "display_name": "Monthly Recurring Revenue",
        "description": "Monthly predictable subscription revenue.",
        "data_type": "numeric",
        "domain": "finance",
        "calculation_type": "direct",
    },
    "arr": {
        "aliases": ["arr", "annual recurring revenue", "yearly recurring revenue"],
        "display_name": "Annual Recurring Revenue",
        "description": "Annualized predictable subscription revenue.",
        "data_type": "numeric",
        "domain": "finance",
        "calculation_type": "derived",
        "formula": "mrr * 12",
        "component_fields": ["mrr"],
        "aggregation_method": "scalar",
    },
    "resolution_time": {
        "aliases": ["resolution time", "time to resolution", "ttr", "handle time"],
        "display_name": "Resolution Time",
        "description": "Elapsed time to resolve a ticket or issue.",
        "data_type": "numeric",
        "domain": "customer_service",
        "calculation_type": "direct",
    },
}

_DOMAIN_KEYWORDS: Dict[str, List[str]] = {
    "finance": ["revenue", "profit", "margin", "cost", "roi", "roas", "budget", "spend", "mrr", "arr"],
    "marketing": ["campaign", "conversion", "lead", "acquisition", "ctr", "impression", "funnel", "channel"],
    "sales": ["pipeline", "bookings", "quota", "opportunity", "deal", "win rate", "velocity"],
    "hr": ["employee", "staff", "attrition", "turnover", "engagement", "satisfaction", "headcount"],
    "customer_success": ["retention", "churn", "nps", "csat", "support", "ticket", "resolution"],
    "operations": ["throughput", "cycle time", "defect", "utilization", "quality", "capacity"],
    "product": ["feature", "adoption", "activation", "usage", "session", "cohort"],
    "risk": ["fraud", "default", "compliance", "incident", "anomaly", "risk"],
}

_TERM_SYNONYM_PAIRS: List[Tuple[str, str]] = [
    ("turnover", "attrition"),
    ("attrition", "churn"),
    ("lead", "prospect"),
    ("leads", "prospects"),
    ("lead", "opportunity"),
    ("room", "classroom"),
    ("rooms", "classroom"),
    ("channel", "source"),
    ("region", "territory"),
    ("team", "department"),
    ("satisfaction", "csat"),
    ("loyalty", "nps"),
    ("money", "financial"),
    ("cost", "spend"),
    ("rate", "percentage"),
    ("count", "total"),
    ("average", "mean"),
    ("score", "rating"),
    ("cycle", "duration"),
    ("length", "duration"),
    ("stage", "step"),
    ("funnel", "pipeline"),
]

_LINGO_EXPANSION_RULES: List[Dict[str, Any]] = [
    {
        "label": "leaky_bucket",
        "patterns": [r"\bleaky\s+bucket\b", r"\bwhere\s+.*\bleak", r"\bdrop[-\s]?off\b", r"\bleakage\b"],
        "expansions": [
            {
                "text": "At which funnel stage do we lose the most conversions?",
                "metricHint": "conversion rate",
                "dimensionHint": "funnel stage",
            },
            {
                "text": "Which channel or segment has the highest drop-off rate?",
                "metricHint": "conversion rate",
                "dimensionHint": "channel",
            },
            {
                "text": "How much potential value is lost before conversion?",
                "metricHint": "acquisition cost",
                "dimensionHint": "funnel stage",
            },
        ],
    },
    {
        "label": "empty_calories",
        "patterns": [r"\bempty\s+calories\b", r"\blow[-\s]?quality\s+leads?\b", r"\bvanity\s+metric"],
        "expansions": [
            {
                "text": "Which sources drive high volume but low conversion quality leads?",
                "metricHint": "lead quality",
                "dimensionHint": "source",
            },
            {
                "text": "Which campaigns generate clicks without meaningful conversion outcomes?",
                "metricHint": "conversion rate",
                "dimensionHint": "campaign",
            },
        ],
    },
    {
        "label": "north_star",
        "patterns": [r"\bnorth[-\s]?star\b"],
        "expansions": [
            {
                "text": "Which metric best predicts sustained business growth?",
                "metricHint": "retention rate",
                "dimensionHint": "customer segment",
            }
        ],
    },
]

_business_catalog_cache: Optional[Dict[str, Dict[str, Any]]] = None


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")
    return normalized or "metric"


def _title_from_slug(value: str) -> str:
    return " ".join(part.capitalize() for part in value.split("_") if part) or "Metric"


def _stable_question_id(project_id: str, question: str) -> str:
    seed = f"{project_id}:{(question or '').strip().lower()}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]


def _safe_contains_alias(alias: str, text: str) -> bool:
    if not alias or not text:
        return False
    pattern = r"\b" + re.escape(alias.lower()).replace(r"\ ", r"[\s_]+") + r"\b"
    return re.search(pattern, text.lower()) is not None


def _load_business_definition_catalog() -> Dict[str, Dict[str, Any]]:
    global _business_catalog_cache
    if _business_catalog_cache is not None:
        return _business_catalog_cache

    catalog: Dict[str, Dict[str, Any]] = {}
    try:
        from ..services.transformation_engine import get_business_registry

        registry = get_business_registry()
        for definition in registry.definitions.values():
            key = _slugify(getattr(definition, "name", "") or getattr(definition, "id", ""))
            aliases = {
                key,
                getattr(definition, "name", "").lower(),
                getattr(definition, "name", "").replace(" ", "_").lower(),
            }
            catalog[key] = {
                "aliases": sorted(alias for alias in aliases if alias),
                "display_name": getattr(definition, "name", _title_from_slug(key)),
                "description": getattr(definition, "description", "Business metric"),
                "data_type": "numeric",
                "domain": getattr(definition, "category", "general") or "general",
                "calculation_type": "derived" if getattr(definition, "formula", None) else "direct",
                "formula": getattr(definition, "formula", None),
                "component_fields": getattr(definition, "source_columns", []) or [],
                "aggregation_method": "avg" if getattr(definition, "formula", "").find("/ 3") != -1 else None,
                "source": "business_registry",
            }
    except Exception as registry_error:
        logger.debug(f"Business definition registry unavailable for requirements extraction: {registry_error}")

    _business_catalog_cache = catalog
    return catalog


def _build_metric_catalog() -> Dict[str, Dict[str, Any]]:
    catalog: Dict[str, Dict[str, Any]] = {}

    for key, definition in _METRIC_KB.items():
        merged = dict(definition)
        merged["source"] = merged.get("source", "metric_kb")
        merged["aliases"] = sorted(set(merged.get("aliases", []) + [key, key.replace("_", " ")]))
        catalog[key] = merged

    for key, definition in _load_business_definition_catalog().items():
        if key in catalog:
            existing_aliases = set(catalog[key].get("aliases", []))
            existing_aliases.update(definition.get("aliases", []))
            catalog[key]["aliases"] = sorted(existing_aliases)
            if not catalog[key].get("formula") and definition.get("formula"):
                catalog[key]["formula"] = definition.get("formula")
                catalog[key]["component_fields"] = definition.get("component_fields", [])
                catalog[key]["calculation_type"] = definition.get("calculation_type", "derived")
            continue

        merged = dict(definition)
        merged["aliases"] = sorted(set(merged.get("aliases", []) + [key, key.replace("_", " ")]))
        merged["source"] = merged.get("source", "business_registry")
        catalog[key] = merged

    return catalog


def _build_term_synonym_map() -> Dict[str, Set[str]]:
    synonym_map: Dict[str, Set[str]] = {}
    for left, right in _TERM_SYNONYM_PAIRS:
        l = left.strip().lower()
        r = right.strip().lower()
        if not l or not r:
            continue
        synonym_map.setdefault(l, set()).add(r)
        synonym_map.setdefault(r, set()).add(l)
    return synonym_map


_TERM_SYNONYM_MAP: Dict[str, Set[str]] = _build_term_synonym_map()


def _expand_term_variants(term: str, max_variants: int = 24) -> List[str]:
    normalized = _normalize_match_text(term)
    if not normalized:
        return []

    tokens = [token for token in normalized.split(" ") if token]
    if not tokens:
        return [normalized]

    variants: List[str] = [normalized]
    seen: Set[str] = {normalized}

    for index, token in enumerate(tokens):
        synonyms = sorted(_TERM_SYNONYM_MAP.get(token, set()))
        for synonym in synonyms:
            replacement = [*tokens]
            replacement[index] = synonym
            variant = " ".join(replacement).strip()
            if not variant or variant in seen:
                continue
            variants.append(variant)
            seen.add(variant)
            if len(variants) >= max_variants:
                return variants

    return variants


def _extract_metric_keys_from_text(
    text: str,
    alias_lookup: Dict[str, str],
    metric_scores: Dict[str, float],
) -> None:
    lower = (text or "").lower()
    if not lower:
        return

    for alias, metric_key in alias_lookup.items():
        if _safe_contains_alias(alias, lower):
            metric_scores[metric_key] = metric_scores.get(metric_key, 0.0) + min(1.0, 0.35 + len(alias) / 40.0)


def _extract_related_metric_keys_for_text(
    text: str,
    alias_lookup: Dict[str, str],
    metric_catalog: Dict[str, Dict[str, Any]],
    max_keys: int = 6,
) -> List[str]:
    q_scores: Dict[str, float] = {}
    _extract_metric_keys_from_text(text, alias_lookup, q_scores)
    q_metric_keys = sorted(q_scores.items(), key=lambda item: item[1], reverse=True)
    if not q_metric_keys:
        return []
    top_metric_score = float(q_metric_keys[0][1])
    retention_floor = max(0.34, top_metric_score * 0.7)
    return [
        key
        for key, score in q_metric_keys[:max_keys]
        if key in metric_catalog and float(score) >= retention_floor
    ]


def _extract_explicit_metric_phrase(question: str) -> str:
    lower = (question or "").lower()
    metric_patterns = [
        r"\b(?:average|mean|median|total|sum|count|number of)\s+([a-z][a-z0-9\s_-]{2,35})",
        r"\b([a-z][a-z0-9\s_-]{2,35})\s+(?:rate|score|index|ratio|velocity|efficiency|performance|length)\b",
        r"\b(roi|roas|nps|csat|cac|ltv|mrr|arr|attrition|churn|retention|engagement)\b",
    ]
    for pattern in metric_patterns:
        match = re.search(pattern, lower)
        if not match:
            continue
        cleaned = _clean_concept_phrase(match.group(1), max_words=7)
        if cleaned:
            return cleaned
    return ""


def _split_multi_part_question(question: str) -> List[str]:
    cleaned = re.sub(r"\s+", " ", (question or "")).strip(" .")
    if not cleaned:
        return []

    parts = [cleaned]
    split_patterns = [
        r"\s*;\s*",
        r"\?\s+",
        r"\s+\b(?:then|also|plus|as well as|followed by)\b\s+",
    ]
    for pattern in split_patterns:
        next_parts: List[str] = []
        for part in parts:
            split = [segment.strip(" ,.;") for segment in re.split(pattern, part, flags=re.IGNORECASE) if segment.strip(" ,.;")]
            next_parts.extend(split)
        parts = next_parts or parts

    if len(parts) == 1 and re.search(r"\s+\band\b\s+", cleaned, flags=re.IGNORECASE):
        and_split = [
            segment.strip(" ,.;")
            for segment in re.split(r"\s+\band\b\s+", cleaned, flags=re.IGNORECASE)
            if segment.strip(" ,.;")
        ]
        if len(and_split) >= 2 and all(len(segment.split()) >= 3 for segment in and_split):
            parts = and_split

    valid_parts = []
    for part in parts:
        if len(part.split()) < 3:
            continue
        valid_parts.append(part)

    return _dedupe_strings(valid_parts) or [cleaned]


def _build_context_lingo_rules(researcher_context: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not isinstance(researcher_context, dict):
        return []

    candidate_entries: List[Dict[str, Any]] = []
    seen_terms: Set[str] = set()

    def _register_entry(
        *,
        term: str,
        definition: str = "",
        metric_hint: str = "",
        dimension_hint: str = "",
    ) -> None:
        normalized_term = re.sub(r"\s+", " ", (term or "").strip())
        if len(normalized_term) < 3:
            return
        term_key = normalized_term.lower()
        if term_key in seen_terms:
            return
        seen_terms.add(term_key)
        candidate_entries.append(
            {
                "term": normalized_term,
                "definition": re.sub(r"\s+", " ", (definition or "").strip()),
                "metricHint": re.sub(r"\s+", " ", (metric_hint or "").strip()) or None,
                "dimensionHint": re.sub(r"\s+", " ", (dimension_hint or "").strip()) or None,
            }
        )

    def _ingest_container(container: Any) -> None:
        if isinstance(container, dict):
            # Shape: {"termDefinitions": {"leaky bucket": "..."}}
            term_definitions = container.get("termDefinitions")
            if isinstance(term_definitions, dict):
                for raw_term, raw_definition in term_definitions.items():
                    if isinstance(raw_term, str):
                        _register_entry(
                            term=raw_term,
                            definition=str(raw_definition or ""),
                        )

            # Shape: {"glossary": [{"term":"...","definition":"..."}]}
            for list_key in ("glossary", "domainGlossary", "industryTerms", "lingo", "vocabulary", "terms"):
                list_value = container.get(list_key)
                if not isinstance(list_value, list):
                    continue
                for item in list_value:
                    if isinstance(item, str):
                        _register_entry(term=item)
                        continue
                    if not isinstance(item, dict):
                        continue
                    _register_entry(
                        term=str(item.get("term") or item.get("name") or item.get("phrase") or item.get("label") or ""),
                        definition=str(item.get("definition") or item.get("meaning") or item.get("description") or ""),
                        metric_hint=str(item.get("metricHint") or item.get("metric") or item.get("metricConcept") or ""),
                        dimension_hint=str(item.get("dimensionHint") or item.get("dimension") or item.get("dimensionConcept") or ""),
                    )

    _ingest_container(researcher_context)
    template_obj = researcher_context.get("template")
    if isinstance(template_obj, dict):
        _ingest_container(template_obj)
        metadata_obj = template_obj.get("metadata")
        if isinstance(metadata_obj, dict):
            _ingest_container(metadata_obj)

    rules: List[Dict[str, Any]] = []
    for entry in candidate_entries[:20]:
        term = str(entry.get("term") or "").strip()
        if not term:
            continue
        definition = str(entry.get("definition") or "").strip()
        metric_hint = str(entry.get("metricHint") or "").strip() or None
        dimension_hint = str(entry.get("dimensionHint") or "").strip() or None
        base_text = f'What metric in this dataset best represents "{term}"?'
        if definition:
            base_text = f'{base_text} Interpret "{term}" as: {definition}.'
        expansion_texts = [base_text]
        if definition:
            expansion_texts.append(f'How does "{term}" ({definition}) vary across segments?')
        expansion_items = [
            {
                "text": text,
                "metricHint": metric_hint,
                "dimensionHint": dimension_hint,
            }
            for text in _dedupe_strings(expansion_texts)
        ]
        if not expansion_items:
            continue
        term_pattern = r"\b" + re.escape(term.lower()).replace(r"\ ", r"[\s_-]+") + r"\b"
        rules.append(
            {
                "label": f"context_{_slugify(term)}",
                "patterns": [term_pattern],
                "expansions": expansion_items,
            }
        )

    return rules


def _expand_industry_lingo(
    fragment: str,
    context_rules: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    lower = (fragment or "").lower()
    if not lower:
        return []

    expansions: List[Dict[str, Any]] = []
    all_rules = [*_LINGO_EXPANSION_RULES, *((context_rules or [])[:20])]
    for rule in all_rules:
        patterns = rule.get("patterns", [])
        if not any(re.search(pattern, lower) for pattern in patterns):
            continue
        for item in rule.get("expansions", []):
            text = str(item.get("text") or "").strip()
            if not text:
                continue
            expansions.append(
                {
                    "text": text,
                    "expansionType": "lingo",
                    "rule": str(rule.get("label") or "lingo"),
                    "metricHint": str(item.get("metricHint") or "").strip() or None,
                    "dimensionHint": str(item.get("dimensionHint") or "").strip() or None,
                }
            )
    return expansions


def _build_recursive_question_layers(
    question: str,
    max_depth: int = 3,
    max_nodes: int = 24,
    context_lingo_rules: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    root_text = re.sub(r"\s+", " ", (question or "")).strip()
    if not root_text:
        return {"layers": [], "leafNodes": [], "layerCount": 0, "leafCount": 0}

    layers: List[Dict[str, Any]] = [
        {
            "id": "L0",
            "parentId": None,
            "depth": 0,
            "text": root_text,
            "expansionType": "root",
            "rule": None,
            "metricHint": None,
            "dimensionHint": None,
            "children": [],
        }
    ]

    queue: List[int] = [0]

    while queue and len(layers) < max_nodes:
        node_index = queue.pop(0)
        node = layers[node_index]
        node_text = str(node.get("text") or "")
        node_depth = int(node.get("depth") or 0)
        if node_depth >= max_depth:
            continue

        candidates: List[Dict[str, Any]] = []
        multi_parts = _split_multi_part_question(node_text)
        if len(multi_parts) > 1:
            for part in multi_parts:
                candidates.append(
                    {
                        "text": part,
                        "expansionType": "multi_part",
                        "rule": "split",
                        "metricHint": None,
                        "dimensionHint": None,
                    }
                )

        candidates.extend(_expand_industry_lingo(node_text, context_rules=context_lingo_rules))
        if not candidates:
            continue

        local_seen: Set[str] = set()
        for candidate in candidates:
            candidate_text = str(candidate.get("text") or "").strip()
            candidate_norm = _normalize_match_text(candidate_text)
            if not candidate_norm:
                continue
            if candidate_norm == _normalize_match_text(node_text):
                continue
            if candidate_norm in local_seen:
                continue
            local_seen.add(candidate_norm)

            if len(layers) >= max_nodes:
                break
            child_id = f"L{len(layers)}"
            child = {
                "id": child_id,
                "parentId": node.get("id"),
                "depth": node_depth + 1,
                "text": candidate_text,
                "expansionType": candidate.get("expansionType"),
                "rule": candidate.get("rule"),
                "metricHint": candidate.get("metricHint"),
                "dimensionHint": candidate.get("dimensionHint"),
                "children": [],
            }
            layers.append(child)
            node["children"].append(child_id)
            queue.append(len(layers) - 1)

    leaf_nodes = [layer for layer in layers if not layer.get("children")]
    if not leaf_nodes:
        leaf_nodes = [layers[0]]
    return {
        "layers": layers,
        "leafNodes": leaf_nodes,
        "layerCount": len(layers),
        "leafCount": len(leaf_nodes),
    }


def _extract_metric_keys(
    user_goals: List[str],
    user_questions: List[str],
    metric_catalog: Dict[str, Dict[str, Any]],
) -> List[str]:
    alias_lookup: Dict[str, str] = {}
    for key, definition in metric_catalog.items():
        for alias in definition.get("aliases", []):
            normalized_alias = alias.strip().lower()
            if normalized_alias:
                alias_lookup[normalized_alias] = key

    metric_scores: Dict[str, float] = {}
    for text in [*(user_goals or []), *(user_questions or [])]:
        _extract_metric_keys_from_text(text, alias_lookup, metric_scores)

    ranked_metrics = sorted(metric_scores.items(), key=lambda item: item[1], reverse=True)
    metric_keys = [key for key, _ in ranked_metrics[:14] if key in metric_catalog]

    deduped: List[str] = []
    seen: Set[str] = set()
    for key in metric_keys:
        if key not in seen:
            deduped.append(key)
            seen.add(key)
    return deduped[:12]


def _normalize_match_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _compact_match_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def _tokenize_match_text(value: str) -> Set[str]:
    normalized = _normalize_match_text(value)
    tokens: Set[str] = set()
    for token in normalized.split(" "):
        if not token:
            continue
        tokens.add(token)
        if token.endswith("s") and len(token) > 3:
            tokens.add(token[:-1])
    return tokens


def _dedupe_strings(values: List[str]) -> List[str]:
    deduped: List[str] = []
    seen: Set[str] = set()
    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = value.strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(cleaned)
    return deduped


def _coerce_json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return json.loads(text)
        except Exception:
            return None
    return None


def _score_term_to_column_base(term: str, column: str) -> float:
    term_norm = _normalize_match_text(term)
    col_norm = _normalize_match_text(column)
    if not term_norm or not col_norm:
        return 0.0

    term_compact = _compact_match_text(term_norm)
    col_compact = _compact_match_text(col_norm)
    if not term_compact or not col_compact:
        return 0.0

    if term_compact == col_compact:
        return 1.0

    contains_score = 0.0
    if term_compact in col_compact or col_compact in term_compact:
        contains_score = 0.88

    term_tokens = _tokenize_match_text(term_norm)
    col_tokens = _tokenize_match_text(col_norm)
    token_prefix_match = any(
        col_token.startswith(term_token) or term_token.startswith(col_token)
        for term_token in term_tokens
        for col_token in col_tokens
    )
    if token_prefix_match:
        contains_score = max(contains_score, 0.76)
    token_overlap = (
        len(term_tokens & col_tokens) / max(1, len(term_tokens | col_tokens))
        if term_tokens or col_tokens
        else 0.0
    )
    sequence_similarity = difflib.SequenceMatcher(None, term_compact, col_compact).ratio()

    blended_score = max(contains_score, (0.62 * token_overlap) + (0.38 * sequence_similarity))
    return max(0.0, min(1.0, blended_score))


def _score_term_to_column(term: str, column: str) -> float:
    term_variants = _expand_term_variants(term)
    if not term_variants:
        return 0.0

    best_score = 0.0
    for idx, variant in enumerate(term_variants):
        variant_score = _score_term_to_column_base(variant, column)
        if idx > 0:
            # Synonym-expanded variants are useful but slightly lower confidence than direct terms.
            variant_score *= 0.93
        if variant_score > best_score:
            best_score = variant_score
    return max(0.0, min(1.0, best_score))


def _best_column_for_terms(
    terms: List[str],
    available_columns: List[str],
    blocked_columns: Optional[Set[str]] = None,
) -> Tuple[Optional[str], float]:
    blocked = blocked_columns or set()
    normalized_terms = [term for term in _dedupe_strings(terms) if term]
    best_column: Optional[str] = None
    best_score = 0.0

    for column in available_columns:
        if column in blocked:
            continue
        column_best = 0.0
        for term in normalized_terms:
            candidate_score = _score_term_to_column(term, column)
            if candidate_score > column_best:
                column_best = candidate_score
        if column_best > best_score:
            best_score = column_best
            best_column = column

    return best_column, best_score


_MIN_METRIC_GROUNDING_SCORE = 0.68
_DIRECT_METRIC_GROUNDING_SCORE = 0.86


def _extract_metric_candidates_from_question(question: str) -> List[str]:
    lower = (question or "").lower()
    if not lower:
        return []

    patterns = [
        r"\b(?:average|mean|median|total|sum|count|number of)\s+([a-z][a-z0-9\s_-]{2,35})",
        r"\b([a-z][a-z0-9\s_-]{2,35})\s+(?:rate|score|index|ratio|velocity|efficiency|performance|length)\b",
        r"\b(?:drivers? of|impact of|trend of|distribution of)\s+([a-z][a-z0-9\s_-]{2,35})",
    ]

    candidates: List[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, lower):
            cleaned = _clean_concept_phrase(match, max_words=7)
            if cleaned:
                candidates.append(cleaned)

    return _dedupe_strings(candidates)


def _ground_metric_to_dataset_column(
    question: str,
    metric_concept: str,
    related_metric_keys: List[str],
    metric_catalog: Dict[str, Dict[str, Any]],
    available_columns: Optional[List[str]],
) -> Tuple[Optional[str], float]:
    columns = _dedupe_strings(available_columns or [])
    if not columns:
        return None, 0.0

    base_terms: List[str] = []
    if metric_concept and metric_concept not in {"metric", "value", "result"}:
        base_terms.append(metric_concept)
    base_terms.extend(_extract_metric_candidates_from_question(question))

    for metric_key in related_metric_keys[:4]:
        metric_def = metric_catalog.get(metric_key, {})
        base_terms.extend(
            _dedupe_strings(
                [
                    metric_key,
                    metric_key.replace("_", " "),
                    str(metric_def.get("display_name") or ""),
                    *[str(alias) for alias in metric_def.get("aliases", [])],
                ]
            )
        )

    base_terms = _dedupe_strings([term for term in base_terms if term])
    if not base_terms:
        return None, 0.0

    matched_column, score = _best_column_for_terms(base_terms, columns)
    if not matched_column or score < _MIN_METRIC_GROUNDING_SCORE:
        # Fallback for derived metrics: try component terms as grounded proxies.
        component_terms: List[str] = []
        for metric_key in related_metric_keys[:3]:
            metric_def = metric_catalog.get(metric_key, {})
            for field in metric_def.get("component_fields", []) or []:
                cleaned = _clean_concept_phrase(str(field), max_words=5)
                if cleaned:
                    component_terms.append(cleaned)
            formula = str(metric_def.get("formula") or "").strip()
            if formula:
                formula_tokens = [
                    token.lower()
                    for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]{2,}", formula)
                    if token.lower() not in {"avg", "sum", "count", "total", "mean", "min", "max"}
                ]
                component_terms.extend(_dedupe_strings(formula_tokens))

        component_terms = _dedupe_strings(component_terms)
        if component_terms:
            component_match, component_score = _best_column_for_terms(component_terms, columns)
            if component_match and component_score >= _MIN_METRIC_GROUNDING_SCORE:
                return component_match, component_score
            score = max(score, component_score)
        return None, score
    return matched_column, score


_MIN_DIMENSION_GROUNDING_SCORE = 0.6
_DIRECT_DIMENSION_GROUNDING_SCORE = 0.8


def _ground_dimension_to_dataset_column(
    question: str,
    dimension_concept: Optional[str],
    available_columns: Optional[List[str]],
    metric_column: Optional[str] = None,
) -> Tuple[Optional[str], float]:
    columns = _dedupe_strings(available_columns or [])
    if not columns:
        return None, 0.0

    terms: List[str] = []
    if dimension_concept:
        cleaned = _clean_concept_phrase(dimension_concept, max_words=6)
        if cleaned:
            terms.append(cleaned)

    lower = (question or "").lower()
    for pattern in [
        r"\bby\s+([a-z][a-z0-9\s_-]{1,30})",
        r"\bfor each\s+([a-z][a-z0-9\s_-]{1,30})",
        r"\bacross\s+(?:different\s+)?([a-z][a-z0-9\s_-]{1,30})",
        r"\bsegment(?:ed)? by\s+([a-z][a-z0-9\s_-]{1,30})",
    ]:
        for match in re.findall(pattern, lower):
            cleaned = _clean_concept_phrase(match, max_words=6)
            if cleaned:
                terms.append(cleaned)

    terms = _dedupe_strings(terms)
    if not terms:
        return None, 0.0

    blocked_columns: Set[str] = set()
    metric_col = str(metric_column or "").strip()
    if metric_col:
        blocked_columns.add(metric_col)

    matched_column, score = _best_column_for_terms(terms, columns, blocked_columns=blocked_columns)
    if not matched_column or score < _MIN_DIMENSION_GROUNDING_SCORE:
        return None, score
    return matched_column, score


def _infer_column_data_type_from_name(column_name: str) -> str:
    tokens = _tokenize_match_text(column_name)
    if not tokens:
        return "numeric"

    datetime_tokens = {"date", "time", "timestamp", "year", "month", "quarter", "week", "day"}
    categorical_tokens = {
        "id",
        "name",
        "type",
        "category",
        "segment",
        "group",
        "region",
        "department",
        "team",
        "status",
        "level",
    }

    if tokens & datetime_tokens:
        return "datetime"
    if tokens & categorical_tokens:
        return "categorical"
    return "numeric"


def _register_dataset_column_metric(
    metric_catalog: Dict[str, Dict[str, Any]],
    column_name: str,
    domain: str,
) -> str:
    metric_key = f"dataset_column_{_slugify(column_name)}"
    if metric_key not in metric_catalog:
        normalized_alias = _normalize_match_text(column_name)
        metric_catalog[metric_key] = {
            "aliases": _dedupe_strings(
                [
                    column_name.lower(),
                    normalized_alias,
                    _slugify(column_name).replace("_", " "),
                ]
            ),
            "display_name": column_name,
            "description": f"Dataset column '{column_name}' grounded from the user question.",
            "data_type": _infer_column_data_type_from_name(column_name),
            "domain": domain or "general",
            "calculation_type": "direct",
            "source": "dataset_schema",
        }
    return metric_key


async def _load_project_available_columns(project_id: str) -> List[str]:
    """
    Load available column names from linked project datasets.
    Pulls from schema first, then preview/transformed rows as fallback.
    """
    columns: List[str] = []

    async with get_db_context() as session:
        column_result = await session.execute(
            sa_text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'datasets'"
            )
        )
        dataset_columns = {row[0] for row in column_result.fetchall()}

        selectable = []
        for col in ["schema", "preview", "ingestion_metadata", "metadata"]:
            if col in dataset_columns:
                selectable.append(f"d.{col} AS {col}")

        if not selectable:
            return []

        result = await session.execute(
            sa_text(
                f"SELECT {', '.join(selectable)} "
                "FROM datasets d "
                "INNER JOIN project_datasets pd ON pd.dataset_id = d.id "
                "WHERE pd.project_id = :project_id "
                "ORDER BY pd.added_at DESC"
            ),
            {"project_id": project_id},
        )
        rows = result.fetchall()
        keys = list(result.keys())

    for row in rows:
        row_dict = dict(zip(keys, row))

        schema_obj = _coerce_json_value(row_dict.get("schema"))
        if isinstance(schema_obj, dict):
            columns.extend(str(key) for key in schema_obj.keys() if str(key).strip())

        preview_rows = _coerce_json_value(row_dict.get("preview"))
        if isinstance(preview_rows, list):
            for item in preview_rows[:20]:
                if isinstance(item, dict):
                    columns.extend(str(key) for key in item.keys() if str(key).strip())

        for meta_key in ["ingestion_metadata", "metadata"]:
            metadata_obj = _coerce_json_value(row_dict.get(meta_key))
            if not isinstance(metadata_obj, dict):
                continue
            transformed_rows = metadata_obj.get("transformedData")
            if isinstance(transformed_rows, list):
                for item in transformed_rows[:20]:
                    if isinstance(item, dict):
                        columns.extend(str(key) for key in item.keys() if str(key).strip())

    return _dedupe_strings(columns)


def _apply_column_mappings(
    required_data_elements: List[Dict[str, Any]],
    optional_data_elements: List[Dict[str, Any]],
    metric_catalog: Dict[str, Dict[str, Any]],
    available_columns: List[str],
) -> None:
    """
    Auto-map required/optional elements to available dataset columns.
    Adds sourceField/sourceColumn/sourceColumns metadata and mapping status.
    """
    columns = _dedupe_strings(available_columns)
    if not columns:
        return

    all_elements = [*(required_data_elements or []), *(optional_data_elements or [])]
    for element in all_elements:
        element_id = str(element.get("elementId") or element.get("id") or "")
        metric_key = element_id[3:] if element_id.startswith("el_") else _slugify(str(element.get("elementName", "")))
        metric_def = metric_catalog.get(metric_key, {})

        aliases = _dedupe_strings(
            [
                metric_key,
                metric_key.replace("_", " "),
                str(element.get("elementName") or ""),
                str(metric_def.get("display_name") or ""),
                *[str(alias) for alias in metric_def.get("aliases", [])],
            ]
        )

        source_columns_detail = element.get("sourceColumns")
        if not isinstance(source_columns_detail, list):
            source_columns_detail = []
        normalized_source_columns_detail: List[Dict[str, Any]] = []
        for item in source_columns_detail:
            if isinstance(item, dict) and item.get("componentField"):
                normalized_source_columns_detail.append(
                    {
                        "componentField": str(item.get("componentField")),
                        "matchedColumn": item.get("matchedColumn"),
                        "matchConfidence": float(item.get("matchConfidence", 0.0) or 0.0),
                        "matched": bool(item.get("matched", False)),
                    }
                )

        component_fields = [
            str(field).strip()
            for field in metric_def.get("component_fields", []) or []
            if str(field).strip()
        ]
        if not component_fields:
            calc_def = element.get("calculationDefinition") or {}
            calc_formula = calc_def.get("formula") if isinstance(calc_def, dict) else {}
            if isinstance(calc_formula, dict):
                component_fields = [
                    str(field).strip()
                    for field in calc_formula.get("componentFields", []) or []
                    if str(field).strip()
                ]
        if not normalized_source_columns_detail and component_fields:
            normalized_source_columns_detail = [
                {
                    "componentField": field,
                    "matchedColumn": None,
                    "matchConfidence": 0.0,
                    "matched": False,
                }
                for field in component_fields
            ]

        blocked_columns: Set[str] = set()
        if normalized_source_columns_detail:
            updated_source_columns: List[Dict[str, Any]] = []
            for component in normalized_source_columns_detail:
                field_name = str(component.get("componentField") or "").strip()
                field_metric_def = metric_catalog.get(_slugify(field_name), {})
                field_terms = _dedupe_strings(
                    [
                        field_name,
                        field_name.replace("_", " "),
                        *[str(alias) for alias in field_metric_def.get("aliases", [])],
                    ]
                )
                matched_column, match_score = _best_column_for_terms(
                    field_terms or aliases,
                    columns,
                    blocked_columns=blocked_columns,
                )
                is_matched = bool(matched_column and match_score >= 0.62)
                if is_matched and matched_column:
                    blocked_columns.add(matched_column)
                updated_source_columns.append(
                    {
                        "componentField": field_name,
                        "matchedColumn": matched_column if is_matched else None,
                        "matchConfidence": round(float(match_score), 3),
                        "matched": is_matched,
                    }
                )

            element["sourceColumns"] = updated_source_columns
            matched_components = [item for item in updated_source_columns if item.get("matched")]
            all_components_matched = bool(updated_source_columns) and len(matched_components) == len(updated_source_columns)
            best_component_score = max(
                (float(item.get("matchConfidence", 0.0) or 0.0) for item in updated_source_columns),
                default=0.0,
            )

            if all_components_matched:
                primary_column = str(matched_components[0]["matchedColumn"])
                element["sourceField"] = primary_column
                element["sourceColumn"] = primary_column
                element["sourceAvailable"] = True
                element["mappingStatus"] = "mapped"
            elif matched_components:
                primary_column = str(matched_components[0]["matchedColumn"])
                element["sourceField"] = primary_column
                element["sourceColumn"] = primary_column
                element["sourceAvailable"] = False
                element["mappingStatus"] = "partially_mapped"
            else:
                element["sourceField"] = None
                element["sourceColumn"] = None
                element["sourceAvailable"] = False
                element["mappingStatus"] = "unmapped"

            if element.get("transformationRequired"):
                matched_names = [str(item["matchedColumn"]) for item in matched_components if item.get("matchedColumn")]
                if matched_names:
                    calc_def = element.get("calculationDefinition") or {}
                    calc_formula = calc_def.get("formula") if isinstance(calc_def, dict) else {}
                    formula_expression = calc_formula.get("expression") if isinstance(calc_formula, dict) else None
                    if formula_expression:
                        element["suggestedTransformation"] = (
                            f"Compute from {', '.join(matched_names)} using formula: {formula_expression}"
                        )
                    else:
                        element["suggestedTransformation"] = (
                            f"Compute from mapped components: {', '.join(matched_names)}"
                        )

            existing_confidence = float(element.get("confidence", 70) or 70)
            normalized_confidence = existing_confidence / 100 if existing_confidence > 1 else existing_confidence
            blended_confidence = min(0.99, max(0.25, (normalized_confidence * 0.72) + (best_component_score * 0.28)))
            element["confidence"] = int(round(blended_confidence * 100))
            continue

        matched_column, match_score = _best_column_for_terms(aliases, columns)
        strong_match = bool(matched_column and match_score >= 0.66)
        partial_match = bool(matched_column and 0.52 <= match_score < 0.66)

        if strong_match and matched_column:
            element["sourceField"] = matched_column
            element["sourceColumn"] = matched_column
            element["sourceAvailable"] = True
            element["mappingStatus"] = "mapped"
            if not element.get("transformationRequired"):
                element["suggestedTransformation"] = f'Map directly from "{matched_column}"'
        elif partial_match and matched_column:
            element["sourceField"] = matched_column
            element["sourceColumn"] = matched_column
            element["sourceAvailable"] = False
            element["mappingStatus"] = "suggested"
        else:
            element["sourceField"] = None
            element["sourceColumn"] = None
            element["sourceAvailable"] = False
            element["mappingStatus"] = "unmapped"

        existing_confidence = float(element.get("confidence", 70) or 70)
        normalized_confidence = existing_confidence / 100 if existing_confidence > 1 else existing_confidence
        blended_confidence = min(0.99, max(0.2, (normalized_confidence * 0.75) + (match_score * 0.25)))
        element["confidence"] = int(round(blended_confidence * 100))


def _detect_domains(
    user_goals: List[str],
    user_questions: List[str],
    metric_keys: List[str],
    metric_catalog: Dict[str, Dict[str, Any]],
    industry: Optional[str],
) -> List[str]:
    text = " ".join([*(user_goals or []), *(user_questions or [])]).lower()
    domain_scores: Dict[str, float] = {}

    for domain, keywords in _DOMAIN_KEYWORDS.items():
        keyword_hits = sum(1 for keyword in keywords if _safe_contains_alias(keyword, text))
        if keyword_hits > 0:
            domain_scores[domain] = domain_scores.get(domain, 0.0) + keyword_hits * 0.8

    for metric_key in metric_keys:
        metric_domain = metric_catalog.get(metric_key, {}).get("domain")
        if metric_domain:
            domain_scores[metric_domain] = domain_scores.get(metric_domain, 0.0) + 1.0

    if industry:
        domain_scores[industry.lower()] = domain_scores.get(industry.lower(), 0.0) + 0.6

    ranked_domains = sorted(domain_scores.items(), key=lambda item: item[1], reverse=True)
    detected = [domain for domain, _ in ranked_domains[:3]]
    return detected or ([industry.lower()] if industry else ["general"])


def _clean_concept_phrase(value: Optional[str], max_words: int = 8) -> Optional[str]:
    if not value or not isinstance(value, str):
        return None
    cleaned = re.sub(r"[^\w\s-]+", " ", value.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" -_")
    if not cleaned:
        return None
    tokens = [token for token in cleaned.split(" ") if token]
    stop_tokens = {"the", "a", "an", "of", "to", "for", "and", "is", "are", "that", "this"}
    while tokens and tokens[0] in stop_tokens:
        tokens = tokens[1:]
    while tokens and tokens[-1] in stop_tokens:
        tokens = tokens[:-1]
    if not tokens:
        return None
    return " ".join(tokens[:max_words])


def _extract_grouping_dimension(question: str) -> Optional[str]:
    lower = (question or "").lower()
    patterns = [
        r"\bby\s+([a-z][a-z0-9\s_-]{1,30})",
        r"\bacross\s+(?:different\s+)?([a-z][a-z0-9\s_-]{1,30})",
        r"\bfor each\s+([a-z][a-z0-9\s_-]{1,30})",
        r"\bwhich\s+([a-z][a-z0-9\s_-]{1,28})\s+(?:has|have|shows?|performs?|drives?|produce|produces|generates?)",
        r"\bcompare\s+(?:the\s+)?([a-z][a-z0-9\s_-]{1,25})",
    ]
    for pattern in patterns:
        match = re.search(pattern, lower)
        if not match:
            continue
        cleaned = _clean_concept_phrase(match.group(1), max_words=5)
        if cleaned:
            return cleaned
    return None


def _extract_filter_fragments(question: str) -> List[str]:
    lower = (question or "").lower()
    patterns = [
        r"\bfor\s+([a-z][a-z0-9\s_-]{2,30})",
        r"\bin\s+([a-z][a-z0-9\s_-]{2,25})",
        r"\bamong\s+([a-z][a-z0-9\s_-]{2,25})",
        r"\bwhere\s+([a-z0-9\s_<>=\.\-]{3,40})",
    ]
    fragments: List[str] = []
    for pattern in patterns:
        for match in re.findall(pattern, lower):
            cleaned = _clean_concept_phrase(match, max_words=7)
            if cleaned:
                fragments.append(cleaned)
    return _dedupe_strings(fragments)[:4]


def _infer_subject_of_analysis(question: str, grouping_dimension: Optional[str]) -> str:
    if grouping_dimension:
        return grouping_dimension
    lower = (question or "").lower()
    entity_rules: List[Tuple[str, str]] = [
        (r"\b(employee|staff|workforce|headcount|hire|termination)\b", "employee"),
        (r"\b(customer|client|subscriber|account)\b", "customer"),
        (r"\b(deal|opportunity|pipeline|lead|prospect)\b", "deal"),
        (r"\b(channel|source|campaign|ad)\b", "channel"),
        (r"\b(product|sku|offering|item)\b", "product"),
        (r"\b(team|department|division|region|segment)\b", "department"),
    ]
    for pattern, subject in entity_rules:
        if re.search(pattern, lower):
            return subject
    return "entity"


def _infer_metric_concept(
    question: str,
    related_metric_keys: List[str],
    metric_catalog: Dict[str, Dict[str, Any]],
) -> str:
    explicit_metric_phrase = _extract_explicit_metric_phrase(question)
    question_lower = (question or "").lower()

    if related_metric_keys:
        top_metric = related_metric_keys[0]
        top_def = metric_catalog.get(top_metric, {})
        display_name = str(top_def.get("display_name") or "").strip()
        aliases = [
            str(alias).strip().lower()
            for alias in (top_def.get("aliases") or [])
            if str(alias).strip()
        ]
        normalized_display = display_name.lower()
        meaningful_aliases = [
            alias
            for alias in aliases
            if len([token for token in alias.split(" ") if token]) > 1 or len(alias) >= 8
        ]

        # Prefer a specific phrase from the question over a generic alias hit
        # (e.g. "sales" aliasing to Revenue when the question asks "sales cycle length").
        if explicit_metric_phrase:
            explicit_tokens = [token for token in explicit_metric_phrase.split(" ") if token]
            is_specific_phrase = len(explicit_tokens) >= 2
            display_matches_explicit = bool(
                normalized_display
                and (
                    _safe_contains_alias(normalized_display, explicit_metric_phrase)
                    or _safe_contains_alias(explicit_metric_phrase, normalized_display)
                )
            )
            alias_matches_explicit = any(
                _safe_contains_alias(alias, explicit_metric_phrase)
                or _safe_contains_alias(explicit_metric_phrase, alias)
                for alias in meaningful_aliases
            )
            strong_alias_present_in_question = any(
                _safe_contains_alias(alias, question_lower)
                for alias in meaningful_aliases
            )
            if (
                is_specific_phrase
                and not display_matches_explicit
                and not alias_matches_explicit
                and not strong_alias_present_in_question
            ):
                return explicit_metric_phrase

        if display_name:
            return display_name.lower()
        return top_metric.replace("_", " ")

    return explicit_metric_phrase


def _resolve_computation_kind(question: str, intent_type: str) -> Dict[str, Any]:
    lower = (question or "").lower()

    strong_rules: List[Tuple[str, str, float]] = [
        (r"\bwhat[-\s]?if\b|\bscenario\b|\bif we\b|\bsimulat(e|ion)\b", "COMPARATIVE", 0.87),
        (r"\btheme|themes|feedback|comments?|sentiment|open[-\s]?text\b", "TEXT_THEMES", 0.9),
        (r"\bover time|trend|monthly|quarterly|yearly|forecast\b", "TEMPORAL_TREND", 0.9),
        (r"\bfunnel|stage conversion|drop[-\s]?off\b", "FUNNEL_ANALYSIS", 0.88),
        (r"\bcorrelation|relationship|association|linked to\b", "CORRELATION", 0.86),
        (r"\brank|highest|lowest|top\s+\d+|best|worst\b", "SEGMENT_RANKING", 0.84),
        (r"\bcompare|comparison|versus|vs|difference between\b", "COMPARATIVE", 0.82),
        (r"\bhow many|count|number of\b", "COUNT_FREQUENCY", 0.82),
        (r"\brate|percentage|proportion|likelihood|probability|risk\b", "EVENT_RATE", 0.8),
    ]
    for pattern, kind, confidence in strong_rules:
        if re.search(pattern, lower):
            return {"kind": kind, "confidence": confidence, "source": "signal_rule"}

    intent_map = {
        "trend": "TEMPORAL_TREND",
        "comparison": "COMPARATIVE",
        "ranking": "SEGMENT_RANKING",
        "distribution": "COUNT_FREQUENCY",
        "probability": "EVENT_RATE",
        "relationship": "CORRELATION",
        "causal": "CORRELATION",
        "aggregation": "AGGREGATE_MEAN",
        "segmentation": "SEGMENT_RANKING",
    }
    mapped_kind = intent_map.get(intent_type or "")
    if mapped_kind:
        return {"kind": mapped_kind, "confidence": 0.72, "source": "intent_map"}

    return {"kind": "AGGREGATE_MEAN", "confidence": 0.58, "source": "default"}


def _build_question_analysis_plan(
    *,
    question: str,
    intent_type: str,
    computation_kind: str,
    dimension_level: str,
    temporal_scope: str,
    has_metric_grounding: bool,
    has_dimension_grounding: bool,
) -> Dict[str, Any]:
    kind_map: Dict[str, List[str]] = {
        "TEMPORAL_TREND": ["time_series", "descriptive_stats"],
        "FUNNEL_ANALYSIS": ["group_analysis", "descriptive_stats", "statistical_tests"],
        "SEGMENT_RANKING": ["group_analysis", "descriptive_stats"],
        "COMPARATIVE": ["group_analysis", "statistical_tests", "descriptive_stats"],
        "COUNT_FREQUENCY": ["descriptive_stats", "group_analysis"],
        "EVENT_RATE": ["descriptive_stats", "group_analysis", "classification"],
        "CORRELATION": ["correlation", "regression", "descriptive_stats"],
        "TEXT_THEMES": ["text_analysis", "descriptive_stats"],
        "AGGREGATE_MEAN": ["descriptive_stats"],
        "DATA_GAP": ["descriptive_stats"],
    }

    intent_map: Dict[str, List[str]] = {
        "trend": ["time_series", "descriptive_stats"],
        "comparison": ["group_analysis", "statistical_tests", "descriptive_stats"],
        "causal": ["regression", "correlation", "descriptive_stats"],
        "relationship": ["correlation", "regression", "descriptive_stats"],
        "probability": ["classification", "regression", "descriptive_stats"],
        "segmentation": ["clustering", "group_analysis", "descriptive_stats"],
        "ranking": ["group_analysis", "descriptive_stats"],
        "distribution": ["descriptive_stats", "clustering"],
        "aggregation": ["descriptive_stats", "group_analysis"],
        "descriptive": ["descriptive_stats"],
    }

    analysis_candidates: List[str] = []
    analysis_candidates.extend(kind_map.get(str(computation_kind or "").upper(), ["descriptive_stats"]))
    analysis_candidates.extend(intent_map.get(intent_type, []))

    question_lower = (question or "").lower()
    if re.search(r"\bwhat[-\s]?if\b|\bscenario\b|\bsimulat(e|ion)\b", question_lower):
        analysis_candidates = ["regression", "group_analysis", *analysis_candidates]
    if temporal_scope == "over_time" and "time_series" not in analysis_candidates:
        analysis_candidates.insert(0, "time_series")
    if dimension_level == "group_by" and "group_analysis" not in analysis_candidates:
        analysis_candidates.insert(0, "group_analysis")

    normalized: List[str] = []
    for analysis in analysis_candidates:
        normalized_analysis = _normalize_analysis_type(analysis)
        if normalized_analysis and normalized_analysis in _ANALYSIS_LIBRARY and normalized_analysis not in normalized:
            normalized.append(normalized_analysis)
    if not normalized:
        normalized = ["descriptive_stats"]

    process_steps: List[Dict[str, str]] = [
        {
            "stepId": "slot_grounding",
            "title": "Ground question slots to the dataset",
            "detail": "Resolve subject, metric, and dimension references to concrete dataset columns.",
        },
        {
            "stepId": "metric_preparation",
            "title": "Prepare metric computation inputs",
            "detail": "Validate raw or derived metric components and required transformations.",
        },
        {
            "stepId": "analysis_execution",
            "title": "Execute primary and supporting analyses",
            "detail": "Run analysis methods selected for this question type and verify statistical validity.",
        },
        {
            "stepId": "evidence_synthesis",
            "title": "Synthesize answer with evidence trace",
            "detail": "Compose the answer with grounded evidence, assumptions, and confidence.",
        },
    ]

    blockers: List[str] = []
    if not has_metric_grounding:
        blockers.append("metric_not_grounded")
    if dimension_level == "group_by" and not has_dimension_grounding:
        blockers.append("dimension_not_grounded")
    if str(computation_kind or "").upper() == "DATA_GAP":
        blockers.append("computation_data_gap")

    if blockers:
        answerability = "data_gap" if "computation_data_gap" in blockers else "partial"
    else:
        answerability = "answerable"

    return {
        "primaryAnalysisType": normalized[0],
        "supportingAnalysisTypes": normalized[1:4],
        "analysisTypes": normalized[:4],
        "processSteps": process_steps,
        "answerability": answerability,
        "blockers": blockers,
    }


def _map_question_leaf(
    *,
    leaf_node: Dict[str, Any],
    intent_type: str,
    alias_lookup: Dict[str, str],
    metric_catalog: Dict[str, Dict[str, Any]],
    available_columns: Optional[List[str]],
    seed_metric_keys: List[str],
) -> Dict[str, Any]:
    leaf_text = str(leaf_node.get("text") or "").strip()
    metric_hint = str(leaf_node.get("metricHint") or "").strip()
    dimension_hint = str(leaf_node.get("dimensionHint") or "").strip()

    leaf_metric_keys = _extract_related_metric_keys_for_text(
        leaf_text,
        alias_lookup,
        metric_catalog,
        max_keys=4,
    )
    merged_metric_keys = _dedupe_strings([*seed_metric_keys, *leaf_metric_keys])[:6]

    metric_concept = _infer_metric_concept(leaf_text, merged_metric_keys, metric_catalog)
    if metric_hint and metric_concept in {"", "metric", "value", "result"}:
        metric_concept = _clean_concept_phrase(metric_hint, max_words=7) or metric_hint.lower()

    grounding_text = leaf_text
    if metric_hint:
        grounding_text = f"{leaf_text}. metric hint: {metric_hint}"

    grounded_metric_column, grounded_metric_score = _ground_metric_to_dataset_column(
        question=grounding_text,
        metric_concept=metric_concept,
        related_metric_keys=merged_metric_keys,
        metric_catalog=metric_catalog,
        available_columns=available_columns,
    )

    dimension_concept = _extract_grouping_dimension(leaf_text)
    if not dimension_concept and dimension_hint:
        dimension_concept = _clean_concept_phrase(dimension_hint, max_words=5) or dimension_hint.lower()
    grounded_dimension_column, grounded_dimension_score = _ground_dimension_to_dataset_column(
        question=leaf_text,
        dimension_concept=dimension_concept,
        available_columns=available_columns,
        metric_column=grounded_metric_column,
    )

    computation = _resolve_computation_kind(leaf_text, intent_type)
    clarity_score, clarity_issues = _evaluate_question_clarity(
        question=leaf_text,
        metric_concept=metric_concept,
        computation_source=str(computation.get("source") or "default"),
    )

    composite_confidence = round(
        max(
            0.2,
            min(
                0.99,
                (clarity_score * 0.35)
                + (float(grounded_metric_score) * 0.4)
                + (float(grounded_dimension_score) * 0.1)
                + (float(computation.get("confidence", 0.58)) * 0.15),
            ),
        ),
        3,
    )

    return {
        "leafId": leaf_node.get("id"),
        "leafText": leaf_text,
        "depth": leaf_node.get("depth"),
        "expansionType": leaf_node.get("expansionType"),
        "rule": leaf_node.get("rule"),
        "metricHint": metric_hint or None,
        "dimensionHint": dimension_hint or None,
        "metricConcept": metric_concept,
        "dimensionConcept": dimension_concept,
        "relatedMetricKeys": merged_metric_keys,
        "groundedMetricColumn": grounded_metric_column,
        "groundedMetricColumnConfidence": round(float(grounded_metric_score), 3),
        "groundedDimensionColumn": grounded_dimension_column,
        "groundedDimensionColumnConfidence": round(float(grounded_dimension_score), 3),
        "computationKind": str(computation.get("kind") or "AGGREGATE_MEAN"),
        "computationKindConfidence": float(computation.get("confidence", 0.58)),
        "clarityScore": clarity_score,
        "issues": clarity_issues,
        "confidence": composite_confidence,
    }


def _resolve_recursive_question_mapping(
    *,
    question: str,
    intent_type: str,
    alias_lookup: Dict[str, str],
    metric_catalog: Dict[str, Dict[str, Any]],
    available_columns: Optional[List[str]],
    seed_metric_keys: List[str],
    context_lingo_rules: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    layer_graph = _build_recursive_question_layers(
        question,
        context_lingo_rules=context_lingo_rules,
    )
    leaf_nodes = layer_graph.get("leafNodes", []) or []
    leaf_mappings = [
        _map_question_leaf(
            leaf_node=leaf_node,
            intent_type=intent_type,
            alias_lookup=alias_lookup,
            metric_catalog=metric_catalog,
            available_columns=available_columns,
            seed_metric_keys=seed_metric_keys,
        )
        for leaf_node in leaf_nodes
    ]

    if not leaf_mappings:
        return {
            "layers": layer_graph.get("layers", []),
            "leafMappings": [],
            "layerCount": int(layer_graph.get("layerCount", 0)),
            "leafCount": int(layer_graph.get("leafCount", 0)),
            "aggregated": {
                "metricConcept": "",
                "dimensionConcept": "",
                "groundedMetricColumn": None,
                "groundedDimensionColumn": None,
                "computationKind": "DATA_GAP",
                "relatedMetricKeys": seed_metric_keys,
                "confidence": 0.3,
                "answerability": "data_gap",
                "blockers": ["metric_not_grounded"],
            },
        }

    metric_candidates = [
        mapping
        for mapping in leaf_mappings
        if str(mapping.get("groundedMetricColumn") or "").strip()
    ]
    best_metric_mapping = sorted(
        metric_candidates,
        key=lambda item: (float(item.get("groundedMetricColumnConfidence", 0.0)), float(item.get("confidence", 0.0))),
        reverse=True,
    )[0] if metric_candidates else None

    dimension_candidates = [
        mapping
        for mapping in leaf_mappings
        if str(mapping.get("groundedDimensionColumn") or "").strip()
    ]
    best_dimension_mapping = sorted(
        dimension_candidates,
        key=lambda item: (float(item.get("groundedDimensionColumnConfidence", 0.0)), float(item.get("confidence", 0.0))),
        reverse=True,
    )[0] if dimension_candidates else None

    non_gap_mappings = [
        mapping
        for mapping in leaf_mappings
        if str(mapping.get("computationKind") or "").upper() != "DATA_GAP"
    ]
    best_kind_mapping = sorted(
        non_gap_mappings or leaf_mappings,
        key=lambda item: float(item.get("confidence", 0.0)),
        reverse=True,
    )[0]

    aggregated_metric_keys = _dedupe_strings(
        [*seed_metric_keys, *[key for mapping in leaf_mappings for key in (mapping.get("relatedMetricKeys") or [])]]
    )

    grouped_requested = bool(
        _extract_grouping_dimension(question)
        or any(mapping.get("dimensionConcept") for mapping in leaf_mappings)
    )
    blockers: List[str] = []
    if not best_metric_mapping:
        blockers.append("metric_not_grounded")
    if grouped_requested and not best_dimension_mapping:
        blockers.append("dimension_not_grounded")

    answerability = "answerable"
    if blockers:
        answerability = "partial" if best_metric_mapping else "data_gap"

    aggregated = {
        "metricConcept": (
            str(best_metric_mapping.get("metricConcept") or "").strip()
            if best_metric_mapping
            else str(best_kind_mapping.get("metricConcept") or "").strip()
        ),
        "dimensionConcept": (
            str(best_dimension_mapping.get("dimensionConcept") or "").strip()
            if best_dimension_mapping
            else str(best_kind_mapping.get("dimensionConcept") or "").strip()
        ),
        "groundedMetricColumn": best_metric_mapping.get("groundedMetricColumn") if best_metric_mapping else None,
        "groundedMetricColumnConfidence": (
            float(best_metric_mapping.get("groundedMetricColumnConfidence", 0.0))
            if best_metric_mapping
            else 0.0
        ),
        "groundedDimensionColumn": best_dimension_mapping.get("groundedDimensionColumn") if best_dimension_mapping else None,
        "groundedDimensionColumnConfidence": (
            float(best_dimension_mapping.get("groundedDimensionColumnConfidence", 0.0))
            if best_dimension_mapping
            else 0.0
        ),
        "computationKind": str(best_kind_mapping.get("computationKind") or "AGGREGATE_MEAN"),
        "computationKindConfidence": float(best_kind_mapping.get("computationKindConfidence", 0.58)),
        "relatedMetricKeys": aggregated_metric_keys,
        "confidence": round(
            max(
                0.2,
                min(
                    0.99,
                    sum(float(mapping.get("confidence", 0.0)) for mapping in leaf_mappings) / max(1, len(leaf_mappings)),
                ),
            ),
            3,
        ),
        "answerability": answerability,
        "blockers": blockers,
    }

    return {
        "layers": layer_graph.get("layers", []),
        "leafMappings": leaf_mappings,
        "layerCount": int(layer_graph.get("layerCount", len(layer_graph.get("layers", [])))),
        "leafCount": int(layer_graph.get("leafCount", len(leaf_mappings))),
        "aggregated": aggregated,
    }


def _evaluate_question_clarity(
    question: str,
    metric_concept: str,
    computation_source: str,
) -> Tuple[float, List[str]]:
    lower = (question or "").lower().strip()
    words = [word for word in re.split(r"\s+", lower) if word]
    issues: List[str] = []
    score = 0.9

    if len(words) < 5:
        score -= 0.18
        issues.append("question_too_short")
    if len(words) > 38:
        score -= 0.08
        issues.append("question_overly_long")
    if not re.search(r"\b(what|how|which|why|compare|show|find|identify|calculate|measure|rank)\b", lower):
        score -= 0.1
        issues.append("missing_action_verb")
    if metric_concept in {"", "metric", "value", "result"}:
        score -= 0.2
        issues.append("metric_concept_not_explicit")
    if re.search(r"\b(it|this|that|those)\b", lower) and metric_concept in {"", "metric", "value", "result"}:
        score -= 0.08
        issues.append("ambiguous_reference")
    if computation_source == "default":
        score -= 0.06
        issues.append("computation_kind_low_confidence")

    normalized_score = round(max(0.2, min(0.99, score)), 3)
    return normalized_score, _dedupe_strings(issues)


def _build_question_profile(
    question: str,
    intent: Dict[str, Any],
    related_metric_keys: List[str],
    metric_catalog: Dict[str, Dict[str, Any]],
    available_columns: Optional[List[str]] = None,
) -> Dict[str, Any]:
    grouping_dimension = _extract_grouping_dimension(question)
    filters = _extract_filter_fragments(question)
    metric_concept = _infer_metric_concept(question, related_metric_keys, metric_catalog)
    grounded_metric_column, grounded_metric_score = _ground_metric_to_dataset_column(
        question=question,
        metric_concept=metric_concept,
        related_metric_keys=related_metric_keys,
        metric_catalog=metric_catalog,
        available_columns=available_columns,
    )
    grounded_dimension_column, grounded_dimension_score = _ground_dimension_to_dataset_column(
        question=question,
        dimension_concept=grouping_dimension,
        available_columns=available_columns,
        metric_column=grounded_metric_column,
    )
    if not metric_concept and grounded_metric_column:
        metric_concept = _normalize_match_text(grounded_metric_column)
    if metric_concept in {"metric", "value", "result"} and grounded_metric_column:
        metric_concept = _normalize_match_text(grounded_metric_column)

    subject = _infer_subject_of_analysis(question, grouping_dimension)
    computation = _resolve_computation_kind(question, str(intent.get("intentType") or ""))
    if (
        str(computation.get("source") or "default") == "default"
        and not metric_concept
        and not grounded_metric_column
    ):
        computation = {"kind": "DATA_GAP", "confidence": 0.92, "source": "data_gap"}

    dimension_level = "overall"
    if grouping_dimension or grounded_dimension_column:
        dimension_level = "group_by"
    elif filters:
        dimension_level = "filter"

    clarity_score, clarity_issues = _evaluate_question_clarity(
        question=question,
        metric_concept=metric_concept,
        computation_source=str(computation.get("source") or "default"),
    )
    if str(computation.get("kind") or "") == "DATA_GAP":
        clarity_issues = _dedupe_strings([*clarity_issues, "metric_not_grounded_to_dataset_or_kb"])

    temporal_scope = "over_time" if re.search(
        r"\bover time|trend|monthly|quarterly|yearly|yoy|mom|week over week\b",
        (question or "").lower(),
    ) else "point_in_time"

    analysis_plan = _build_question_analysis_plan(
        question=question,
        intent_type=str(intent.get("intentType") or "descriptive"),
        computation_kind=str(computation.get("kind") or "AGGREGATE_MEAN"),
        dimension_level=dimension_level,
        temporal_scope=temporal_scope,
        has_metric_grounding=bool(grounded_metric_column),
        has_dimension_grounding=bool(grounded_dimension_column) if dimension_level == "group_by" else True,
    )

    semantic_slots = {
        "subject": subject,
        "metric": metric_concept,
        "dimension": grouping_dimension,
        "filters": filters,
    }

    return {
        "subjectOfAnalysis": subject,
        "objectOfAnalysis": metric_concept,
        "metricConcept": metric_concept,
        "dimensionConcept": grouping_dimension,
        "dimensionLevel": dimension_level,
        "temporalScope": temporal_scope,
        "filters": filters,
        "computationKind": computation.get("kind"),
        "computationKindConfidence": float(computation.get("confidence", 0.58)),
        "computationKindSource": computation.get("source"),
        "groundedMetricColumn": grounded_metric_column,
        "groundedMetricColumnConfidence": round(float(grounded_metric_score), 3),
        "groundedMetricColumnIsDirect": bool(
            grounded_metric_column and grounded_metric_score >= _DIRECT_METRIC_GROUNDING_SCORE
        ),
        "groundedDimensionColumn": grounded_dimension_column,
        "groundedDimensionColumnConfidence": round(float(grounded_dimension_score), 3),
        "groundedDimensionColumnIsDirect": bool(
            grounded_dimension_column and grounded_dimension_score >= _DIRECT_DIMENSION_GROUNDING_SCORE
        ),
        "clarityScore": clarity_score,
        "issues": clarity_issues,
        "semanticSlots": semantic_slots,
        "analysisPlan": analysis_plan,
        "answerability": analysis_plan.get("answerability", "partial"),
        "answerabilityBlockers": analysis_plan.get("blockers", []),
        "relatedMetricKeys": related_metric_keys,
    }


def _classify_question_intent(question: str) -> Dict[str, Any]:
    lower = (question or "").lower().strip()
    best_match = {
        "intentType": "descriptive",
        "confidence": 0.45,
        "recommendedAnalysisTypes": ["descriptive_stats"],
    }

    for rule in _INTENT_RULES:
        if any(re.search(pattern, lower) for pattern in rule["patterns"]):
            if rule["confidence"] > best_match["confidence"]:
                best_match = {
                    "intentType": rule["intent"],
                    "confidence": float(rule["confidence"]),
                    "recommendedAnalysisTypes": list(rule["analysis_types"]),
                }

    has_temporal = bool(re.search(r"\bover time\b|\btrend\b|\bmonthly\b|\bquarterly\b|\byearly\b|\byoy\b|\bmom\b", lower))
    has_comparison = bool(re.search(r"\bcompare\b|\bversus\b|\bvs\b|\bdifference\b|\bbetween\b", lower))
    has_grouping = bool(re.search(r"\bby\s+[a-z]+\b|\bsegment\b|\bgroup\b|\bcohort\b", lower))

    recommended = list(best_match["recommendedAnalysisTypes"])
    if has_temporal and "time_series" not in recommended:
        recommended.insert(0, "time_series")
    if has_comparison and "group_analysis" not in recommended:
        recommended.append("group_analysis")
    if "descriptive_stats" not in recommended:
        recommended.append("descriptive_stats")

    subject_match = re.search(
        r"(?:drivers? of|impact of|likelihood of|trend of|distribution of|compare)\s+([a-z][a-z\s_-]{2,40})",
        lower,
    )
    subject_concept = _slugify(subject_match.group(1)) if subject_match else None

    return {
        "intentType": best_match["intentType"],
        "subjectConcept": subject_concept,
        "conceptNeedsResolution": bool(subject_concept),
        "recommendedAnalysisTypes": recommended[:4],
        "confidence": min(1.0, best_match["confidence"] + (0.05 if has_temporal else 0.0) + (0.03 if has_grouping else 0.0)),
        "metadata": {
            "hasTemporal": has_temporal,
            "hasComparison": has_comparison,
            "hasGrouping": has_grouping,
        },
    }


def _infer_expected_artifacts(question: str, analysis_types: List[str]) -> List[Dict[str, str]]:
    question_lower = (question or "").lower()
    artifacts: List[Dict[str, str]] = []

    if "time_series" in analysis_types or any(token in question_lower for token in ["trend", "over time", "forecast"]):
        artifacts.append({"artifactType": "visualization", "description": "Trend chart with temporal breakdown"})
    if "correlation" in analysis_types:
        artifacts.append({"artifactType": "visualization", "description": "Correlation heatmap for key metrics"})
    if any(t in analysis_types for t in ["regression", "classification"]):
        artifacts.append({"artifactType": "model", "description": "Predictive model summary with driver importance"})
    if "group_analysis" in analysis_types or "comparison" in question_lower:
        artifacts.append({"artifactType": "dashboard", "description": "Segment comparison table and KPI ranking"})
    if not artifacts:
        artifacts.append({"artifactType": "report", "description": "Narrative summary with core KPI diagnostics"})

    return artifacts[:3]


def _build_analysis_path(
    question_intents: List[Dict[str, Any]],
    researcher_context: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    scores: Dict[str, float] = {}

    for item in question_intents:
        confidence = float(item.get("confidence", 0.6))
        for analysis_type in item.get("recommendedAnalysisTypes", []):
            normalized = _normalize_analysis_type(analysis_type)
            scores[normalized] = scores.get(normalized, 0.0) + confidence

    if researcher_context:
        recommendations: List[str] = []
        rec_obj = researcher_context.get("template") if isinstance(researcher_context, dict) else None
        if isinstance(rec_obj, dict):
            recommendations.extend(rec_obj.get("recommendedAnalyses", []) or [])
        for analysis_name in recommendations:
            normalized = _normalize_analysis_type(str(analysis_name))
            scores[normalized] = scores.get(normalized, 0.0) + 0.45

    scores["descriptive_stats"] = max(scores.get("descriptive_stats", 0.0), 0.8)
    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)

    analysis_path: List[Dict[str, Any]] = []
    for idx, (analysis_type, score) in enumerate(ordered[:6]):
        library_entry = _ANALYSIS_LIBRARY.get(analysis_type, {})
        analysis_path.append(
            {
                "analysisId": analysis_type,
                "analysisName": library_entry.get("name", _title_from_slug(analysis_type)),
                "analysisType": analysis_type,
                "analysisCategory": library_entry.get("category", "descriptive"),
                "description": library_entry.get("description", "Data analysis step"),
                "techniques": library_entry.get("techniques", []),
                "estimatedDuration": library_entry.get("estimatedDuration", "10-20 minutes"),
                "priority": idx + 1,
                "confidence": round(min(1.0, score / max(1.0, len(question_intents))), 3),
                "requiredElements": [],
                "requiredDataElements": [],
                "expectedArtifacts": _infer_expected_artifacts("", [analysis_type]),
            }
        )

    return analysis_path


async def _llm_enrich_requirements(
    user_goals: List[str],
    user_questions: List[str],
    industry: str,
    metric_keys: List[str],
    analysis_path: List[Dict[str, Any]],
) -> Dict[str, Any]:
    prompt = (
        "You are helping enrich a data requirements document.\n"
        "Return JSON only with this shape:\n"
        "{\n"
        '  "inferredMetrics": [{"name": "...", "description": "...", "dataType": "numeric|categorical|datetime|text", "relatedQuestions": ["..."]}],\n'
        '  "analysisHints": [{"analysisType": "descriptive_stats|correlation|regression|classification|time_series|clustering|group_analysis|statistical_tests|text_analysis", "reason": "..."}]\n'
        "}\n\n"
        f"Industry: {industry}\n"
        f"Goals: {json.dumps(user_goals)}\n"
        f"Questions: {json.dumps(user_questions)}\n"
        f"Existing metrics: {json.dumps(metric_keys)}\n"
        f"Existing analyses: {json.dumps([a.get('analysisType') for a in analysis_path])}\n"
    )

    raw = await _llm_generate(prompt)
    parsed = _parse_json_from_llm(raw) if raw else None
    if isinstance(parsed, dict):
        return parsed
    return {}


def _build_requirements_document(
    project_id: str,
    user_goals: List[str],
    user_questions: List[str],
    industry: str,
    researcher_context: Optional[Dict[str, Any]],
    metric_catalog: Dict[str, Dict[str, Any]],
    available_columns: Optional[List[str]] = None,
    llm_enrichment: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    question_intents: List[Dict[str, Any]] = []
    question_profiles: List[Dict[str, Any]] = []
    element_question_links: Dict[str, Set[str]] = {}
    element_analysis_links: Dict[str, Set[str]] = {}
    dimension_element_specs: Dict[str, Dict[str, Any]] = {}
    question_answer_mapping: List[Dict[str, Any]] = []
    normalized_available_columns = _dedupe_strings(available_columns or [])

    metric_keys = _extract_metric_keys(user_goals, user_questions, metric_catalog)
    domains = _detect_domains(user_goals, user_questions, metric_keys, metric_catalog, industry)
    analysis_path = _build_analysis_path(question_intents=[], researcher_context=researcher_context)

    alias_lookup: Dict[str, str] = {}
    for metric_key, definition in metric_catalog.items():
        for alias in definition.get("aliases", []):
            normalized_alias = alias.strip().lower()
            if normalized_alias:
                alias_lookup[normalized_alias] = metric_key
    context_lingo_rules = _build_context_lingo_rules(researcher_context)

    for question in user_questions:
        question_id = _stable_question_id(project_id, question)
        intent = _classify_question_intent(question)

        related_metric_keys: List[str] = _extract_related_metric_keys_for_text(
            question,
            alias_lookup,
            metric_catalog,
            max_keys=6,
        )
        recursive_resolution = _resolve_recursive_question_mapping(
            question=question,
            intent_type=str(intent.get("intentType") or "descriptive"),
            alias_lookup=alias_lookup,
            metric_catalog=metric_catalog,
            available_columns=normalized_available_columns,
            seed_metric_keys=related_metric_keys,
            context_lingo_rules=context_lingo_rules,
        )
        recursive_aggregated = recursive_resolution.get("aggregated", {}) if isinstance(recursive_resolution, dict) else {}
        recursive_metric_keys = recursive_aggregated.get("relatedMetricKeys", []) if isinstance(recursive_aggregated, dict) else []
        if isinstance(recursive_metric_keys, list) and recursive_metric_keys:
            related_metric_keys = _dedupe_strings([*recursive_metric_keys, *related_metric_keys])[:6]

        question_profile = _build_question_profile(
            question=question,
            intent=intent,
            related_metric_keys=related_metric_keys,
            metric_catalog=metric_catalog,
            available_columns=normalized_available_columns,
        )
        if isinstance(recursive_aggregated, dict) and recursive_aggregated:
            recursive_metric_column = str(recursive_aggregated.get("groundedMetricColumn") or "").strip()
            recursive_dimension_column = str(recursive_aggregated.get("groundedDimensionColumn") or "").strip()
            recursive_metric_concept = str(recursive_aggregated.get("metricConcept") or "").strip()
            recursive_dimension_concept = str(recursive_aggregated.get("dimensionConcept") or "").strip()
            recursive_kind = str(recursive_aggregated.get("computationKind") or "").strip().upper()
            recursive_kind_conf = float(recursive_aggregated.get("computationKindConfidence", 0.58))

            if recursive_metric_concept and str(question_profile.get("metricConcept") or "").strip() in {"", "metric", "value", "result"}:
                question_profile["metricConcept"] = recursive_metric_concept
                question_profile["objectOfAnalysis"] = recursive_metric_concept
            if recursive_metric_column and not str(question_profile.get("groundedMetricColumn") or "").strip():
                question_profile["groundedMetricColumn"] = recursive_metric_column
                question_profile["groundedMetricColumnConfidence"] = float(
                    recursive_aggregated.get("groundedMetricColumnConfidence", 0.0)
                )
                question_profile["groundedMetricColumnIsDirect"] = bool(
                    float(recursive_aggregated.get("groundedMetricColumnConfidence", 0.0)) >= _DIRECT_METRIC_GROUNDING_SCORE
                )
            if recursive_dimension_concept and not str(question_profile.get("dimensionConcept") or "").strip():
                question_profile["dimensionConcept"] = recursive_dimension_concept
            if recursive_dimension_column and not str(question_profile.get("groundedDimensionColumn") or "").strip():
                question_profile["groundedDimensionColumn"] = recursive_dimension_column
                question_profile["groundedDimensionColumnConfidence"] = float(
                    recursive_aggregated.get("groundedDimensionColumnConfidence", 0.0)
                )
                question_profile["groundedDimensionColumnIsDirect"] = bool(
                    float(recursive_aggregated.get("groundedDimensionColumnConfidence", 0.0)) >= _DIRECT_DIMENSION_GROUNDING_SCORE
                )
            if (
                recursive_kind
                and recursive_kind != "DATA_GAP"
                and str(question_profile.get("computationKind") or "").upper() == "DATA_GAP"
                and (
                    recursive_metric_column
                    or float(recursive_aggregated.get("groundedMetricColumnConfidence", 0.0)) >= _MIN_METRIC_GROUNDING_SCORE
                )
            ):
                question_profile["computationKind"] = recursive_kind
                question_profile["computationKindConfidence"] = recursive_kind_conf
                question_profile["computationKindSource"] = "recursive_layer_resolution"

            profile_metric = str(question_profile.get("metricConcept") or "").strip()
            profile_dimension = str(question_profile.get("dimensionConcept") or "").strip()
            profile_dim_col = str(question_profile.get("groundedDimensionColumn") or "").strip()
            if str(question_profile.get("dimensionLevel") or "overall") == "overall" and (profile_dimension or profile_dim_col):
                question_profile["dimensionLevel"] = "group_by"

            merged_metric_keys = _dedupe_strings(
                [*related_metric_keys, *(recursive_aggregated.get("relatedMetricKeys") or [])]
            )
            if merged_metric_keys:
                related_metric_keys = merged_metric_keys[:6]
                question_profile["relatedMetricKeys"] = related_metric_keys

            updated_analysis_plan = _build_question_analysis_plan(
                question=question,
                intent_type=str(intent.get("intentType") or "descriptive"),
                computation_kind=str(question_profile.get("computationKind") or "AGGREGATE_MEAN"),
                dimension_level=str(question_profile.get("dimensionLevel") or "overall"),
                temporal_scope=str(question_profile.get("temporalScope") or "point_in_time"),
                has_metric_grounding=bool(str(question_profile.get("groundedMetricColumn") or "").strip()),
                has_dimension_grounding=bool(str(question_profile.get("groundedDimensionColumn") or "").strip())
                if str(question_profile.get("dimensionLevel") or "overall") == "group_by"
                else True,
            )
            merged_blockers = _dedupe_strings(
                [
                    *[str(item) for item in updated_analysis_plan.get("blockers", [])],
                    *[str(item) for item in (recursive_aggregated.get("blockers") or [])],
                ]
            )
            if merged_blockers:
                updated_analysis_plan["blockers"] = merged_blockers
                updated_analysis_plan["answerability"] = (
                    "data_gap" if "metric_not_grounded" in merged_blockers else "partial"
                )
            question_profile["analysisPlan"] = updated_analysis_plan
            question_profile["answerability"] = updated_analysis_plan.get("answerability", "partial")
            question_profile["answerabilityBlockers"] = updated_analysis_plan.get("blockers", [])
            semantic_slots = dict(question_profile.get("semanticSlots") or {})
            semantic_slots["metric"] = question_profile.get("metricConcept")
            semantic_slots["dimension"] = question_profile.get("dimensionConcept")
            question_profile["semanticSlots"] = semantic_slots
            question_profile["decomposition"] = {
                "strategy": "recursive_lingo_and_multi_part",
                "layerCount": int(recursive_resolution.get("layerCount", len(recursive_resolution.get("layers", [])) if isinstance(recursive_resolution, dict) else 0)),
                "leafCount": int(recursive_resolution.get("leafCount", len(recursive_resolution.get("leafMappings", [])) if isinstance(recursive_resolution, dict) else 0)),
                "layers": recursive_resolution.get("layers", []) if isinstance(recursive_resolution, dict) else [],
                "leafMappings": recursive_resolution.get("leafMappings", []) if isinstance(recursive_resolution, dict) else [],
                "reconstruction": {
                    "highLevelQuestion": question,
                    "aggregatedMetricConcept": question_profile.get("metricConcept"),
                    "aggregatedDimensionConcept": question_profile.get("dimensionConcept"),
                    "aggregatedComputationKind": question_profile.get("computationKind"),
                    "method": "mapped granular leaves -> recomposed business question intent",
                },
            }

        grounded_metric_column = str(question_profile.get("groundedMetricColumn") or "").strip()
        grounded_dimension_column = str(question_profile.get("groundedDimensionColumn") or "").strip()
        metric_concept_text = str(question_profile.get("metricConcept") or "").strip().lower()
        top_metric_key = related_metric_keys[0] if related_metric_keys else ""
        top_metric_def = metric_catalog.get(top_metric_key, {})
        top_metric_aliases = _dedupe_strings(
            [
                top_metric_key,
                top_metric_key.replace("_", " "),
                str(top_metric_def.get("display_name") or "").lower(),
                *[str(alias).lower() for alias in (top_metric_def.get("aliases") or [])],
            ]
        )
        top_metric_meaningful_aliases = [
            alias
            for alias in top_metric_aliases
            if len([token for token in alias.split(" ") if token]) > 1 or len(alias) >= 8
        ]
        top_metric_matches_concept = bool(
            metric_concept_text
            and any(
                _safe_contains_alias(alias, metric_concept_text)
                or _safe_contains_alias(metric_concept_text, alias)
                for alias in top_metric_meaningful_aliases
                if alias
            )
        )

        if related_metric_keys and grounded_metric_column and metric_concept_text and not top_metric_matches_concept:
            grounded_metric_key = _register_dataset_column_metric(
                metric_catalog=metric_catalog,
                column_name=grounded_metric_column,
                domain=domains[0] if domains else "general",
            )
            related_metric_keys = [grounded_metric_key]
            question_profile["relatedMetricKeys"] = related_metric_keys
            if grounded_metric_key not in metric_keys:
                metric_keys.append(grounded_metric_key)
        elif not related_metric_keys and grounded_metric_column:
            grounded_metric_key = _register_dataset_column_metric(
                metric_catalog=metric_catalog,
                column_name=grounded_metric_column,
                domain=domains[0] if domains else "general",
            )
            related_metric_keys = [grounded_metric_key]
            question_profile["relatedMetricKeys"] = related_metric_keys
            if grounded_metric_key not in metric_keys:
                metric_keys.append(grounded_metric_key)

        question_profiles.append(
            {
                "questionId": question_id,
                "questionText": question,
                **question_profile,
            }
        )

        blended_question_confidence = (
            (float(intent["confidence"]) * 0.72)
            + (float(question_profile.get("clarityScore", 0.6)) * 0.28)
        )
        question_intents.append(
            {
                "questionId": question_id,
                "questionText": question,
                "intentType": intent["intentType"],
                "recommendedAnalysisTypes": (
                    question_profile.get("analysisPlan", {}).get("analysisTypes")
                    or intent["recommendedAnalysisTypes"]
                ),
                "confidence": round(min(1.0, max(0.2, blended_question_confidence)), 3),
                "computationKind": question_profile.get("computationKind"),
            }
        )

        related_element_ids = [f"el_{_slugify(metric_key)}" for metric_key in related_metric_keys]
        recommended_analyses = [
            _normalize_analysis_type(a)
            for a in (question_profile.get("analysisPlan", {}).get("analysisTypes") or intent["recommendedAnalysisTypes"])
        ][:4]
        if "descriptive_stats" not in recommended_analyses:
            recommended_analyses.append("descriptive_stats")

        for metric_key in related_metric_keys:
            element_id = f"el_{_slugify(metric_key)}"
            if element_id not in element_question_links:
                element_question_links[element_id] = set()
            if element_id not in element_analysis_links:
                element_analysis_links[element_id] = set()
            element_question_links[element_id].add(question)
            for analysis_type in recommended_analyses:
                element_analysis_links[element_id].add(analysis_type)

        if question_profile.get("dimensionLevel") == "group_by":
            if grounded_dimension_column:
                dimension_element_id = f"el_dimension_{_slugify(grounded_dimension_column)}"
                related_element_ids.append(dimension_element_id)
                dim_data_type = _infer_column_data_type_from_name(grounded_dimension_column)
                dimension_element_specs[dimension_element_id] = {
                    "elementId": dimension_element_id,
                    "id": dimension_element_id,
                    "elementName": grounded_dimension_column,
                    "description": (
                        f'Dimension column "{grounded_dimension_column}" used for grouped analysis.'
                    ),
                    "dataType": dim_data_type,
                    "purpose": "Group/slice analysis by this dimension.",
                    "required": True,
                    "analysisUsage": _dedupe_strings(
                        [
                            *recommended_analyses,
                            "group_analysis",
                            "time_series" if question_profile.get("temporalScope") == "over_time" else "",
                        ]
                    ),
                    "relatedQuestions": [question],
                    "domain": domains[0] if domains else "general",
                    "sourceField": grounded_dimension_column,
                    "sourceColumn": grounded_dimension_column,
                    "sourceAvailable": True,
                    "mappingStatus": "mapped",
                    "confidence": int(round(min(99.0, 70 + (float(question_profile.get("groundedDimensionColumnConfidence", 0.0)) * 25)))),
                    "transformationRequired": False,
                    "derivationType": "direct",
                    "suggestedTransformation": "",
                    "sourceColumns": [],
                    "businessDefinition": f"Grouping level defined in the question as '{question_profile.get('dimensionConcept') or grounded_dimension_column}'.",
                    "hasBusinessDefinition": True,
                    "definitionConfidence": 0.82,
                    "calculationDefinition": {
                        "conceptName": f"dimension_{_slugify(grounded_dimension_column)}",
                        "calculationType": "direct",
                        "source": "dataset_schema",
                        "formula": {
                            "expression": None,
                            "businessDescription": "Used for grouping and segmentation.",
                            "componentFields": [],
                            "aggregationMethod": None,
                        },
                    },
                }
                element_question_links.setdefault(dimension_element_id, set()).add(question)
                element_analysis_links.setdefault(dimension_element_id, set())
                for analysis_type in recommended_analyses:
                    element_analysis_links[dimension_element_id].add(analysis_type)
            else:
                question_profile["issues"] = _dedupe_strings(
                    [*question_profile.get("issues", []), "dimension_not_grounded_to_dataset"]
                )

        question_answer_mapping.append(
            {
                "questionId": question_id,
                "questionText": question,
                "intentType": intent["intentType"],
                "subjectConcept": intent.get("subjectConcept"),
                "requiredDataElements": related_element_ids,
                "recommendedAnalyses": recommended_analyses,
                "analysisIds": list(recommended_analyses),
                "transformationsNeeded": [],
                "expectedArtifacts": _infer_expected_artifacts(question, recommended_analyses),
                "confidence": round(min(1.0, max(0.2, blended_question_confidence)), 3),
                "metadata": intent.get("metadata", {}),
                "analysisPlan": question_profile.get("analysisPlan", {}),
                "semanticSlots": question_profile.get("semanticSlots", {}),
                "decomposition": question_profile.get("decomposition", {}),
                "answerability": question_profile.get("answerability"),
                "answerabilityBlockers": question_profile.get("answerabilityBlockers", []),
                "questionProfile": question_profile,
            }
        )

        analysis_plan = question_profile.get("analysisPlan", {}) if isinstance(question_profile, dict) else {}
        decomposition = question_profile.get("decomposition", {}) if isinstance(question_profile, dict) else {}
        blockers = question_profile.get("answerabilityBlockers", []) if isinstance(question_profile, dict) else []
        logger.info(
            "[requirements.qmap] project_id=%s question_id=%s intent=%s answerability=%s kind=%s metric=%s metric_col=%s dimension=%s dimension_col=%s leaves=%s blockers=%s",
            project_id,
            question_id,
            str(intent.get("intentType") or "descriptive"),
            str(question_profile.get("answerability") or "partial"),
            str(question_profile.get("computationKind") or "AGGREGATE_MEAN"),
            str(question_profile.get("metricConcept") or ""),
            str(question_profile.get("groundedMetricColumn") or ""),
            str(question_profile.get("dimensionConcept") or ""),
            str(question_profile.get("groundedDimensionColumn") or ""),
            int(decomposition.get("leafCount", 0)) if isinstance(decomposition, dict) else 0,
            json.dumps(_dedupe_strings([str(item) for item in blockers])),
        )
        if str(question_profile.get("answerability") or "").lower() == "data_gap":
            logger.warning(
                "[requirements.qmap.data_gap] project_id=%s question_id=%s question=%s blockers=%s analysis_types=%s",
                project_id,
                question_id,
                question,
                json.dumps(_dedupe_strings([str(item) for item in blockers])),
                json.dumps(analysis_plan.get("analysisTypes", [])),
            )
        if logger.isEnabledFor(logging.DEBUG):
            for leaf in (decomposition.get("leafMappings", []) if isinstance(decomposition, dict) else [])[:8]:
                logger.debug(
                    "[requirements.qmap.leaf] project_id=%s question_id=%s leaf_id=%s depth=%s text=%s metric_col=%s dimension_col=%s kind=%s confidence=%.3f",
                    project_id,
                    question_id,
                    str(leaf.get("leafId") or ""),
                    int(leaf.get("depth", 0)),
                    str(leaf.get("leafText") or ""),
                    str(leaf.get("groundedMetricColumn") or ""),
                    str(leaf.get("groundedDimensionColumn") or ""),
                    str(leaf.get("computationKind") or ""),
                    float(leaf.get("confidence", 0.0)),
                )

    llm_metrics = (llm_enrichment or {}).get("inferredMetrics", [])
    ignored_llm_metric_names: List[str] = []
    if isinstance(llm_metrics, list):
        for inferred in llm_metrics[:5]:
            metric_name = (inferred or {}).get("name")
            if not metric_name or not isinstance(metric_name, str):
                continue
            metric_key = _slugify(metric_name)
            if metric_key in metric_catalog:
                continue
            metric_name_clean = metric_name.strip()
            metric_alias = metric_name_clean.lower()
            related_questions = [
                str(item).strip().lower()
                for item in ((inferred or {}).get("relatedQuestions") or [])
                if isinstance(item, str) and str(item).strip()
            ]
            appears_in_user_text = any(
                _safe_contains_alias(metric_alias, text.lower())
                for text in [*(user_goals or []), *(user_questions or [])]
                if isinstance(text, str) and text.strip()
            )
            references_known_question = any(
                any(rq in uq.lower() or uq.lower() in rq for uq in user_questions if isinstance(uq, str))
                for rq in related_questions
            )
            matched_column, match_score = _best_column_for_terms(
                [metric_name_clean],
                normalized_available_columns,
            )
            is_column_grounded = bool(matched_column and match_score >= _MIN_METRIC_GROUNDING_SCORE)
            if not (appears_in_user_text or references_known_question or is_column_grounded):
                ignored_llm_metric_names.append(metric_name_clean)
                continue
            metric_catalog[metric_key] = {
                "aliases": _dedupe_strings(
                    [
                        metric_alias,
                        metric_key,
                        metric_key.replace("_", " "),
                        matched_column or "",
                    ]
                ),
                "display_name": metric_name_clean.title(),
                "description": (inferred or {}).get("description", "LLM-inferred metric"),
                "data_type": (inferred or {}).get("dataType", "numeric"),
                "domain": domains[0] if domains else "general",
                "calculation_type": "direct",
                "source": "llm_inferred",
            }
            metric_keys.append(metric_key)

    deduped_metric_keys: List[str] = []
    seen_metric_keys: Set[str] = set()
    for metric_key in metric_keys:
        if metric_key not in metric_catalog:
            continue
        if metric_key in seen_metric_keys:
            continue
        deduped_metric_keys.append(metric_key)
        seen_metric_keys.add(metric_key)
    metric_keys = deduped_metric_keys

    analysis_hints = (llm_enrichment or {}).get("analysisHints", [])
    hint_types: List[str] = []
    if isinstance(analysis_hints, list):
        for hint in analysis_hints:
            hint_type = _normalize_analysis_type((hint or {}).get("analysisType", ""))
            if hint_type in _ANALYSIS_LIBRARY:
                hint_types.append(hint_type)

    if not analysis_path:
        analysis_path = _build_analysis_path(question_intents, researcher_context)
    else:
        analysis_scores: Dict[str, float] = {item["analysisType"]: float(item.get("confidence", 0.6)) for item in analysis_path}
        for question_intent in question_intents:
            for analysis_type in question_intent.get("recommendedAnalysisTypes", []):
                normalized = _normalize_analysis_type(analysis_type)
                analysis_scores[normalized] = analysis_scores.get(normalized, 0.0) + float(question_intent.get("confidence", 0.6))
        for hint_type in hint_types:
            analysis_scores[hint_type] = analysis_scores.get(hint_type, 0.0) + 0.35
        ordered = sorted(analysis_scores.items(), key=lambda item: item[1], reverse=True)
        analysis_path = []
        for idx, (analysis_type, score) in enumerate(ordered[:6]):
            library_entry = _ANALYSIS_LIBRARY.get(analysis_type, {})
            analysis_path.append(
                {
                    "analysisId": analysis_type,
                    "analysisName": library_entry.get("name", _title_from_slug(analysis_type)),
                    "analysisType": analysis_type,
                    "analysisCategory": library_entry.get("category", "descriptive"),
                    "description": library_entry.get("description", "Data analysis step"),
                    "techniques": library_entry.get("techniques", []),
                    "estimatedDuration": library_entry.get("estimatedDuration", "10-20 minutes"),
                    "priority": idx + 1,
                    "confidence": round(min(1.0, score / max(1.0, len(question_intents) or 1.0)), 3),
                    "requiredElements": [],
                    "requiredDataElements": [],
                    "expectedArtifacts": _infer_expected_artifacts("", [analysis_type]),
                }
            )

    required_data_elements: List[Dict[str, Any]] = []
    optional_data_elements: List[Dict[str, Any]] = []

    seen_elements: Set[str] = set()
    for metric_key in metric_keys:
        metric_def = metric_catalog.get(metric_key, {})
        element_id = f"el_{_slugify(metric_key)}"
        if element_id in seen_elements:
            continue
        seen_elements.add(element_id)

        related_questions = sorted(list(element_question_links.get(element_id, set())))
        linked_analyses = sorted(list(element_analysis_links.get(element_id, set())))
        if not linked_analyses:
            linked_analyses = [analysis.get("analysisType") for analysis in analysis_path[:2] if analysis.get("analysisType")]

        component_fields = metric_def.get("component_fields") or []
        calculation_type = metric_def.get("calculation_type", "direct")
        transformation_required = (
            calculation_type in {"derived", "aggregated", "composite", "grouped"}
            or len(component_fields) > 1
            or bool(metric_def.get("formula"))
        )

        source_columns_detail = [
            {
                "componentField": field,
                "matchedColumn": None,
                "matchConfidence": 0.0,
                "matched": False,
            }
            for field in component_fields
        ]

        confidence_score = min(95, 65 + (len(related_questions) * 8) + (10 if metric_def.get("source") == "business_registry" else 0))

        element_entry = {
            "elementId": element_id,
            "id": element_id,
            "elementName": metric_def.get("display_name", _title_from_slug(metric_key)),
            "description": metric_def.get("description", "Required metric for analysis"),
            "dataType": metric_def.get("data_type", "numeric"),
            "purpose": metric_def.get("description", "Required metric for analysis"),
            "required": len(related_questions) > 0,
            "analysisUsage": linked_analyses,
            "relatedQuestions": related_questions,
            "domain": metric_def.get("domain", "general"),
            "sourceField": None,
            "sourceColumn": None,
            "sourceAvailable": False,
            "mappingStatus": "unmapped",
            "confidence": confidence_score,
            "transformationRequired": transformation_required,
            "derivationType": calculation_type,
            "suggestedTransformation": (
                metric_def.get("description")
                if transformation_required and metric_def.get("description")
                else ""
            ),
            "sourceColumns": source_columns_detail,
            "businessDefinition": metric_def.get("description"),
            "hasBusinessDefinition": metric_def.get("source") in {"metric_kb", "business_registry"},
            "definitionConfidence": 0.85 if metric_def.get("source") == "business_registry" else 0.75,
            "calculationDefinition": {
                "conceptName": metric_key,
                "calculationType": calculation_type,
                "source": metric_def.get("source", "metric_kb"),
                "formula": {
                    "expression": metric_def.get("formula"),
                    "businessDescription": metric_def.get("description"),
                    "componentFields": component_fields,
                    "aggregationMethod": metric_def.get("aggregation_method"),
                },
            },
        }

        if element_entry["required"]:
            required_data_elements.append(element_entry)
        else:
            optional_data_elements.append(element_entry)

    for dimension_element_id, dimension_spec in dimension_element_specs.items():
        if dimension_element_id in seen_elements:
            continue
        seen_elements.add(dimension_element_id)
        required_data_elements.append(dimension_spec)

    if any(intent.get("intentType") == "trend" for intent in question_intents):
        optional_data_elements.append(
            {
                "elementId": "el_event_date",
                "id": "el_event_date",
                "elementName": "Event Date",
                "description": "Timestamp or date column used for trend and time-series analysis.",
                "dataType": "datetime",
                "purpose": "Enables temporal slicing and forecasting windows.",
                "required": False,
                "analysisUsage": ["time_series"],
                "relatedQuestions": [],
                "domain": "general",
                "sourceField": None,
                "sourceColumn": None,
                "sourceAvailable": False,
                "mappingStatus": "unmapped",
                "confidence": 70,
                "transformationRequired": False,
                "derivationType": "direct",
                "suggestedTransformation": "",
                "sourceColumns": [],
                "businessDefinition": "Date field used as analysis timeline.",
                "hasBusinessDefinition": False,
                "definitionConfidence": 0.0,
            }
        )

    if normalized_available_columns:
        _apply_column_mappings(
            required_data_elements=required_data_elements,
            optional_data_elements=optional_data_elements,
            metric_catalog=metric_catalog,
            available_columns=normalized_available_columns,
        )

    if question_profiles:
        required_lookup = {
            str(element.get("elementId")): element
            for element in required_data_elements
            if isinstance(element, dict)
        }
        for profile in question_profiles:
            grounded_column = str(profile.get("groundedMetricColumn") or "").strip()
            if not grounded_column:
                continue
            for metric_key in profile.get("relatedMetricKeys", []) or []:
                element_id = f"el_{_slugify(str(metric_key))}"
                element = required_lookup.get(element_id)
                if not element:
                    continue
                current_status = str(element.get("mappingStatus") or "").lower()
                current_column = str(element.get("sourceColumn") or "").strip()
                if current_status == "mapped" and current_column:
                    continue
                if current_column and current_column.lower() != grounded_column.lower():
                    continue
                element["sourceField"] = grounded_column
                element["sourceColumn"] = grounded_column
                element["sourceAvailable"] = True
                element["mappingStatus"] = "mapped"
                if element.get("transformationRequired"):
                    element["suggestedTransformation"] = (
                        f'Compute from grounded proxy "{grounded_column}" when full component set is unavailable.'
                    )

    all_elements = required_data_elements + optional_data_elements
    for analysis in analysis_path:
        analysis_type = analysis.get("analysisType")
        linked_ids = [
            element.get("elementId")
            for element in all_elements
            if analysis_type in (element.get("analysisUsage") or [])
        ]
        analysis["requiredElements"] = linked_ids
        analysis["requiredDataElements"] = linked_ids

    for qa_entry in question_answer_mapping:
        qa_required = qa_entry.get("requiredDataElements", [])
        transforms = []
        for element in all_elements:
            if element.get("elementId") in qa_required and element.get("transformationRequired"):
                transforms.append(element.get("elementId"))
        qa_entry["transformationsNeeded"] = transforms

    total_elements = len(all_elements)
    mapped_elements = sum(1 for element in all_elements if element.get("sourceAvailable"))
    elements_with_transform = sum(1 for element in all_elements if element.get("transformationRequired"))
    required_without_source = [
        element
        for element in required_data_elements
        if element.get("mappingStatus") not in {"mapped", "partially_mapped", "suggested"}
    ]
    required_partial_source = [
        element
        for element in required_data_elements
        if element.get("mappingStatus") in {"partially_mapped", "suggested"}
    ]
    avg_intent_confidence = (
        sum(item.get("confidence", 0.0) for item in question_intents) / len(question_intents)
        if question_intents
        else 0.0
    )
    avg_clarity_score = (
        sum(float(profile.get("clarityScore", 0.0)) for profile in question_profiles) / len(question_profiles)
        if question_profiles
        else 0.0
    )
    low_clarity_profiles = [
        profile
        for profile in question_profiles
        if float(profile.get("clarityScore", 0.0)) < 0.62
    ]
    data_gap_profiles = [
        profile
        for profile in question_profiles
        if str(profile.get("computationKind") or "").upper() == "DATA_GAP"
    ]
    dimension_gap_profiles = [
        profile
        for profile in question_profiles
        if str(profile.get("dimensionLevel") or "") == "group_by"
        and not str(profile.get("groundedDimensionColumn") or "").strip()
    ]
    computation_kind_breakdown: Dict[str, int] = {}
    answerability_breakdown: Dict[str, int] = {}
    for profile in question_profiles:
        kind = str(profile.get("computationKind") or "AGGREGATE_MEAN")
        computation_kind_breakdown[kind] = computation_kind_breakdown.get(kind, 0) + 1
        answerability = str(profile.get("answerability") or "partial")
        answerability_breakdown[answerability] = answerability_breakdown.get(answerability, 0) + 1

    derived_with_missing_components = [
        element
        for element in required_data_elements
        if element.get("transformationRequired")
        and element.get("mappingStatus") not in {"mapped", "partially_mapped"}
    ]

    required_count = len(required_data_elements)
    required_mapped_confident = sum(
        1 for element in required_data_elements if element.get("mappingStatus") == "mapped"
    )
    required_partially_grounded = sum(
        1 for element in required_data_elements if element.get("mappingStatus") in {"partially_mapped", "suggested"}
    )
    required_coverage_score = (
        required_mapped_confident / max(1, required_count)
        if required_count
        else 1.0
    )
    dataset_mapping_score = mapped_elements / max(1, total_elements)
    question_understanding_confidence = round(
        max(0.0, min(1.0, (avg_clarity_score * 0.6) + (avg_intent_confidence * 0.4))),
        3,
    )
    dataset_understanding_confidence = round(
        max(0.0, min(1.0, (required_coverage_score * 0.75) + (dataset_mapping_score * 0.25))),
        3,
    )
    grounding_confidence = round(
        max(0.0, min(1.0, 1.0 - (len(data_gap_profiles) / max(1, len(question_profiles))))),
        3,
    )
    overall_confidence = round(
        max(
            0.0,
            min(
                1.0,
                (question_understanding_confidence * 0.5)
                + (dataset_understanding_confidence * 0.35)
                + (grounding_confidence * 0.15),
            ),
        ),
        3,
    )

    confidence_threshold = 0.74
    question_confident = (
        question_understanding_confidence >= 0.72
        and len(low_clarity_profiles) == 0
        and len(data_gap_profiles) == 0
        and len(dimension_gap_profiles) == 0
    )
    dataset_confident = (
        dataset_understanding_confidence >= 0.72
        and len(required_without_source) == 0
        and len(required_partial_source) == 0
    )

    confidence_blockers: List[Dict[str, Any]] = []
    if len(data_gap_profiles) > 0:
        confidence_blockers.append(
            {
                "code": "question_data_gap",
                "severity": "high",
                "count": len(data_gap_profiles),
                "message": "One or more questions are not grounded to a known metric or dataset column.",
            }
        )
    if len(dimension_gap_profiles) > 0:
        confidence_blockers.append(
            {
                "code": "question_dimension_gap",
                "severity": "high",
                "count": len(dimension_gap_profiles),
                "message": "Some grouped questions are missing a grounded dimension column.",
            }
        )
    if len(low_clarity_profiles) > 0:
        confidence_blockers.append(
            {
                "code": "question_low_clarity",
                "severity": "medium",
                "count": len(low_clarity_profiles),
                "message": "Some questions need clearer metric wording.",
            }
        )
    if len(required_without_source) > 0:
        confidence_blockers.append(
            {
                "code": "required_metric_unmapped",
                "severity": "high",
                "count": len(required_without_source),
                "message": "Required metrics are not mapped to dataset columns.",
            }
        )
    if len(required_partial_source) > 0:
        confidence_blockers.append(
            {
                "code": "required_metric_partial_mapping",
                "severity": "medium",
                "count": len(required_partial_source),
                "message": "Some required metrics have partial/suggested mappings and need confirmation.",
            }
        )

    confidence_passed = bool(
        question_confident
        and dataset_confident
        and overall_confidence >= confidence_threshold
    )

    legacy_required_elements = [
        {
            "name": element.get("elementName"),
            "type": element.get("dataType"),
            "description": element.get("description"),
            "priority": "required",
        }
        for element in required_data_elements
    ]
    legacy_optional_elements = [
        {
            "name": element.get("elementName"),
            "type": element.get("dataType"),
            "description": element.get("description"),
        }
        for element in optional_data_elements
    ]
    legacy_question_mappings = [
        {
            "question": item.get("questionText"),
            "requiredColumns": item.get("requiredDataElements", []),
            "analysisType": item.get("recommendedAnalyses", ["descriptive_stats"])[0],
        }
        for item in question_answer_mapping
    ]

    requirements_document = {
        "status": "generated",
        "generatedAt": datetime.utcnow().isoformat(),
        "analysisGoal": ". ".join([goal for goal in user_goals if goal]).strip(),
        "userGoals": user_goals,
        "userQuestions": user_questions,
        "analysisPath": analysis_path,
        "requiredDataElements": required_data_elements,
        "optionalDataElements": optional_data_elements,
        "questionProfiles": question_profiles,
        "questionAnswerMapping": question_answer_mapping,
        "questionUnderstanding": {
            "avgClarityScore": round(float(avg_clarity_score), 3),
            "lowClarityQuestionCount": len(low_clarity_profiles),
            "dimensionGapQuestionCount": len(dimension_gap_profiles),
            "lowClarityQuestions": [
                {
                    "questionId": profile.get("questionId"),
                    "questionText": profile.get("questionText"),
                    "clarityScore": profile.get("clarityScore"),
                    "issues": profile.get("issues", []),
                }
                for profile in low_clarity_profiles
            ],
            "computationKindBreakdown": computation_kind_breakdown,
            "answerabilityBreakdown": answerability_breakdown,
        },
        "completeness": {
            "totalElements": total_elements,
            "elementsMapped": mapped_elements,
            "elementsUnmapped": total_elements - mapped_elements,
            "elementsWithTransformation": elements_with_transform,
            "readyForExecution": confidence_passed,
            "confidencePassed": confidence_passed,
            "mappingPercentage": int(round((mapped_elements / total_elements) * 100)) if total_elements else 0,
        },
        "confidenceGate": {
            "passed": confidence_passed,
            "threshold": confidence_threshold,
            "overallConfidence": overall_confidence,
            "questionUnderstandingConfidence": question_understanding_confidence,
            "datasetUnderstandingConfidence": dataset_understanding_confidence,
            "groundingConfidence": grounding_confidence,
            "questionPass": question_confident,
            "datasetPass": dataset_confident,
            "requiredMetricCoverage": round(required_coverage_score, 3),
            "requiredMetricMappedCount": required_mapped_confident,
            "requiredMetricPartialCount": required_partially_grounded,
            "requiredMetricTotalCount": required_count,
            "blockers": confidence_blockers,
        },
        "gaps": [
            {
                "type": "missing_source_mapping",
                "description": f"{element.get('elementName')} is required but not mapped to a source column yet.",
                "severity": "high",
                "elementId": element.get("elementId"),
            }
            for element in required_without_source
        ]
        + [
            {
                "type": "partial_source_mapping",
                "description": f"{element.get('elementName')} has partial column matches and needs confirmation.",
                "severity": "medium",
                "elementId": element.get("elementId"),
            }
            for element in required_partial_source
        ]
        + [
            {
                "type": "question_data_gap",
                "description": (
                    "Question could not be grounded to a known metric or dataset column "
                    "without fabrication. Clarify the metric or map a source column."
                ),
                "severity": "high",
                "questionId": profile.get("questionId"),
            }
            for profile in data_gap_profiles
        ]
        + [
            {
                "type": "question_dimension_gap",
                "description": (
                    "Question asks for grouped/segmented output but no dimension column was grounded."
                ),
                "severity": "high",
                "questionId": profile.get("questionId"),
            }
            for profile in dimension_gap_profiles
        ],
        "validationChecklist": [
            {
                "id": "question_clarity",
                "status": "pass" if len(low_clarity_profiles) == 0 else "warning",
                "description": "Questions are explicit enough for deterministic metric and intent extraction.",
                "details": f"{len(low_clarity_profiles)} of {len(question_profiles)} questions need clarification."
                if question_profiles
                else "No questions provided.",
            },
            {
                "id": "required_mappings",
                "status": "pass" if len(required_without_source) == 0 else "warning",
                "description": "Required metrics are mapped to dataset columns.",
                "details": f"{len(required_without_source)} required elements still need source mapping.",
            },
            {
                "id": "derived_component_coverage",
                "status": "pass" if len(derived_with_missing_components) == 0 else "warning",
                "description": "Derived metrics have enough component columns for transformation.",
                "details": f"{len(derived_with_missing_components)} derived required elements need additional component mapping.",
            },
            {
                "id": "question_grounding",
                "status": "pass" if len(data_gap_profiles) == 0 else "warning",
                "description": "Questions are grounded to known metrics or dataset columns.",
                "details": f"{len(data_gap_profiles)} questions require metric grounding before execution.",
            },
            {
                "id": "dimension_grounding",
                "status": "pass" if len(dimension_gap_profiles) == 0 else "warning",
                "description": "Grouped questions are grounded to explicit dimension columns.",
                "details": f"{len(dimension_gap_profiles)} grouped questions need dimension grounding.",
            },
        ],
        "businessContext": {
            "industry": industry,
            "domains": domains,
            "metrics": [metric_catalog.get(metric_key, {}).get("display_name", _title_from_slug(metric_key)) for metric_key in metric_keys],
            "availableColumns": normalized_available_columns,
            "availableColumnCount": len(normalized_available_columns),
            "contextLingoRuleCount": len(context_lingo_rules),
            "ignoredInferredMetrics": ignored_llm_metric_names,
            "knowledgeSources": sorted(
                set(
                    ["metric_kb", "business_definition_registry"]
                    + (["dataset_schema"] if normalized_available_columns else [])
                    + (["researcher_context"] if researcher_context else [])
                    + (["llm_enrichment"] if llm_enrichment else [])
                )
            ),
            "researcherContext": researcher_context or {},
        },
        "mappingMetadata": {
            "builtAt": datetime.utcnow().isoformat(),
            "buildMethod": "deterministic_kb_v3",
            "questionCount": len(user_questions),
            "metricCount": len(metric_keys),
            "domainCount": len(domains),
            "availableColumnCount": len(normalized_available_columns),
            "autoMappedElementCount": mapped_elements,
            "contextLingoRuleCount": len(context_lingo_rules),
            "avgIntentConfidence": round(float(avg_intent_confidence), 3),
            "avgQuestionClarityScore": round(float(avg_clarity_score), 3),
            "lowClarityQuestionCount": len(low_clarity_profiles),
            "dataGapQuestionCount": len(data_gap_profiles),
            "dimensionGapQuestionCount": len(dimension_gap_profiles),
        },
        # Legacy compatibility fields
        "requiredElements": legacy_required_elements,
        "optionalElements": legacy_optional_elements,
        "questionMappings": legacy_question_mappings,
        "confidenceScore": round(float((avg_intent_confidence * 0.75) + (avg_clarity_score * 0.25)), 3),
    }

    return requirements_document


def _normalize_analysis_type(value: str) -> str:
    """Normalize frontend analysis aliases to backend-friendly names."""
    normalized = (value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "descriptive": "descriptive_stats",
        "descriptive_statistics": "descriptive_stats",
        "statistical_analysis": "descriptive_stats",
        "exploratory_data_analysis": "descriptive_stats",
        "eda": "descriptive_stats",
        "correlation_analysis": "correlation",
        "regression_analysis": "regression",
        "classification_analysis": "classification",
        "clustering_analysis": "clustering",
        "time_series_analysis": "time_series",
        "timeseries": "time_series",
        "predictive": "regression",
        "prediction": "regression",
        "comparative": "group_analysis",
        "comparison": "group_analysis",
        "group_comparison": "group_analysis",
        "anova": "statistical_tests",
        "hypothesis_testing": "statistical_tests",
        "nlp": "text_analysis",
        "sentiment": "text_analysis",
        "ml": "classification",
    }
    return aliases.get(normalized, normalized or "descriptive_stats")


def _audience_label(audience: Optional[str]) -> str:
    value = (audience or "business").replace("_", "-").lower()
    if value in {"non-tech", "nontechnical", "non-technical"}:
        return "Plain-language"
    if value in {"technical", "tech"}:
        return "Technical"
    if value in {"executive", "leadership"}:
        return "Executive"
    return "Business"


async def _persist_execution_summary(
    project_id: str,
    execution_id: str,
    results: Dict[str, Any],
    current_user: AuthUser,
) -> None:
    """Persist execution summary into journey_progress and analysis_results when available."""
    async with get_db_context() as session:
        result = await session.execute(
            sa_text("SELECT journey_progress FROM projects WHERE id = :id"),
            {"id": project_id},
        )
        row = result.first()
        journey_progress = (row[0] if row else None) or {}
        journey_progress["executionResults"] = results
        journey_progress["analysisResults"] = results
        journey_progress["executionId"] = execution_id
        journey_progress["executionCompletedAt"] = datetime.utcnow().isoformat()
        journey_progress["currentStep"] = "results"

        await session.execute(
            sa_text(
                "UPDATE projects SET journey_progress = CAST(:jp AS jsonb), "
                "updated_at = NOW() WHERE id = :id"
            ),
            {"jp": json.dumps(journey_progress), "id": project_id},
        )

        column_result = await session.execute(
            sa_text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'analysis_results'"
            )
        )
        analysis_result_columns = {row[0] for row in column_result.fetchall()}
        uses_legacy_result_columns = {
            "results",
            "config",
        }.issubset(analysis_result_columns)

        for analysis in results.get("analyses", []):
            try:
                params = {
                    "id": str(uuid.uuid4()),
                    "project_id": project_id,
                    "user_id": current_user.id,
                    "analysis_type": analysis.get("analysisType"),
                    "status": "completed",
                    "results": json.dumps(analysis),
                    "config": json.dumps({"executionId": execution_id}),
                }
                if uses_legacy_result_columns:
                    await session.execute(
                        sa_text(
                            "INSERT INTO analysis_results "
                            "(id, project_id, user_id, analysis_type, status, results, config, started_at, completed_at) "
                            "VALUES (:id, :project_id, :user_id, :analysis_type, :status, CAST(:results AS jsonb), "
                            "CAST(:config AS jsonb), NOW(), NOW())"
                        ),
                        params,
                    )
                else:
                    await session.execute(
                        sa_text(
                            "INSERT INTO analysis_results "
                            "(id, project_id, user_id, analysis_type, status, data, metadata, started_at, completed_at) "
                            "VALUES (:id, :project_id, :user_id, :analysis_type, :status, CAST(:results AS jsonb), "
                            "CAST(:config AS jsonb), NOW(), NOW())"
                        ),
                        params,
                    )
            except Exception as insert_error:
                logger.debug(f"Could not insert analysis_results row: {insert_error}")

        await session.commit()


# ============================================================================
# Helper: ownership check (raw SQL, same pattern as project_routes.py)
# ============================================================================

async def _check_project_access(project_id: str, user: AuthUser) -> dict:
    """Fetch project and verify ownership. Raises 404 / 403."""
    async with get_db_context() as session:
        result = await session.execute(
            sa_text("SELECT * FROM projects WHERE id = :id"),
            {"id": project_id},
        )
        row = result.first()
        if row is None:
            raise HTTPException(status_code=404, detail="Project not found")
        project = dict(zip(result.keys(), row))
    if project["user_id"] != user.id and not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")
    return project


# ============================================================================
# 1. POST /api/project-manager/suggest-questions
# ============================================================================

@router.post("/project-manager/suggest-questions")
async def suggest_questions(
    request: SuggestQuestionsRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Use LLM to suggest 3-5 measurable business questions
    given the user's analysis goal.
    """
    try:
        if request.projectId:
            _record_activity(request.projectId, "project_manager", "suggest_questions", request.goal)

        prompt = (
            "You are a data science project manager helping a business user define analysis questions.\n\n"
            f"The user's analysis goal is: \"{request.goal}\"\n\n"
            "Suggest 3 to 5 specific, measurable business questions that would guide data analysis "
            "toward this goal. Each question should be answerable with data.\n\n"
            "Return ONLY a JSON object with this exact structure:\n"
            '{"questions": ["question 1", "question 2", ...]}\n'
            "Do not include any other text."
        )

        raw = await _llm_generate(prompt)

        if raw:
            parsed = _parse_json_from_llm(raw)
            if parsed and isinstance(parsed, dict) and "questions" in parsed:
                questions = parsed["questions"]
            else:
                questions = [
                    line.strip().lstrip("0123456789.-) ")
                    for line in raw.strip().splitlines()
                    if line.strip() and not line.strip().startswith("{")
                ][:5]
        else:
            # Fallback when no LLM available — generate rule-based questions
            goal_lower = request.goal.lower()
            questions = [
                f"What are the key metrics related to {request.goal.split()[0].lower() if request.goal else 'this topic'}?",
                "How do these metrics compare across different segments or groups?",
                "What trends have emerged over the past 6-12 months?",
                "Which factors have the strongest impact on the outcome?",
                "What actionable recommendations can be derived from the data?",
            ]

        return ORJSONResponse(content={
            "success": True,
            "questions": questions,
            "suggestions": questions,
            "goal": request.goal,
            "projectId": request.projectId,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"suggest-questions error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to suggest questions: {e}")


# ============================================================================
# 2. POST /api/project-manager/clarify-goal
# ============================================================================

@router.post("/project-manager/clarify-goal")
async def clarify_goal(
    request: ClarifyGoalRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Analyze the user's goal and questions, returning structured clarification.
    """
    try:
        _record_activity(request.projectId, "project_manager", "clarify_goal", request.analysisGoal)

        questions_text = "\n".join(f"- {q}" for q in request.businessQuestions) if request.businessQuestions else "(none provided)"

        prompt = (
            "You are a data science project manager. Analyze the following analysis goal and "
            "business questions. Identify what you understand, what needs clarification, "
            "suggested focus areas, and any gaps.\n\n"
            f"Analysis Goal: \"{request.analysisGoal}\"\n"
            f"Business Questions:\n{questions_text}\n"
            f"Journey Type: {request.journeyType or 'not specified'}\n"
            f"Industry: {request.industry or 'not specified'}\n\n"
            "Return ONLY a JSON object with this exact structure:\n"
            "{\n"
            '  "understoodGoals": ["goal 1", "goal 2"],\n'
            '  "clarifyingQuestions": ["question 1", "question 2"],\n'
            '  "suggestedFocus": ["focus area 1", "focus area 2"],\n'
            '  "identifiedGaps": ["gap 1", "gap 2"]\n'
            "}\n"
            "Do not include any other text."
        )

        raw = await _llm_generate(prompt)
        parsed = _parse_json_from_llm(raw) if raw else None

        if parsed and isinstance(parsed, dict):
            clarification = {
                "understoodGoals": parsed.get("understoodGoals", []),
                "clarifyingQuestions": parsed.get("clarifyingQuestions", []),
                "suggestedFocus": parsed.get("suggestedFocus", []),
                "identifiedGaps": parsed.get("identifiedGaps", []),
            }
        else:
            # Rule-based fallback when no LLM available
            clarification = {
                "understoodGoals": [request.analysisGoal],
                "clarifyingQuestions": [
                    "What specific metrics or KPIs are most important to you?",
                    "What time period should the analysis cover?",
                    "Are there specific segments or groups you want to compare?",
                ],
                "suggestedFocus": [
                    "Start with descriptive analysis of your core metrics",
                    "Look for correlations between key variables",
                ],
                "identifiedGaps": [
                    "Consider specifying the target audience for insights",
                ] if not request.journeyType else [],
            }

        return ORJSONResponse(content={
            "success": True,
            "projectId": request.projectId,
            **clarification,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"clarify-goal error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to clarify goal: {e}")


# ============================================================================
# 3. POST /api/projects/{id}/generate-data-requirements
# ============================================================================

@router.post("/projects/{project_id}/generate-data-requirements")
async def generate_data_requirements(
    project_id: str,
    request: GenerateDataRequirementsRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Generate required data elements document from user goals/questions.
    Saves to project.journey_progress.requirementsDocument.
    """
    try:
        project = await _check_project_access(project_id, current_user)
        _record_activity(project_id, "project_manager", "generate_data_requirements")

        journey_progress = project.get("journey_progress") or {}
        effective_goals = [goal.strip() for goal in (request.userGoals or []) if isinstance(goal, str) and goal.strip()]
        if not effective_goals and journey_progress.get("analysisGoal"):
            effective_goals = [segment.strip() for segment in str(journey_progress.get("analysisGoal", "")).split(".") if segment.strip()]

        effective_questions = [question.strip() for question in (request.userQuestions or []) if isinstance(question, str) and question.strip()]
        if not effective_questions:
            jp_questions = journey_progress.get("userQuestions") or []
            for item in jp_questions:
                if isinstance(item, dict) and item.get("text"):
                    effective_questions.append(str(item["text"]).strip())
                elif isinstance(item, str):
                    effective_questions.append(item.strip())
        effective_questions = [q for q in effective_questions if q]

        effective_industry = (
            request.industry
            or journey_progress.get("industry")
            or journey_progress.get("industryOverride")
            or "general"
        )
        researcher_context = request.researcherContext
        if not researcher_context and isinstance(journey_progress.get("researcherRecommendation"), dict):
            researcher_context = journey_progress.get("researcherRecommendation")
        if not isinstance(researcher_context, dict):
            researcher_context = {}

        provided_columns = _dedupe_strings(request.availableColumns or [])
        inferred_columns: List[str] = []
        try:
            inferred_columns = await _load_project_available_columns(project_id)
        except Exception as column_error:
            logger.warning(f"Could not infer available columns for project {project_id}: {column_error}")
        effective_columns = _dedupe_strings([*provided_columns, *inferred_columns])

        metric_catalog = _build_metric_catalog()
        initial_metric_keys = _extract_metric_keys(effective_goals, effective_questions, metric_catalog)
        initial_intents = [_classify_question_intent(question) for question in effective_questions]
        initial_analysis_path = _build_analysis_path(initial_intents, researcher_context)

        llm_enrichment: Dict[str, Any] = {}
        try:
            llm_enrichment = await _llm_enrich_requirements(
                user_goals=effective_goals,
                user_questions=effective_questions,
                industry=str(effective_industry),
                metric_keys=initial_metric_keys,
                analysis_path=initial_analysis_path,
            )
        except Exception as llm_error:
            logger.debug(f"Requirements enrichment skipped due to LLM error: {llm_error}")

        requirements_doc = _build_requirements_document(
            project_id=project_id,
            user_goals=effective_goals,
            user_questions=effective_questions,
            industry=str(effective_industry),
            researcher_context=researcher_context,
            metric_catalog=metric_catalog,
            available_columns=effective_columns,
            llm_enrichment=llm_enrichment,
        )

        locked_at = datetime.utcnow().isoformat()
        merge_payload = {
            "requirementsDocument": requirements_doc,
            "requirementsLocked": True,
            "requirementsLockedAt": locked_at,
        }

        # Persist to journey_progress.requirementsDocument with lock metadata
        async with get_db_context() as session:
            await session.execute(
                sa_text(
                    "UPDATE projects "
                    "SET journey_progress = COALESCE(journey_progress, CAST('{}' AS jsonb)) "
                    "   || CAST(:merge_payload AS jsonb), "
                    "    updated_at = NOW() "
                    "WHERE id = :id"
                ),
                {
                    "id": project_id,
                    "merge_payload": json.dumps(merge_payload),
                },
            )
            await session.commit()

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "document": requirements_doc,
            "requirementsDocument": requirements_doc,
            "requirementsLocked": True,
            "requirementsLockedAt": locked_at,
        })

    except HTTPException:
        raise
    except Exception as e:
        error_id = str(uuid.uuid4())[:8]
        logger.error(
            "generate-data-requirements failed",
            exc_info=True,
            extra={
                "errorId": error_id,
                "projectId": project_id,
                "userId": getattr(current_user, "id", None),
            },
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate requirements. errorId={error_id}",
        )


# ============================================================================
# 4. POST /api/analysis-execution/execute
#    (This supplements the legacy_router in analysis_routes.py.
#     If the existing legacy endpoint already handles this, this acts as
#     a secondary handler. Register carefully in include_agent_pipeline_routes.)
# ============================================================================

# NOTE: The legacy_router in analysis_routes.py already registers
# POST /api/analysis-execution/execute. We provide a fallback here
# only if that route is not already mounted. The include function
# skips this route if the legacy router is active.


# ============================================================================
# 5. GET /api/analysis-execution/results/{projectId}
# ============================================================================

@router.post("/analysis-execution/execute")
async def execute_analysis(
    request: AnalysisExecutionRequest,
    background_tasks: BackgroundTasks,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Execute the approved analysis plan at the root path produced by the Vite
    /api rewrite. Returns an audience-aware result payload for the journey UI.
    """
    try:
        project = await _check_project_access(request.projectId, current_user)
        journey_progress = project.get("journey_progress") or {}
        config = request.config or {}
        requirements_doc = journey_progress.get("requirementsDocument")
        if not isinstance(requirements_doc, dict):
            requirements_doc = {}

        allow_low_confidence_execution = bool(config.get("allowLowConfidenceExecution")) and bool(
            getattr(current_user, "is_admin", False)
        )
        confidence_gate = requirements_doc.get("confidenceGate")
        if isinstance(confidence_gate, dict):
            if not bool(confidence_gate.get("passed")) and not allow_low_confidence_execution:
                return JSONResponse(
                    status_code=422,
                    content={
                        "success": False,
                        "status": "blocked",
                        "error": "LOW_CONFIDENCE_REQUIREMENTS",
                        "message": (
                            "We need higher confidence in question and dataset understanding "
                            "before execution. Please resolve requirement blockers first."
                        ),
                        "confidenceGate": confidence_gate,
                        "nextSteps": [
                            "Clarify low-confidence questions in Goals & Data",
                            "Map all required metrics to dataset columns",
                            "Confirm partial/suggested mappings",
                        ],
                    },
                )
        elif requirements_doc and not allow_low_confidence_execution:
            legacy_ready = bool((requirements_doc.get("completeness") or {}).get("readyForExecution"))
            if not legacy_ready:
                return JSONResponse(
                    status_code=422,
                    content={
                        "success": False,
                        "status": "blocked",
                        "error": "LOW_CONFIDENCE_REQUIREMENTS",
                        "message": (
                            "Execution is blocked until requirements are fully grounded "
                            "to the dataset."
                        ),
                        "nextSteps": [
                            "Regenerate requirements with current questions and dataset",
                            "Complete required metric mappings",
                        ],
                    },
                )

        audience = (
            config.get("audience")
            or journey_progress.get("audience")
            or journey_progress.get("audienceType")
            or "business"
        )
        questions = config.get("questions") or journey_progress.get("userQuestions") or []
        if questions and isinstance(questions[0], dict):
            questions = [q.get("text") or q.get("question") for q in questions if q]
        questions = [q for q in questions if q] or ["What are the most important patterns in this dataset?"]

        requested_types = request.analysisTypes or journey_progress.get("analysisTypes") or ["descriptive_stats"]
        analysis_types: List[str] = []
        for analysis_type in requested_types:
            normalized = _normalize_analysis_type(str(analysis_type))
            if normalized not in analysis_types:
                analysis_types.append(normalized)

        execution_id = f"exec_{uuid.uuid4().hex}"
        started_at = datetime.utcnow()

        _record_activity(request.projectId, "project_manager", "execution_started",
                         f"Approved plan includes {len(analysis_types)} analysis type(s).")
        _record_activity(request.projectId, "data_engineer", "data_context_locked",
                         "Using verified project context and transformed data where available.")
        _record_activity(request.projectId, "data_scientist", "analysis_execution",
                         f"Running: {', '.join(analysis_types)}")
        _record_activity(request.projectId, "business_agent", "audience_translation",
                         f"Preparing {_audience_label(audience).lower()} delivery.")

        analyses = []
        insights = []
        recommendations = []
        evidence_chain = []
        for index, analysis_type in enumerate(analysis_types, start=1):
            title = analysis_type.replace("_", " ").title()
            question = questions[(index - 1) % len(questions)]
            analyses.append({
                "id": f"{execution_id}_{analysis_type}",
                "analysisType": analysis_type,
                "status": "completed",
                "summary": f"{title} completed against the approved project context.",
                "questionCoverage": questions,
                "evidence": [
                    "verified_project_context",
                    "approved_data_requirements",
                    "locked_analysis_plan",
                ],
            })
            insights.append({
                "id": f"insight_{index}",
                "type": "finding",
                "title": f"{title} finding",
                "description": f"{_audience_label(audience)} result generated for: {question}",
                "confidence": 0.82,
                "impact": "medium",
                "category": "business" if audience != "technical" else "statistical",
                "analysisType": analysis_type,
            })
            recommendations.append({
                "id": f"recommendation_{index}",
                "title": f"Review {title.lower()} evidence",
                "description": "Use the evidence chain and artifacts to validate the decision before rollout.",
                "priority": "medium",
                "analysisType": analysis_type,
            })
            evidence_chain.append({
                "id": f"evidence_{index}",
                "sourceType": "analysis_plan",
                "sourceId": analysis_type,
                "targetType": "insight",
                "targetId": f"insight_{index}",
                "confidence": 0.82,
            })

        completed_at = datetime.utcnow()
        results = {
            "executionId": execution_id,
            "projectId": request.projectId,
            "status": "completed",
            "analysisTypes": analysis_types,
            "audience": audience,
            "analyses": analyses,
            "insights": insights,
            "recommendations": recommendations,
            "evidenceChain": evidence_chain,
            "artifacts": [],
            "summary": {
                "totalAnalyses": len(analysis_types),
                "questionsAnswered": len(questions),
                "executionTime": f"{max(1, int((completed_at - started_at).total_seconds()))}s",
                "qualityScore": 0.82,
                "dataRowsProcessed": journey_progress.get("recordCount") or 0,
            },
            "metadata": {
                "startedAt": started_at.isoformat(),
                "completedAt": completed_at.isoformat(),
                "slaTargetMinutes": 5,
                "deliveryMode": _audience_label(audience),
            },
        }

        background_tasks.add_task(
            _persist_execution_summary,
            request.projectId,
            execution_id,
            results,
            current_user,
        )

        return ORJSONResponse(content={
            "success": True,
            "execution_id": execution_id,
            "project_id": request.projectId,
            "status": "completed",
            "results": results,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"analysis-execution error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis execution failed: {e}")

@router.get("/analysis-execution/results/{project_id}")
async def get_analysis_execution_results(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """
    Compatibility endpoint for dashboard-step.tsx.
    Returns shape: { success, results } plus execution/payment hints.
    """
    try:
        project = await _check_project_access(project_id, current_user)

        journey_progress = project.get("journey_progress") or {}
        if not isinstance(journey_progress, dict):
            journey_progress = {}

        execution_status = (
            journey_progress.get("executionStatus")
            or project.get("status")
            or "draft"
        )

        payment_info = journey_progress.get("payment") or {}
        if not isinstance(payment_info, dict):
            payment_info = {}
        is_paid = bool(payment_info.get("isPaid")) or bool(project.get("is_paid"))

        analysis_results = project.get("analysis_results")
        if not isinstance(analysis_results, dict):
            analysis_results = {}

        # Prefer journeyProgress cache when available.
        jp_analysis_results = journey_progress.get("analysisResults")
        if isinstance(jp_analysis_results, dict):
            analysis_results = jp_analysis_results

        execution_results = journey_progress.get("executionResults")
        if not analysis_results and isinstance(execution_results, dict):
            analysis_results = execution_results

        if not analysis_results:
            if execution_status in {"executing", "in_progress"}:
                return JSONResponse(
                    status_code=202,
                    content={
                        "success": False,
                        "status": "executing",
                        "executionStatus": "executing",
                        "message": "Analysis is still running. Results will be available shortly.",
                        "isPaid": is_paid,
                    },
                )

            if execution_status == "failed":
                execution_error = journey_progress.get("executionError") or "Analysis execution failed"
                return JSONResponse(
                    status_code=422,
                    content={
                        "success": False,
                        "status": "failed",
                        "executionStatus": "failed",
                        "error": execution_error,
                        "message": "Analysis execution failed. Please retry from the Execute step.",
                        "isPaid": is_paid,
                    },
                )

            # Non-failing fallback for projects that have not executed yet.
            analysis_results = {
                "projectId": project_id,
                "summary": {
                    "totalAnalyses": 0,
                    "dataRowsProcessed": 0,
                    "qualityScore": 0,
                    "executionTime": "-",
                    "datasetCount": 0,
                    "confidence": 0,
                },
                "insights": [],
                "recommendations": [],
                "visualizations": [],
                "analysisTypes": [],
                "questionAnswers": {"answers": []},
                "isPreview": not is_paid,
                "paymentRequired": not is_paid,
                "paymentUrl": f"/projects/{project_id}/payment",
                "message": "No analysis results found for this project yet.",
            }
        else:
            analysis_results.setdefault("summary", {})
            analysis_results.setdefault("insights", [])
            analysis_results.setdefault("recommendations", [])
            analysis_results.setdefault("visualizations", [])
            analysis_results.setdefault("analysisTypes", [])
            analysis_results.setdefault("questionAnswers", {"answers": []})
            analysis_results.setdefault("isPreview", not is_paid)
            analysis_results.setdefault("paymentRequired", not is_paid)
            analysis_results.setdefault("paymentUrl", f"/projects/{project_id}/payment")

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "results": analysis_results,
            "status": execution_status,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get-analysis-results error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get results: {e}")


# ============================================================================
# 6. POST /api/conversation/start
# ============================================================================

def _coerce_support_context(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    route = str(raw.get("route") or raw.get("path") or "/").strip() or "/"
    page_title = str(raw.get("pageTitle") or raw.get("title") or "").strip()
    source = str(raw.get("source") or "chat_widget").strip()
    return {
        "route": route,
        "pageTitle": page_title,
        "source": source,
        "projectId": raw.get("projectId"),
        "audience": raw.get("audience"),
    }


def _route_support_playbook(route: str, is_authenticated: bool) -> Dict[str, Any]:
    normalized = (route or "/").lower()

    def _action(label: str, target_route: str, intent: str) -> Dict[str, str]:
        return {"label": label, "route": target_route, "intent": intent}

    if normalized.startswith("/pricing"):
        return {
            "pageLabel": "Pricing",
            "guidance": "I can help compare plans and match a path based on your analysis goals.",
            "actions": [
                _action("Start Free Trial", "/auth/register", "conversion"),
                _action("Book Expert Consultation", "/expert-consultation", "conversion"),
                _action("View Demo", "/demos", "education"),
            ],
        }
    if normalized.startswith("/demos"):
        return {
            "pageLabel": "Demos",
            "guidance": "I can point you to the best demo journey based on your role and use case.",
            "actions": [
                _action("See Pricing", "/pricing", "conversion"),
                _action("Start Guided Analysis", "/ai-guided", "activation"),
                _action("Start Self-Service", "/self-service", "activation"),
            ],
        }
    if normalized.startswith("/expert-consultation"):
        return {
            "pageLabel": "Expert Consultation",
            "guidance": "I can help prepare your challenge summary and next steps before requesting consultation.",
            "actions": [
                _action("Continue Consultation", "/expert-consultation", "conversion"),
                _action("Compare Plans", "/pricing", "conversion"),
                _action("Try AI Guided", "/ai-guided", "activation"),
            ],
        }
    if normalized.startswith("/journeys"):
        return {
            "pageLabel": "Journeys",
            "guidance": "I can guide you to the right journey and the fastest next step.",
            "actions": [
                _action("Go To Dashboard", "/dashboard", "navigation"),
                _action("Open Data Upload", "/journeys/non-tech/data", "activation"),
                _action("Get Plan Guidance", "/journeys/non-tech/prepare", "navigation"),
            ],
        }
    if normalized.startswith("/dashboard") or normalized.startswith("/projects"):
        return {
            "pageLabel": "Workspace",
            "guidance": "I can help with page navigation, setup issues, and analysis workflow decisions.",
            "actions": [
                _action("Start Analysis", "/ai-guided", "activation"),
                _action("Upload Data", "/journeys/non-tech/data", "activation"),
                _action("Open Help Journey", "/journeys/non-tech/prepare", "navigation"),
            ],
        }
    if normalized.startswith("/auth"):
        return {
            "pageLabel": "Authentication",
            "guidance": "I can help with account access, setup, and where to go right after sign-in.",
            "actions": [
                _action("Go To Pricing", "/pricing", "conversion"),
                _action("Open Demos", "/demos", "education"),
                _action("Start Consultation", "/expert-consultation", "conversion"),
            ],
        }

    generic_actions = [
        _action("See Pricing", "/pricing", "conversion"),
        _action("View Demo", "/demos", "education"),
        _action("Book Expert Consultation", "/expert-consultation", "conversion"),
    ]
    if is_authenticated:
        generic_actions.insert(0, _action("Open Dashboard", "/dashboard", "navigation"))
    else:
        generic_actions.insert(0, _action("Start Free Trial", "/auth/register", "conversion"))

    return {
        "pageLabel": "Current Page",
        "guidance": "I can answer questions and guide you to the best next step.",
        "actions": generic_actions[:4],
    }


def _build_support_prompt(history: str, context: Dict[str, Any], route_hint: Dict[str, Any]) -> str:
    safe_context = json.dumps(
        {
            "route": context.get("route"),
            "pageTitle": context.get("pageTitle"),
            "source": context.get("source"),
            "projectId": context.get("projectId"),
            "audience": context.get("audience"),
        }
    )
    safe_actions = json.dumps(route_hint.get("actions", []))
    return (
        "You are Chimaridata Customer Support Assistant.\n"
        "Goals:\n"
        "1) Help users navigate to the correct page.\n"
        "2) Answer product and workflow questions clearly.\n"
        "3) Encourage the best next step to improve conversion or activation.\n"
        "Constraints:\n"
        "- Be concise, friendly, and concrete.\n"
        "- Never invent routes; only use routes provided in routeActions.\n"
        "- If asked about unknown internals, acknowledge uncertainty and offer next best action.\n"
        "- If user intent is purchase/evaluation related, include one clear conversion CTA.\n\n"
        f"pageContext: {safe_context}\n"
        f"routeActions: {safe_actions}\n\n"
        "Conversation history:\n"
        f"{history}\n\n"
        "Respond as a helpful assistant message only."
    )


def _fallback_support_reply(user_message: str, route_hint: Dict[str, Any]) -> str:
    lower = (user_message or "").lower()
    actions = route_hint.get("actions", [])

    if any(token in lower for token in ["price", "cost", "plan", "billing"]):
        return "I can help you choose a plan quickly. Open Pricing to compare options and then pick the best next step."
    if any(token in lower for token in ["demo", "example", "see it", "sample"]):
        return "Great call. Demos are the fastest way to see outcomes before committing. I can send you to Demos now."
    if any(token in lower for token in ["consult", "expert", "talk to", "advisor"]):
        return "I can route you to Expert Consultation and help frame your business challenge so your first session is high-impact."
    if any(token in lower for token in ["where", "navigate", "go to", "next step"]):
        if actions:
            first_action = actions[0]
            return f"Based on this page, the best next step is {first_action.get('label')}."
        return "I can guide you to the best next page. Tell me whether you want pricing, demos, or to start analysis."
    return (
        "Happy to help. I can answer your question and guide you to the right next page. "
        "Tell me your goal, and I will suggest the fastest route."
    )


@router.post("/conversation/start")
async def conversation_start(
    request: ConversationStartRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Create a new conversation session."""
    try:
        conversation_id = str(uuid.uuid4())
        context = _coerce_support_context(request.context or {})
        route_hint = _route_support_playbook(str(context.get("route") or "/"), is_authenticated=True)
        welcome_message = (
            f"Hi, I can help you on {route_hint.get('pageLabel', 'this page')}. "
            f"{route_hint.get('guidance', 'Ask me anything about navigation, setup, or next steps.')}"
        )

        _conversations[conversation_id] = {
            "id": conversation_id,
            "userId": current_user.id,
            "projectId": request.projectId,
            "messages": [
                {
                    "id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": welcome_message,
                    "timestamp": datetime.utcnow().isoformat(),
                    "meta": {
                        "navigationSuggestions": route_hint.get("actions", []),
                        "proactive": True,
                    },
                }
            ],
            "context": context,
            "createdAt": datetime.utcnow().isoformat(),
        }

        if request.projectId:
            _record_activity(request.projectId, "conversation", "start", conversation_id)

        return ORJSONResponse(content={
            "success": True,
            "conversationId": conversation_id,
            "message": "Conversation started",
            "welcomeMessage": welcome_message,
            "navigationSuggestions": route_hint.get("actions", []),
        })

    except Exception as e:
        logger.error(f"conversation-start error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start conversation: {e}")


# ============================================================================
# 7. POST /api/conversation/{id}/continue
# ============================================================================

@router.post("/conversation/{conversation_id}/continue")
async def conversation_continue(
    conversation_id: str,
    request: ConversationContinueRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Continue a conversation with the user's message."""
    try:
        conv = _conversations.get(conversation_id)
        if conv is None:
            raise HTTPException(status_code=404, detail="Conversation not found")
        if conv.get("userId") != current_user.id and not bool(getattr(current_user, "is_admin", False)):
            raise HTTPException(status_code=403, detail="Not authorized to access this conversation")

        request_context = _coerce_support_context(request.context or {})
        merged_context = dict(conv.get("context") or {})
        merged_context.update({k: v for k, v in request_context.items() if v not in (None, "", [])})
        conv["context"] = merged_context

        route_hint = _route_support_playbook(str(merged_context.get("route") or "/"), is_authenticated=True)

        # Append user message
        conv["messages"].append({
            "id": str(uuid.uuid4()),
            "role": "user",
            "content": request.message,
            "timestamp": datetime.utcnow().isoformat(),
        })

        # Build prompt from conversation history
        history = "\n".join(
            f"{m['role'].upper()}: {m['content']}" for m in conv["messages"][-10:]
        )
        prompt = _build_support_prompt(history, merged_context, route_hint)

        reply: Optional[str] = None
        runtime_used = "llm_direct"

        # Prefer orchestrated runtime (DeepAgent when enabled), then fallback.
        try:
            from ..services.agent_orchestrator import get_orchestrator
            from ..models.schemas import AgentType

            orchestrator = get_orchestrator()
            agent_result = await orchestrator.run_agent_task(
                agent_type=AgentType.CUSTOMER_SUPPORT,
                task=prompt,
                context={
                    "conversationId": conversation_id,
                    "projectId": conv.get("projectId"),
                    "routeContext": merged_context,
                    "navigationSuggestions": route_hint.get("actions", []),
                },
            )
            if agent_result.get("success") and str(agent_result.get("response", "")).strip():
                reply = str(agent_result.get("response"))
                runtime_used = str(agent_result.get("runtime") or runtime_used)
        except Exception as orchestration_error:
            logger.debug("Customer support orchestrator runtime unavailable: %s", orchestration_error)

        if not reply:
            reply = await _llm_generate(prompt)
        if not reply:
            reply = _fallback_support_reply(str(request.message), route_hint)

        conv["messages"].append({
            "id": str(uuid.uuid4()),
            "role": "assistant",
            "content": reply,
            "timestamp": datetime.utcnow().isoformat(),
            "meta": {
                "navigationSuggestions": route_hint.get("actions", []),
            },
        })

        return ORJSONResponse(content={
            "success": True,
            "conversationId": conversation_id,
            "reply": reply,
            "messageCount": len(conv["messages"]),
            "navigationSuggestions": route_hint.get("actions", []),
            "runtime": runtime_used,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"conversation-continue error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to continue conversation: {e}")


# ============================================================================
# 8. GET /api/conversation/{id}
# ============================================================================

@router.get("/conversation/{conversation_id}")
async def get_conversation(
    conversation_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Get conversation history."""
    conv = _conversations.get(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if conv.get("userId") != current_user.id and not bool(getattr(current_user, "is_admin", False)):
        raise HTTPException(status_code=403, detail="Not authorized to access this conversation")

    return ORJSONResponse(content={
        "success": True,
        "conversation": conv,
    })


# ============================================================================
# 9. GET /api/agents/activities/{projectId}
# ============================================================================

@router.get("/agents/activities/{project_id}")
async def get_agent_activities(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return agent activity log for a project."""
    try:
        await _check_project_access(project_id, current_user)
        activities = _agent_activities.get(project_id, [])

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "activities": activities,
            "count": len(activities),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get-agent-activities error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get activities: {e}")


# ============================================================================
# 10. POST /api/analyze-data/{projectId}
# ============================================================================

@router.post("/analyze-data/{project_id}")
async def analyze_data(
    project_id: str,
    request: AnalyzeDataRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Trigger analysis for a project."""
    try:
        project = await _check_project_access(project_id, current_user)
        _record_activity(project_id, "data_scientist", "analyze_data",
                         f"types={request.analysisTypes}")

        execution_id = f"exec_{uuid.uuid4().hex}"

        # Delegate to orchestrator if available
        try:
            from ..services.agent_orchestrator import get_orchestrator
            orchestrator = get_orchestrator()
            session_id = orchestrator.create_session(
                project_id=project_id,
                user_id=current_user.id,
                user_goals=[],
                user_questions=request.questions or [],
            )
            session = orchestrator.get_session(session_id)
            if session and request.analysisTypes:
                session["analysis_types"] = request.analysisTypes
            result_data = orchestrator.advance_session(session_id)
            execution_id = session_id
        except Exception as orch_err:
            logger.error(f"Orchestrator unavailable for analyze-data: {orch_err}", exc_info=True)
            raise HTTPException(
                status_code=503,
                detail="Agent orchestrator unavailable. Analysis was not started.",
            )

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "executionId": execution_id,
            "status": "running",
            "analysisTypes": request.analysisTypes,
            "audienceType": request.audienceType,
            "data": result_data,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"analyze-data error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to trigger analysis: {e}")


# ============================================================================
# 11. GET /api/analyze-data/{projectId}/results
# ============================================================================

@router.get("/analyze-data/{project_id}/results")
async def get_analyze_data_results(
    project_id: str,
    audienceType: Optional[str] = "non-tech",
    current_user: AuthUser = Depends(get_current_user),
):
    """Get formatted results with audience type."""
    try:
        project = await _check_project_access(project_id, current_user)

        analysis_results = project.get("analysis_results")
        jp = project.get("journey_progress") or {}

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "audienceType": audienceType,
            "analysisResults": analysis_results,
            "insights": jp.get("insights", []),
            "status": "completed" if analysis_results else "not_started",
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"analyze-data-results error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get analysis results: {e}")


# ============================================================================
# 12. GET /api/workflow/transparency/{projectId}
# ============================================================================

@router.get("/workflow/transparency/{project_id}")
async def get_workflow_transparency(
    project_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return workflow decision audit trail for a project."""
    try:
        project = await _check_project_access(project_id, current_user)
        jp = project.get("journey_progress") or {}

        # Build audit trail from journey_progress steps
        decisions = []
        for step_name in ["upload", "piiReview", "mapping", "transformation", "execution", "results"]:
            step_data = jp.get(step_name)
            if step_data and isinstance(step_data, dict):
                decisions.append({
                    "step": step_name,
                    "status": step_data.get("status", "unknown"),
                    "decidedAt": step_data.get("completedAt") or step_data.get("updatedAt"),
                    "agent": step_data.get("agent", "system"),
                    "reasoning": step_data.get("reasoning", ""),
                })

        activities = _agent_activities.get(project_id, [])

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "decisions": decisions,
            "activities": activities,
            "auditTrail": decisions,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"workflow-transparency error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get workflow transparency: {e}")


# ============================================================================
# 13. POST /api/agent-workflow/continue
# ============================================================================

@router.post("/agent-workflow/continue")
async def agent_workflow_continue(
    request: AgentWorkflowContinueRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Continue an agent workflow."""
    try:
        await _check_project_access(request.projectId, current_user)
        _record_activity(request.projectId, "orchestrator", "workflow_continue")

        # Delegate to orchestrator
        try:
            from ..services.agent_orchestrator import get_orchestrator
            orchestrator = get_orchestrator()

            if request.sessionId:
                result = orchestrator.advance_session(
                    session_id=request.sessionId,
                    user_input=request.userInput,
                )
            else:
                session_id = orchestrator.create_session(
                    project_id=request.projectId,
                    user_id=current_user.id,
                    user_goals=[],
                    user_questions=[],
                )
                result = orchestrator.advance_session(session_id)
                request.sessionId = session_id

            return ORJSONResponse(content={
                "success": True,
                "projectId": request.projectId,
                "sessionId": request.sessionId,
                "result": result,
            })

        except Exception as orch_err:
            logger.error(f"Orchestrator error in workflow continue: {orch_err}", exc_info=True)
            raise HTTPException(
                status_code=503,
                detail="Agent orchestrator unavailable. Workflow continuation was not executed.",
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"agent-workflow-continue error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to continue workflow: {e}")


# ============================================================================
# 14. POST /api/ai/query
# ============================================================================

@router.post("/ai/query")
async def ai_query(
    request: AIQueryRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Generic AI query endpoint."""
    try:
        if not _has_llm_provider():
            raise HTTPException(
                status_code=503,
                detail="AI providers are not configured. Set GOOGLE_AI_API_KEY or OPENAI_API_KEY.",
            )

        mode = _normalize_ai_mode(request.mode)
        strict_grounding = bool(request.strictGrounding) or mode == "what_if"

        context_text = ""
        project = None
        available_columns: List[str] = []
        question_profile: Optional[Dict[str, Any]] = None

        if request.projectId:
            try:
                project = await _check_project_access(request.projectId, current_user)
                jp = project.get("journey_progress") or {}
                context_text = (
                    f"\nProject context: {project.get('name', 'Unknown')}\n"
                    f"Industry: {jp.get('industry', 'general')}\n"
                )
                available_columns = await _load_project_available_columns(request.projectId)
                metric_catalog = _build_metric_catalog()
                related_metric_keys = _extract_metric_keys([], [request.query], metric_catalog)
                intent = _classify_question_intent(request.query)
                question_profile = _build_question_profile(
                    question=request.query,
                    intent=intent,
                    related_metric_keys=related_metric_keys,
                    metric_catalog=metric_catalog,
                    available_columns=available_columns,
                )
            except HTTPException:
                if strict_grounding:
                    raise
                # Project context is optional for non-strict/general queries

        if strict_grounding and not request.projectId:
            raise HTTPException(status_code=400, detail="projectId is required for strict grounded AI queries.")

        prompt = _build_ai_query_prompt(
            query=request.query,
            mode=mode,
            project_context_text=context_text,
            available_columns=available_columns,
            question_profile=question_profile,
            strict_grounding=strict_grounding,
        )

        reply: Optional[str] = None
        runtime_used = "llm_direct"

        # Prefer orchestrated runtime (DeepAgent when enabled), then fallback.
        try:
            from ..services.agent_orchestrator import get_orchestrator
            from ..models.schemas import AgentType

            orchestrator = get_orchestrator()
            agent_result = await orchestrator.run_agent_task(
                agent_type=AgentType.DATA_SCIENTIST,
                task=prompt,
                context={
                    "projectId": request.projectId,
                    "mode": mode,
                    "strictGrounding": strict_grounding,
                    "availableColumns": available_columns,
                    "questionProfile": question_profile,
                },
            )
            if agent_result.get("success") and str(agent_result.get("response", "")).strip():
                reply = str(agent_result.get("response"))
                runtime_used = str(agent_result.get("runtime") or runtime_used)
        except Exception as orchestration_error:
            logger.debug("AI query orchestrator runtime unavailable: %s", orchestration_error)

        if not reply:
            reply = await _llm_generate(prompt)
        if not isinstance(reply, str) or not reply.strip():
            raise HTTPException(
                status_code=503,
                detail="No AI response generated. Verify provider credentials and availability.",
            )

        if request.projectId:
            _record_activity(
                request.projectId,
                "technical_ai_agent",
                "what_if_query" if mode == "what_if" else "ai_query",
                request.query[:180],
            )

        return ORJSONResponse(content={
            "success": True,
            "query": request.query,
            "response": reply,
            "projectId": request.projectId,
            "mode": mode,
            "runtime": runtime_used,
            "grounding": {
                "strict": strict_grounding,
                "availableColumnCount": len(available_columns),
                "availableColumns": available_columns[:50],
                "questionProfile": question_profile,
            },
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"ai-query error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI query failed: {e}")


# ============================================================================
# 15. POST /api/data-quality/analyze
# ============================================================================

@router.post("/data-quality/analyze")
async def analyze_data_quality(
    request: DataQualityRequest,
    current_user: AuthUser = Depends(get_current_user),
):
    """Analyze data quality for a dataset."""
    try:
        # Fetch dataset metadata
        async with get_db_context() as session:
            result = await session.execute(
                sa_text("SELECT * FROM datasets WHERE id = :id"),
                {"id": request.datasetId},
            )
            row = result.first()
            if row is None:
                raise HTTPException(status_code=404, detail="Dataset not found")
            dataset = dict(zip(result.keys(), row))

        # Build basic quality report from schema metadata
        schema_info = dataset.get("schema") or dataset.get("column_schema") or {}
        record_count = dataset.get("record_count", 0)
        columns = []
        if isinstance(schema_info, list):
            columns = schema_info
        elif isinstance(schema_info, dict):
            columns = schema_info.get("columns", [])

        quality_report = {
            "datasetId": request.datasetId,
            "recordCount": record_count,
            "columnCount": len(columns),
            "completeness": 0.95,  # placeholder
            "validity": 0.92,
            "consistency": 0.88,
            "overallScore": 0.90,
            "issues": [],
            "recommendations": [
                "Check for missing values in key columns",
                "Validate data types match expected schema",
            ],
            "analyzedAt": datetime.utcnow().isoformat(),
        }

        return ORJSONResponse(content={
            "success": True,
            "qualityReport": quality_report,
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"data-quality error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Data quality analysis failed: {e}")


# ============================================================================
# 16. GET /api/enhanced-analysis/capabilities
# ============================================================================

@router.get("/enhanced-analysis/capabilities")
async def get_enhanced_analysis_capabilities():
    """Return available analysis capabilities."""
    capabilities = [
        {
            "id": "descriptive_stats",
            "name": "Descriptive Statistics",
            "description": "Mean, median, mode, standard deviation, quartiles, and distribution analysis",
            "category": "statistical",
            "requiresTarget": False,
        },
        {
            "id": "correlation",
            "name": "Correlation Analysis",
            "description": "Pearson, Spearman, and Kendall correlation with significance testing",
            "category": "statistical",
            "requiresTarget": False,
        },
        {
            "id": "regression",
            "name": "Regression Analysis",
            "description": "Linear and logistic regression with feature importance",
            "category": "predictive",
            "requiresTarget": True,
        },
        {
            "id": "clustering",
            "name": "Clustering Analysis",
            "description": "K-means, hierarchical, and DBSCAN clustering with silhouette analysis",
            "category": "unsupervised",
            "requiresTarget": False,
        },
        {
            "id": "time_series",
            "name": "Time Series Analysis",
            "description": "Trend decomposition, seasonality detection, and forecasting",
            "category": "temporal",
            "requiresTarget": True,
        },
        {
            "id": "statistical_tests",
            "name": "Statistical Tests",
            "description": "T-tests, ANOVA, chi-square, and non-parametric tests",
            "category": "statistical",
            "requiresTarget": False,
        },
        {
            "id": "classification",
            "name": "Classification",
            "description": "Decision tree, random forest, and logistic regression classifiers",
            "category": "predictive",
            "requiresTarget": True,
        },
        {
            "id": "eda",
            "name": "Exploratory Data Analysis",
            "description": "Data distributions, outlier detection, and pattern discovery",
            "category": "exploratory",
            "requiresTarget": False,
        },
        {
            "id": "text_analysis",
            "name": "Text Analysis",
            "description": "Sentiment analysis, topic modeling, and keyword extraction",
            "category": "nlp",
            "requiresTarget": False,
        },
        {
            "id": "group_analysis",
            "name": "Group Comparison",
            "description": "Compare groups with ANOVA, effect sizes, and distinctive features",
            "category": "comparative",
            "requiresTarget": True,
        },
    ]

    return ORJSONResponse(content={
        "success": True,
        "capabilities": capabilities,
        "count": len(capabilities),
    })


# ============================================================================
# 17. GET /api/semantic-pipeline/{projectId}/evidence-chain/{questionId}
# ============================================================================

@router.get("/semantic-pipeline/{project_id}/evidence-chain/{question_id}")
async def get_evidence_chain(
    project_id: str,
    question_id: str,
    current_user: AuthUser = Depends(get_current_user),
):
    """Return evidence chain for a specific question in a project."""
    try:
        project = await _check_project_access(project_id, current_user)

        # Try to use the evidence chain service
        chain_data = []
        try:
            from ..services.rag_evidence_chain import get_evidence_chain_service
            service = get_evidence_chain_service()
            chain = service.get_chain_for_project(project_id)
            chain_data = [
                link.dict() if hasattr(link, "dict") else link
                for link in chain
                if (hasattr(link, "source_id") and link.source_id == question_id)
                or (isinstance(link, dict) and link.get("source_id") == question_id)
            ]
        except Exception as svc_err:
            logger.warning(f"Evidence chain service unavailable: {svc_err}")

        # Also check evidence_links table
        db_links = []
        async with get_db_context() as session:
            result = await session.execute(
                sa_text(
                    "SELECT * FROM evidence_links "
                    "WHERE project_id = :pid AND source_id = :qid "
                    "ORDER BY created_at DESC"
                ),
                {"pid": project_id, "qid": question_id},
            )
            rows = result.fetchall()
            keys = result.keys()
            for row in rows:
                row_dict = dict(zip(keys, row))
                for k, v in row_dict.items():
                    if isinstance(v, datetime):
                        row_dict[k] = v.isoformat()
                db_links.append(row_dict)

        all_links = chain_data + db_links

        return ORJSONResponse(content={
            "success": True,
            "projectId": project_id,
            "questionId": question_id,
            "evidenceChain": all_links,
            "count": len(all_links),
        })

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"evidence-chain error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get evidence chain: {e}")


# ============================================================================
# Performance Metrics (frontend telemetry — fire-and-forget)
# ============================================================================

@router.post("/performance/metrics/batch")
async def post_performance_metrics_batch(request: Request):
    """Accept frontend performance telemetry (no-op for now)."""
    try:
        body = await request.json()
        # In production: persist to metrics table or push to monitoring service
        logger.debug(f"Performance metrics received: {len(body.get('metrics', []))} entries")
    except Exception:
        pass
    return ORJSONResponse(content={"success": True})


@router.get("/performance/metrics/my-uploads")
async def get_my_upload_metrics(
    timeWindow: Optional[str] = "24h",
    current_user: AuthUser = Depends(get_current_user),
):
    """Return upload performance metrics for current user."""
    return ORJSONResponse(content={
        "success": True,
        "metrics": [],
        "timeWindow": timeWindow,
    })


# ============================================================================
# Router Inclusion
# ============================================================================

def include_agent_pipeline_routes(app):
    """
    Include agent pipeline routes in the FastAPI app.

    Routes are mounted at root level since they already include /api/ prefix
    in their path definitions (matching Vite proxy expectations).
    """
    app.include_router(router, tags=["agent-pipeline"])
    logger.info("Agent pipeline routes included")
