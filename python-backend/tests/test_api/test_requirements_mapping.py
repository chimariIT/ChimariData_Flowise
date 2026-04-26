"""
Requirements mapping tests for question understanding -> metric extraction ->
column mapping in the Python agent pipeline.
"""

import logging

from src.api.agent_pipeline_routes import (
    _best_column_for_terms,
    _build_metric_catalog,
    _build_requirements_document,
)


def _get_element(document: dict, element_id: str) -> dict | None:
    for element in document.get("requiredDataElements", []) + document.get("optionalDataElements", []):
        if element.get("elementId") == element_id:
            return element
    return None


def test_requirements_document_auto_maps_direct_metric_columns() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-direct-1",
        user_goals=["Improve revenue visibility"],
        user_questions=["How has revenue changed over time by region?"],
        industry="finance",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["month", "region", "revenue", "campaign"],
    )

    revenue = _get_element(document, "el_revenue")
    assert revenue is not None
    assert revenue.get("sourceAvailable") is True
    assert revenue.get("sourceColumn") == "revenue"
    assert document["completeness"]["elementsMapped"] >= 1
    assert document["businessContext"]["availableColumnCount"] == 4
    assert "dataset_schema" in document["businessContext"]["knowledgeSources"]


def test_requirements_document_maps_component_fields_for_derived_metrics() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-derived-1",
        user_goals=["Increase conversion performance"],
        user_questions=["What drives conversion rate changes by campaign?"],
        industry="marketing",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["campaign", "conversions", "lead_count", "region"],
    )

    conversion_rate = _get_element(document, "el_conversion_rate")
    assert conversion_rate is not None
    assert conversion_rate.get("transformationRequired") is True
    assert isinstance(conversion_rate.get("sourceColumns"), list)
    assert len(conversion_rate["sourceColumns"]) >= 2

    matched_components = [item for item in conversion_rate["sourceColumns"] if item.get("matched")]
    matched_fields = {item.get("componentField") for item in matched_components}
    assert "conversions" in matched_fields
    assert "leads" in matched_fields
    assert conversion_rate.get("mappingStatus") in {"mapped", "partially_mapped"}

    qa_map = document.get("questionAnswerMapping", [])
    assert len(qa_map) >= 1
    assert qa_map[0].get("requiredDataElements")


def test_synonym_mapping_matches_turnover_to_attrition_column() -> None:
    matched_column, match_score = _best_column_for_terms(
        terms=["turnover rate"],
        available_columns=["department", "employee_attrition_rate", "month"],
    )

    assert matched_column == "employee_attrition_rate"
    assert match_score >= 0.62


def test_requirements_document_includes_question_profile_and_validation_checklist() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-profile-1",
        user_goals=["Improve marketing performance"],
        user_questions=["Which channel has the highest conversion rate in enterprise segment?"],
        industry="marketing",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["channel", "enterprise_segment", "conversions", "lead_count"],
    )

    qa_map = document.get("questionAnswerMapping", [])
    assert len(qa_map) == 1
    profile = qa_map[0].get("questionProfile") or {}
    assert profile.get("computationKind") in {"SEGMENT_RANKING", "COMPARATIVE"}
    assert profile.get("dimensionLevel") == "group_by"
    assert float(profile.get("clarityScore", 0.0)) >= 0.62

    understanding = document.get("questionUnderstanding", {})
    assert "computationKindBreakdown" in understanding
    assert understanding.get("lowClarityQuestionCount", 0) == 0

    checklist = document.get("validationChecklist", [])
    checklist_ids = {item.get("id") for item in checklist}
    assert "question_clarity" in checklist_ids
    assert "required_mappings" in checklist_ids
    assert "derived_component_coverage" in checklist_ids


def test_short_ambiguous_question_is_flagged_low_clarity() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-clarity-1",
        user_goals=["Find risk factors"],
        user_questions=["it?"],
        industry="general",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["region", "value"],
    )

    understanding = document.get("questionUnderstanding", {})
    assert understanding.get("lowClarityQuestionCount", 0) >= 1
    checklist = {item.get("id"): item for item in document.get("validationChecklist", [])}
    assert checklist["question_clarity"]["status"] == "warning"


def test_ambiguous_question_does_not_inject_default_metrics() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-nofabrication-1",
        user_goals=["Find important patterns"],
        user_questions=["How is it doing?"],
        industry="general",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["employee_id", "department", "join_date"],
    )

    metrics = {str(metric).lower() for metric in document.get("businessContext", {}).get("metrics", [])}
    assert "revenue" not in metrics
    assert "conversion rate" not in metrics

    checklist = {item.get("id"): item for item in document.get("validationChecklist", [])}
    assert checklist["question_grounding"]["status"] == "warning"
    assert document.get("mappingMetadata", {}).get("dataGapQuestionCount", 0) >= 1


def test_dataset_column_fallback_used_when_metric_not_in_kb() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-colground-1",
        user_goals=["Understand q2 movement"],
        user_questions=["What is the average q2 growth by department?"],
        industry="general",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["Q2_Growth", "Department", "Employee_ID"],
    )

    mapped_required = [
        element
        for element in document.get("requiredDataElements", [])
        if element.get("sourceColumn") == "Q2_Growth"
    ]
    assert len(mapped_required) >= 1
    assert mapped_required[0].get("mappingStatus") in {"mapped", "partially_mapped"}


def test_funnel_efficiency_question_grounds_to_conversion_rate_proxy() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-funnel-proxy-1",
        user_goals=["Optimize campaign outcomes"],
        user_questions=["Optimize Sales Funnel Efficiency"],
        industry="marketing",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=[
            "ROI",
            "Date",
            "Clicks",
            "Duration",
            "Channel_Used",
            "Campaign_Type",
            "Conversion_Rate",
        ],
    )

    profile = document.get("questionProfiles", [])[0]
    assert profile.get("metricConcept") in {"funnel performance", "sales funnel efficiency", "optimize sales funnel"}
    assert profile.get("groundedMetricColumn") == "Conversion_Rate"
    assert profile.get("computationKind") == "FUNNEL_ANALYSIS"

    required = document.get("requiredDataElements", [])
    assert len(required) == 1
    assert required[0].get("elementName").lower() in {"funnel performance", "conversion_rate", "conversion rate"}
    assert required[0].get("sourceColumn") == "Conversion_Rate"
    assert required[0].get("mappingStatus") == "mapped"

    blockers = {str(item.get("code")) for item in document.get("confidenceGate", {}).get("blockers", [])}
    assert "question_data_gap" not in blockers


def test_sales_cycle_length_prefers_grounded_duration_over_generic_sales_alias() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-sales-cycle-1",
        user_goals=["Reduce cycle time"],
        user_questions=["What is the average sales cycle length?"],
        industry="sales",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["Duration", "Department", "Employee_ID", "Conversion_Rate"],
    )

    profile = document.get("questionProfiles", [])[0]
    assert profile.get("metricConcept") == "sales cycle length"
    assert profile.get("groundedMetricColumn") == "Duration"

    required = document.get("requiredDataElements", [])
    assert len(required) == 1
    assert required[0].get("elementName") == "Duration"
    assert required[0].get("mappingStatus") == "mapped"
    assert required[0].get("sourceColumn") == "Duration"


def test_grouped_question_adds_dimension_element_and_analysis_plan() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-dimension-1",
        user_goals=["Improve channel quality"],
        user_questions=["Which marketing channels produce the highest quality leads?"],
        industry="marketing",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["Channel_Used", "Conversion_Rate", "ROI", "Date"],
    )

    profile = document.get("questionProfiles", [])[0]
    assert profile.get("dimensionLevel") == "group_by"
    assert profile.get("groundedDimensionColumn") == "Channel_Used"
    assert profile.get("answerability") in {"answerable", "partial"}
    analysis_plan = profile.get("analysisPlan", {})
    assert analysis_plan.get("primaryAnalysisType") in {"group_analysis", "descriptive_stats"}
    assert len(analysis_plan.get("processSteps", [])) >= 3

    required_ids = {str(item.get("elementId")) for item in document.get("requiredDataElements", [])}
    assert "el_dimension_channel_used" in required_ids


def test_dimension_gap_is_reported_for_unresolved_grouped_question() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-dimension-gap-1",
        user_goals=["Understand segmented conversion"],
        user_questions=["Which segment has the highest conversion rate?"],
        industry="marketing",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["Conversion_Rate", "Date", "Duration"],
    )

    profile = document.get("questionProfiles", [])[0]
    assert profile.get("dimensionLevel") == "group_by"
    assert profile.get("groundedDimensionColumn") is None

    blockers = {str(item.get("code")) for item in document.get("confidenceGate", {}).get("blockers", [])}
    assert "question_dimension_gap" in blockers
    checklist = {item.get("id"): item for item in document.get("validationChecklist", [])}
    assert checklist["dimension_grounding"]["status"] == "warning"


def test_what_if_question_gets_counterfactual_friendly_analysis_plan() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-whatif-1",
        user_goals=["Plan scenario improvements"],
        user_questions=["What if we increase conversion rate by 10% for enterprise customers?"],
        industry="marketing",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["Conversion_Rate", "Customer_Segment", "ROI", "Date"],
    )

    profile = document.get("questionProfiles", [])[0]
    assert profile.get("computationKind") == "COMPARATIVE"
    analysis_types = profile.get("analysisPlan", {}).get("analysisTypes", [])
    assert "regression" in analysis_types or "group_analysis" in analysis_types


def test_lingo_question_recursively_decomposes_into_granular_mapping_layers() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-lingo-1",
        user_goals=["Find funnel losses"],
        user_questions=["Where is our leaky bucket in the funnel?"],
        industry="marketing",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["Funnel_Stage", "Conversion_Rate", "Channel_Used", "ROI"],
    )

    profile = document.get("questionProfiles", [])[0]
    decomposition = profile.get("decomposition", {})
    assert decomposition.get("strategy") == "recursive_lingo_and_multi_part"
    assert int(decomposition.get("layerCount", 0)) >= 2
    assert int(decomposition.get("leafCount", 0)) >= 1
    leaf_mappings = decomposition.get("leafMappings", [])
    assert isinstance(leaf_mappings, list)
    assert any("drop" in str(item.get("leafText", "")).lower() or "funnel" in str(item.get("leafText", "")).lower() for item in leaf_mappings)
    assert profile.get("groundedMetricColumn") == "Conversion_Rate"
    assert profile.get("answerability") in {"answerable", "partial"}


def test_researcher_context_lingo_drives_recursive_mapping_layers() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-context-lingo-1",
        user_goals=["Understand where profit concentration is strongest"],
        user_questions=["Where is our whale curve strongest?"],
        industry="finance",
        researcher_context={
            "glossary": [
                {
                    "term": "whale curve",
                    "definition": "profit contribution concentration by customer segment",
                    "metricHint": "profit",
                    "dimensionHint": "customer segment",
                }
            ]
        },
        metric_catalog=metric_catalog,
        available_columns=["Customer_Segment", "Profit", "Revenue"],
    )

    profile = document.get("questionProfiles", [])[0]
    decomposition = profile.get("decomposition", {})
    assert int(decomposition.get("layerCount", 0)) >= 2
    assert int(decomposition.get("leafCount", 0)) >= 1
    assert profile.get("groundedMetricColumn") == "Profit"
    assert profile.get("answerability") in {"answerable", "partial"}
    assert int(document.get("businessContext", {}).get("contextLingoRuleCount", 0)) >= 1


def test_question_mapping_emits_per_question_observability_logs(caplog) -> None:
    metric_catalog = _build_metric_catalog()
    with caplog.at_level(logging.INFO):
        _build_requirements_document(
            project_id="proj-log-1",
            user_goals=["Increase conversion quality"],
            user_questions=["Which channel has the highest conversion rate?"],
            industry="marketing",
            researcher_context={},
            metric_catalog=metric_catalog,
            available_columns=["Channel_Used", "Conversion_Rate", "Date"],
        )

    messages = [record.getMessage() for record in caplog.records]
    assert any("[requirements.qmap]" in message for message in messages)
    assert any("question_id=" in message and "answerability=" in message for message in messages)


def test_multi_part_question_maps_layers_and_reconstructs_to_high_level_plan() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-multipart-1",
        user_goals=["Optimize channel outcomes"],
        user_questions=["Which channels have the highest ROI and how has conversion rate trended over time?"],
        industry="marketing",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["Channel_Used", "ROI", "Conversion_Rate", "Date", "Campaign_ID"],
    )

    profile = document.get("questionProfiles", [])[0]
    decomposition = profile.get("decomposition", {})
    leaf_mappings = decomposition.get("leafMappings", [])
    assert isinstance(leaf_mappings, list)
    assert len(leaf_mappings) >= 2

    analysis_types = profile.get("analysisPlan", {}).get("analysisTypes", [])
    assert "group_analysis" in analysis_types
    assert "time_series" in analysis_types

    qa_map = document.get("questionAnswerMapping", [])[0]
    required_ids = {str(item) for item in qa_map.get("requiredDataElements", [])}
    assert "el_roi" in required_ids
    assert any(item.endswith("conversion_rate") for item in required_ids)


def test_ungrounded_llm_metric_is_ignored() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-llm-guard-1",
        user_goals=["Improve employee retention"],
        user_questions=["How does retention change by department?"],
        industry="hr",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["department", "attrition_rate", "month"],
        llm_enrichment={
            "inferredMetrics": [
                {
                    "name": "galactic happiness index",
                    "description": "made up metric",
                    "dataType": "numeric",
                    "relatedQuestions": [],
                }
            ]
        },
    )

    metrics = {str(metric).lower() for metric in document.get("businessContext", {}).get("metrics", [])}
    assert "galactic happiness index" not in metrics
    ignored = {
        str(metric).lower() for metric in document.get("businessContext", {}).get("ignoredInferredMetrics", [])
    }
    assert "galactic happiness index" in ignored


def test_confidence_gate_passes_when_question_and_dataset_are_grounded() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-confidence-pass-1",
        user_goals=["Understand revenue performance by region"],
        user_questions=["How has revenue changed over time by region?"],
        industry="finance",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["month", "region", "revenue"],
    )

    gate = document.get("confidenceGate") or {}
    assert gate.get("passed") is True
    assert float(gate.get("overallConfidence", 0.0)) >= float(gate.get("threshold", 1.0))
    assert gate.get("questionPass") is True
    assert gate.get("datasetPass") is True
    assert document.get("completeness", {}).get("readyForExecution") is True


def test_confidence_gate_fails_when_question_is_not_grounded() -> None:
    metric_catalog = _build_metric_catalog()
    document = _build_requirements_document(
        project_id="proj-confidence-fail-1",
        user_goals=["Find key trends"],
        user_questions=["How is it doing?"],
        industry="general",
        researcher_context={},
        metric_catalog=metric_catalog,
        available_columns=["employee_id", "department", "join_date"],
    )

    gate = document.get("confidenceGate") or {}
    assert gate.get("passed") is False
    blocker_codes = {str(item.get("code")) for item in gate.get("blockers", [])}
    assert "question_data_gap" in blocker_codes
    assert document.get("completeness", {}).get("readyForExecution") is False
