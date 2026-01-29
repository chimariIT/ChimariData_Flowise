import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Database,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Code,
  Lightbulb,
  Edit,
  Save,
  X,
  Wand2,
  Loader2,
  PlayCircle,
  CheckCircle2,
  BookOpen,
  Beaker,
  Info
} from "lucide-react";
import { apiClient } from "@/lib/api";

interface RequiredDataElement {
  elementId: string;
  elementName: string;
  description: string;
  dataType: string;
  purpose: string;
  required: boolean;
  sourceField?: string;
  sourceColumn?: string;  // FIX: Backend may set sourceColumn instead of sourceField
  sourceAvailable: boolean;
  transformationRequired: boolean;
  transformationLogic?: {
    operation: string;
    description: string;
    code?: string;
    validationError?: string;
    warnings?: string[];
    sourceColumns?: Array<{
      componentField: string;
      matchedColumn?: string;
      matchConfidence: number;
      matched: boolean;
    }>;
  };
  alternatives?: Array<{
    sourceField: string;
    transformationLogic: string;
    confidence: number;
  }>;
  confidence?: number; // Confidence score (0-1)
  // NEW: For composite/derived elements - multiple source columns
  sourceColumns?: Array<{
    componentField: string;
    matchedColumn?: string;
    matchConfidence: number;
    matched: boolean;
  }>;
  isComposite?: boolean;
  // Business Definition fields (from BA Agent enrichment)
  businessDefinition?: {
    conceptName: string;
    displayName?: string;
    businessDescription: string;
    calculationType: 'direct' | 'derived' | 'aggregated' | 'categorization';
    formula?: string;
    componentFields?: string[];
    aggregationMethod?: string;
    confidence: number;
    source: 'exact' | 'pattern' | 'synonym' | 'ai_inferred' | 'not_found';
    industry?: string;
  };
  hasBusinessDefinition?: boolean;
  definitionConfidence?: number;
  alternativeDefinitions?: Array<{
    conceptName: string;
    displayName?: string;
    businessDescription: string;
    calculationType?: string;
  }>;
}

interface DataElementsMappingUIProps {
  requiredDataElements: RequiredDataElement[];
  availableColumns: string[];
  onSaveMapping?: (mappings: Record<string, any>) => void;
  initialMappings?: Record<string, {
    sourceField: string;
    transformationCode?: string;
    transformationDescription?: string;
  }>;
  schema?: Record<string, any>;
  sampleData?: Record<string, any>[];
  /** Show loading indicator while DE Agent is mapping elements */
  isMapping?: boolean;
}

interface AIGenerationState {
  isGenerating: boolean;
  isValidating: boolean;
  lastError?: string;
  validationResults?: {
    isValid: boolean;
    sampleOutputs: any[];
  };
}

// Business Definition Validation State
interface DefinitionValidationState {
  isValidating: boolean;
  result?: {
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
    missingFields: string[];
    matchedFields: string[];
    suggestedFormula?: string;
    calculationTypeMatch: boolean;
  };
  error?: string;
}

export function DataElementsMappingUI({
  requiredDataElements,
  availableColumns,
  onSaveMapping,
  initialMappings,
  schema,
  sampleData,
  isMapping = false
}: DataElementsMappingUIProps) {
  const [editingElement, setEditingElement] = useState<string | null>(null);
  const [aiStates, setAIStates] = useState<Record<string, AIGenerationState>>({});
  const [definitionValidations, setDefinitionValidations] = useState<Record<string, DefinitionValidationState>>({});

  // CRITICAL FIX: Initialize mappings from props or from requiredDataElements' sourceColumn
  const [mappings, setMappings] = useState<Record<string, {
    sourceField: string;
    transformationCode?: string;
    transformationDescription?: string;
  }>>(() => {
    if (initialMappings && Object.keys(initialMappings).length > 0) {
      console.log('📋 [DataElementsMappingUI] Restoring', Object.keys(initialMappings).length, 'saved mappings from props');
      return initialMappings;
    }

    // CRITICAL FIX: Check multiple field names for auto-mappings from agents
    // Agents may use sourceField, sourceColumn, or mappedColumn
    const restoredMappings: Record<string, any> = {};
    requiredDataElements.forEach(elem => {
      // FIX: Check all possible field names (sourceField from auto-mapping, sourceColumn from saved state)
      const sourceCol = (elem as any).sourceColumn || (elem as any).sourceField || (elem as any).mappedColumn;
      if (sourceCol) {
        restoredMappings[elem.elementId] = {
          sourceField: sourceCol,
          transformationCode: (elem as any).transformationCode,
          transformationDescription: (elem as any).transformationDescription
        };
      }
    });

    if (Object.keys(restoredMappings).length > 0) {
      console.log('📋 [DataElementsMappingUI] Restoring', Object.keys(restoredMappings).length, 'mappings from requiredDataElements (auto-mapped by agents)');
    }

    return restoredMappings;
  });

  // FIX Jan 20: Sync mappings state when requiredDataElements prop changes (e.g., after auto-mapping completes)
  // useState initializer only runs once on mount, so we need useEffect to handle prop updates
  useEffect(() => {
    // Extract mappings from updated requiredDataElements
    const newMappings: Record<string, any> = {};
    let hasNewMappings = false;

    requiredDataElements.forEach(elem => {
      const sourceCol = (elem as any).sourceColumn || (elem as any).sourceField || (elem as any).mappedColumn;
      if (sourceCol) {
        newMappings[elem.elementId] = {
          sourceField: sourceCol,
          transformationCode: (elem as any).transformationCode,
          transformationDescription: (elem as any).transformationDescription
        };
        hasNewMappings = true;
      }
    });

    // Only update if we have new mappings and they differ from current state
    if (hasNewMappings) {
      const currentMappedCount = Object.keys(mappings).filter(k => mappings[k]?.sourceField).length;
      const newMappedCount = Object.keys(newMappings).length;

      // P0-1 FIX: Use content comparison, not just count
      const currentKeys = Object.keys(mappings)
        .filter(k => mappings[k]?.sourceField)
        .sort()
        .join(',');
      const newKeys = Object.keys(newMappings).sort().join(',');

      // Update if new mappings have different keys or more items (auto-mapping completed)
      if (newKeys !== currentKeys || newMappedCount > currentMappedCount) {
        console.log(`📋 [DataElementsMappingUI] Syncing mappings from props: ${newMappedCount} items`);
        setMappings(prev => ({
          ...prev,
          ...newMappings
        }));
      }
    }
  }, [requiredDataElements]); // Re-run when requiredDataElements changes

  const handleEditElement = (elementId: string) => {
    setEditingElement(elementId);
  };

  const handleSaveElement = (elementId: string) => {
    setEditingElement(null);
    if (onSaveMapping) {
      onSaveMapping(mappings);
    }
  };

  const handleCancelEdit = () => {
    setEditingElement(null);
  };

  const handleMappingChange = (
    elementId: string,
    field: 'sourceField' | 'transformationCode' | 'transformationDescription',
    value: string
  ) => {
    setMappings(prev => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        [field]: value
      }
    }));

    // Trigger business definition validation when source column changes
    if (field === 'sourceField' && value) {
      const element = requiredDataElements.find(e => e.elementId === elementId);
      if (element?.businessDefinition) {
        validateMappingAgainstDefinition(elementId, element, value);
      }
    }
  };

  // Business Definition Validation - checks if mapping aligns with expected business logic
  const validateMappingAgainstDefinition = useCallback(async (
    elementId: string,
    element: RequiredDataElement,
    sourceColumn: string
  ) => {
    if (!element.businessDefinition) return;

    // Get projectId from URL or localStorage
    const projectId = localStorage.getItem('currentProjectId');
    if (!projectId) {
      console.warn('[Definition Validation] No project ID available');
      return;
    }

    setDefinitionValidations(prev => ({
      ...prev,
      [elementId]: { isValidating: true }
    }));

    console.log(`🔍 [Definition Validation] Validating ${element.elementName} → ${sourceColumn}`);

    try {
      const response = await apiClient.post(`/api/projects/${projectId}/validate-mapping`, {
        elementId,
        elementName: element.elementName,
        mappedColumns: [sourceColumn],
        businessDefinition: element.businessDefinition,
        transformationType: element.transformationRequired ? 'derived' : 'direct'
      });

      if (response.success) {
        console.log(`✅ [Definition Validation] ${element.elementName}: ${response.validation.isValid ? 'Valid' : 'Has warnings'}`);
        setDefinitionValidations(prev => ({
          ...prev,
          [elementId]: {
            isValidating: false,
            result: response.validation
          }
        }));
      } else {
        throw new Error(response.error || 'Validation failed');
      }
    } catch (error: any) {
      console.error(`❌ [Definition Validation] Failed for ${element.elementName}:`, error);
      setDefinitionValidations(prev => ({
        ...prev,
        [elementId]: {
          isValidating: false,
          error: error.message || 'Validation failed'
        }
      }));
    }
  }, [requiredDataElements]);

  // AI Transformation Interpretation Handler
  const handleInterpretTransformation = useCallback(async (element: RequiredDataElement) => {
    const mapping = mappings[element.elementId] || {};
    const description = mapping.transformationDescription;

    if (!description || description.trim().length < 5) {
      console.log(`⚠️ [AI Transform] No description provided for ${element.elementName}`);
      return;
    }

    console.log(`🤖 [AI Transform] Interpreting: "${description}" for ${element.elementName}`);

    setAIStates(prev => ({
      ...prev,
      [element.elementId]: { isGenerating: true, isValidating: false }
    }));

    try {
      const response = await apiClient.post('/api/ai/interpret-transformation', {
        description,
        elementName: element.elementName,
        sourceColumns: availableColumns,
        schema,
        sampleData: sampleData?.slice(0, 5),
        calculationDefinition: (element as any).calculationDefinition
      });

      if (response.success) {
        console.log(`✅ [AI Transform] Generated code for ${element.elementName}`);

        // Update the mapping with the generated code
        setMappings(prev => ({
          ...prev,
          [element.elementId]: {
            ...prev[element.elementId],
            transformationCode: response.transformationCode,
            transformationDescription: description
          }
        }));

        setAIStates(prev => ({
          ...prev,
          [element.elementId]: {
            isGenerating: false,
            isValidating: false,
            validationResults: undefined
          }
        }));
      } else {
        throw new Error(response.error || 'Failed to interpret transformation');
      }
    } catch (error: any) {
      console.error(`❌ [AI Transform] Failed for ${element.elementName}:`, error);
      setAIStates(prev => ({
        ...prev,
        [element.elementId]: {
          isGenerating: false,
          isValidating: false,
          lastError: error.message || 'Failed to generate transformation code'
        }
      }));
    }
  }, [mappings, availableColumns, schema, sampleData]);

  // Validate generated transformation code
  const handleValidateTransformation = useCallback(async (element: RequiredDataElement) => {
    const mapping = mappings[element.elementId] || {};
    const code = mapping.transformationCode;

    if (!code) {
      console.log(`⚠️ [Validate] No code to validate for ${element.elementName}`);
      return;
    }

    if (!sampleData?.length) {
      console.log(`⚠️ [Validate] No sample data available for validation`);
      return;
    }

    console.log(`🧪 [Validate] Testing code for ${element.elementName}`);

    setAIStates(prev => ({
      ...prev,
      [element.elementId]: { ...prev[element.elementId], isValidating: true }
    }));

    try {
      const response = await apiClient.post('/api/ai/validate-transformation', {
        transformationCode: code,
        sampleData: sampleData.slice(0, 5),
        elementName: element.elementName
      });

      if (response.success) {
        console.log(`${response.isValid ? '✅' : '⚠️'} [Validate] ${element.elementName}: ${response.summary?.successCount}/${response.summary?.totalRows} passed`);

        setAIStates(prev => ({
          ...prev,
          [element.elementId]: {
            ...prev[element.elementId],
            isValidating: false,
            validationResults: {
              isValid: response.isValid,
              sampleOutputs: response.summary?.sampleOutputs || []
            }
          }
        }));
      }
    } catch (error: any) {
      console.error(`❌ [Validate] Failed for ${element.elementName}:`, error);
      setAIStates(prev => ({
        ...prev,
        [element.elementId]: {
          ...prev[element.elementId],
          isValidating: false,
          lastError: error.message || 'Validation failed'
        }
      }));
    }
  }, [mappings, sampleData]);

  const requiredElements = requiredDataElements.filter(e => e.required);
  const optionalElements = requiredDataElements.filter(e => !e.required);

  const getMappingStatus = (element: RequiredDataElement) => {
    const mapping = mappings[element.elementId];
    // FIX: Check both mapping state AND element's sourceField/sourceColumn properties
    const hasSourceMapping = mapping?.sourceField || element.sourceField || element.sourceColumn;
    if (hasSourceMapping) {
      return element.transformationRequired ? 'needs_transformation' : 'mapped';
    }
    // FIX: Also check sourceAvailable OR any source field
    return (element.sourceAvailable || element.sourceField || element.sourceColumn) ? 'auto_mapped' : 'missing';
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'mapped':
        return <Badge className="bg-green-100 text-green-800">Mapped</Badge>;
      case 'auto_mapped':
        return <Badge className="bg-blue-100 text-blue-800">Auto-Mapped</Badge>;
      case 'needs_transformation':
        return <Badge className="bg-yellow-100 text-yellow-800">Needs Transform</Badge>;
      case 'missing':
        return <Badge variant="destructive">Not Mapped</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getConfidenceBadge = (confidence?: number) => {
    if (confidence === undefined) return null;

    const percentage = Math.round(confidence * 100);

    if (confidence >= 0.8) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-300">
          ✓ {percentage}% Confidence
        </Badge>
      );
    } else if (confidence >= 0.7) {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
          ⚠ {percentage}% Confidence
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-300">
          ⚠ {percentage}% Low Confidence - Review Required
        </Badge>
      );
    }
  };

  const getValidationWarnings = (element: RequiredDataElement) => {
    const warnings: string[] = [];

    if (element.transformationLogic?.validationError) {
      warnings.push(`Validation Error: ${element.transformationLogic.validationError}`);
    }

    if (element.transformationLogic?.warnings) {
      warnings.push(...element.transformationLogic.warnings);
    }

    if (element.confidence !== undefined && element.confidence < 0.7) {
      warnings.push('Low confidence mapping - manual review recommended');
    }

    return warnings;
  };

  return (
    <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-purple-600" />
          Data Elements Mapping
        </CardTitle>
        <CardDescription>
          Review how your dataset columns map to the required analysis elements
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Data Engineer Mapping In Progress Indicator */}
        {isMapping && (
          <Alert className="bg-blue-50 border-blue-200">
            <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
            <AlertDescription className="flex items-center gap-2">
              <span className="font-medium text-blue-800">Data Engineer Agent is mapping elements to source fields...</span>
              <span className="text-blue-600 text-sm">This may take a few moments.</span>
            </AlertDescription>
          </Alert>
        )}

        {/* Summary - P1 FIX: Mutually exclusive categories based on calculationType */}
        {/* Categories: Direct Mapping (has source, no transform needed), Need Transform (has source, requires derivation), Missing (no source) */}
        <Alert className="bg-white">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription>
            {(() => {
              // P1 FIX: Compute mutually exclusive categories
              const categories = requiredDataElements.reduce((acc, el) => {
                // Check if element has a source mapping (normalize across field names)
                const mapping = mappings[el.elementId];
                const hasSource = !!(
                  el.sourceAvailable ||
                  el.sourceField ||
                  el.sourceColumn ||
                  mapping?.sourceField ||
                  (el.sourceColumns && el.sourceColumns.length > 0 && el.sourceColumns.some(sc => sc.matched))
                );

                // Check if transformation is required based on calculationType and derivation info
                // calculationType is nested under businessDefinition
                const calculationType = el.businessDefinition?.calculationType || 'direct';
                const requiresTransformation =
                  calculationType !== 'direct' ||
                  !!el.businessDefinition?.formula ||
                  !!el.transformationLogic ||
                  el.isComposite === true ||
                  el.transformationRequired === true;

                if (!hasSource && el.required !== false) {
                  acc.missing.push(el.elementId);
                } else if (hasSource && requiresTransformation) {
                  acc.needsTransform.push(el.elementId);
                } else if (hasSource) {
                  acc.directMapped.push(el.elementId);
                }
                // Non-required elements without source are ignored in counts

                return acc;
              }, { directMapped: [] as string[], needsTransform: [] as string[], missing: [] as string[] });

              const totalMapped = categories.directMapped.length + categories.needsTransform.length;
              const percentage = requiredDataElements.length > 0
                ? Math.round((totalMapped / requiredDataElements.length) * 100)
                : 0;

              // Debug logging for verification
              console.log('📊 [P1 FIX] Element categories:', {
                total: requiredDataElements.length,
                directMapped: categories.directMapped.length,
                needsTransform: categories.needsTransform.length,
                missing: categories.missing.length,
                // Sample elements in each category
                sampleNeedsTransform: categories.needsTransform.slice(0, 3)
              });

              return (
                <>
                  <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-lg font-bold text-gray-900">
                        {requiredDataElements.length}
                      </div>
                      <div className="text-xs text-gray-600">Total Elements</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${isMapping ? 'text-gray-400' : 'text-green-600'}`}>
                        {isMapping ? <Loader2 className="h-5 w-5 animate-spin inline" /> : categories.directMapped.length}
                      </div>
                      <div className="text-xs text-gray-600">Direct Mapping</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${isMapping ? 'text-gray-400' : 'text-yellow-600'}`}>
                        {isMapping ? '-' : categories.needsTransform.length}
                      </div>
                      <div className="text-xs text-gray-600">Need Transform</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${isMapping ? 'text-gray-400' : 'text-red-600'}`}>
                        {isMapping ? '-' : categories.missing.length}
                      </div>
                      <div className="text-xs text-gray-600">Missing</div>
                    </div>
                  </div>

                  {/* Mapping Progress Bar */}
                  {!isMapping && requiredDataElements.length > 0 && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Mapping Progress</span>
                        <span>{percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-green-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </AlertDescription>
        </Alert>

        {/* Required Elements Mapping */}
        {requiredElements.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Required Elements ({requiredElements.length})
            </h3>
            <div className="space-y-3">
              {requiredElements.map((element) => {
                const status = getMappingStatus(element);
                const isEditing = editingElement === element.elementId;
                const mapping = mappings[element.elementId] || {};

                return (
                  <div
                    key={element.elementId}
                    className="bg-white rounded-lg border border-gray-200 p-4"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h4 className="font-medium text-sm text-gray-900">
                            {element.elementName}
                          </h4>
                          <Badge variant="outline" className="text-xs">
                            {element.dataType}
                          </Badge>
                          {getStatusBadge(status)}
                          {getConfidenceBadge(element.confidence)}
                        </div>
                        <p className="text-xs text-gray-600">{element.description}</p>
                        {getValidationWarnings(element).length > 0 && (
                          <Alert className="mt-2 bg-yellow-50 border-yellow-200">
                            <AlertCircle className="h-4 w-4 text-yellow-600" />
                            <AlertDescription className="text-xs">
                              <ul className="list-disc list-inside space-y-1">
                                {getValidationWarnings(element).map((warning, idx) => (
                                  <li key={idx}>{warning}</li>
                                ))}
                              </ul>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                      {!isEditing && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditElement(element.elementId)}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Edit
                        </Button>
                      )}
                    </div>

                    {/* Mapping Details */}
                    <div className="space-y-3">
                      {/* Business Definition from BA Agent - Industry-standard formulas */}
                      {element.businessDefinition && (
                        <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                          <div className="flex items-center gap-2 mb-2">
                            <BookOpen className="w-4 h-4 text-emerald-600" />
                            <span className="text-sm font-medium text-emerald-900">
                              Business Definition
                            </span>
                            <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-800 border-emerald-300">
                              {element.businessDefinition.calculationType}
                            </Badge>
                            {element.businessDefinition.source === 'exact' && (
                              <Badge className="text-xs bg-green-100 text-green-800">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Verified
                              </Badge>
                            )}
                            {element.businessDefinition.source === 'ai_inferred' && (
                              <Badge className="text-xs bg-amber-100 text-amber-800">
                                <Beaker className="w-3 h-3 mr-1" />
                                AI Inferred
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-emerald-800 mb-2">
                            {element.businessDefinition.businessDescription}
                          </p>
                          {element.businessDefinition.formula && (
                            <div className="text-xs font-mono bg-white p-2 rounded border border-emerald-200 text-emerald-700 mb-2">
                              <strong>Standard Formula:</strong> {element.businessDefinition.formula}
                            </div>
                          )}
                          {element.businessDefinition.componentFields && element.businessDefinition.componentFields.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              <span className="text-xs text-emerald-600 font-medium">Expected fields:</span>
                              {element.businessDefinition.componentFields.map((field, idx) => (
                                <Badge key={idx} variant="outline" className="text-xs bg-white">
                                  {field}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {element.businessDefinition.aggregationMethod && (
                            <p className="text-xs text-emerald-600 mt-2">
                              <strong>Aggregation:</strong> {element.businessDefinition.aggregationMethod}
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2 text-xs text-emerald-500">
                            <Info className="w-3 h-3" />
                            <span>
                              {Math.round(element.businessDefinition.confidence * 100)}% confidence
                              {element.businessDefinition.industry && ` • ${element.businessDefinition.industry} industry`}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Show message when no business definition is available */}
                      {!element.businessDefinition && element.hasBusinessDefinition === false && (
                        <Alert className="bg-gray-50 border-gray-200">
                          <Info className="h-4 w-4 text-gray-500" />
                          <AlertDescription className="text-xs text-gray-600">
                            No standard business definition found for this element.
                            The mapping will be based on column name matching only.
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* DS Agent Calculation Definition - Show how this should be calculated */}
                      {(element as any).calculationDefinition && (
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Lightbulb className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-900">
                              Data Scientist Recommendation
                            </span>
                            <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 border-blue-300">
                              {/* FIX: Safely render calculationType - ensure it's a string */}
                              {typeof (element as any).calculationDefinition.calculationType === 'string'
                                ? (element as any).calculationDefinition.calculationType
                                : 'derived'}
                            </Badge>
                          </div>
                          {/* FIX: Safely render formula properties - check they're strings before rendering */}
                          {(element as any).calculationDefinition.formula?.businessDescription &&
                           typeof (element as any).calculationDefinition.formula.businessDescription === 'string' && (
                            <p className="text-sm text-blue-800 mb-2">
                              <strong>How to calculate:</strong> {(element as any).calculationDefinition.formula.businessDescription}
                            </p>
                          )}
                          {(element as any).calculationDefinition.formula?.pseudoCode &&
                           typeof (element as any).calculationDefinition.formula.pseudoCode === 'string' && (
                            <p className="text-xs font-mono bg-white p-2 rounded border border-blue-200 text-blue-700">
                              {(element as any).calculationDefinition.formula.pseudoCode}
                            </p>
                          )}
                          {(element as any).calculationDefinition.comparisonGroups &&
                           typeof (element as any).calculationDefinition.comparisonGroups === 'object' && (
                            <p className="text-xs text-blue-700 mt-2">
                              <strong>For comparison:</strong> Group by {String((element as any).calculationDefinition.comparisonGroups.groupingField || 'selected field')} ({String((element as any).calculationDefinition.comparisonGroups.comparisonType || 'comparison')})
                            </p>
                          )}
                          {/* FIX: Safely render notes - ensure it's a string, not an object */}
                          {(element as any).calculationDefinition.notes &&
                           typeof (element as any).calculationDefinition.notes === 'string' && (
                            <p className="text-xs text-blue-600 mt-2 italic">
                              {(element as any).calculationDefinition.notes}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Source Field Mapping - Enhanced for composite elements */}
                      {element.isComposite && element.sourceColumns && element.sourceColumns.length > 0 ? (
                        // Composite element: Show multiple source columns
                        <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Database className="w-4 h-4 text-indigo-600" />
                            <span className="text-sm font-medium text-indigo-900">
                              Source Columns ({element.sourceColumns.filter(sc => sc.matched).length}/{element.sourceColumns.length} mapped)
                            </span>
                            <Badge variant="outline" className="text-xs bg-indigo-100 text-indigo-800 border-indigo-300">
                              Composite Element
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            {element.sourceColumns.map((sc, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <span className="text-indigo-600 font-medium min-w-[120px]">
                                  {sc.componentField}:
                                </span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                {sc.matched ? (
                                  <span className="flex items-center gap-2">
                                    <Badge className="bg-green-100 text-green-800 border-green-300">
                                      {sc.matchedColumn}
                                    </Badge>
                                    <span className="text-xs text-gray-500">
                                      ({Math.round(sc.matchConfidence)}% match)
                                    </span>
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-amber-600">
                                    <AlertCircle className="w-3 h-3" />
                                    <span className="text-xs">Not mapped - select column</span>
                                    {isEditing && (
                                      <select
                                        className="ml-2 border rounded px-2 py-1 text-xs"
                                        onChange={(e) => {
                                          // Update this component field mapping
                                          console.log(`Map ${sc.componentField} to ${e.target.value}`);
                                        }}
                                      >
                                        <option value="">Select...</option>
                                        {availableColumns.map((col) => (
                                          <option key={col} value={col}>{col}</option>
                                        ))}
                                      </select>
                                    )}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                          {/* Show aggregation method if applicable */}
                          {(element as any).calculationDefinition?.formula?.aggregationMethod && (
                            <div className="mt-2 pt-2 border-t border-indigo-200 text-xs text-indigo-700">
                              <strong>Aggregation:</strong> {(element as any).calculationDefinition.formula.aggregationMethod}
                            </div>
                          )}
                        </div>
                      ) : (
                        // Simple element: Single source column
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600 w-32">Source Column:</span>
                          {isEditing ? (
                            <select
                              className="flex-1 border rounded px-2 py-1 text-sm"
                              value={mapping.sourceField || element.sourceField || ''}
                              onChange={(e) => handleMappingChange(element.elementId, 'sourceField', e.target.value)}
                            >
                              <option value="">Select column...</option>
                              {availableColumns.map((col) => (
                                <option key={col} value={col}>
                                  {col}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-medium text-gray-900">
                              {mapping.sourceField || element.sourceField || (
                                <span className="text-red-600 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" />
                                  Not mapped
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Business Definition Validation Results */}
                      {definitionValidations[element.elementId] && (
                        <div className="mt-2">
                          {definitionValidations[element.elementId].isValidating ? (
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Validating against business definition...
                            </div>
                          ) : definitionValidations[element.elementId].result ? (
                            <div className={`rounded-lg p-2 border text-xs ${
                              definitionValidations[element.elementId].result?.isValid
                                ? 'bg-green-50 border-green-200'
                                : 'bg-amber-50 border-amber-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                {definitionValidations[element.elementId].result?.isValid ? (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                                    <span className="font-medium text-green-800">Mapping Validated</span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-3 h-3 text-amber-600" />
                                    <span className="font-medium text-amber-800">Review Recommended</span>
                                  </>
                                )}
                              </div>

                              {/* Matched fields */}
                              {(definitionValidations[element.elementId].result?.matchedFields?.length ?? 0) > 0 && (
                                <div className="text-green-700 mb-1">
                                  <strong>Matched:</strong> {definitionValidations[element.elementId].result?.matchedFields?.join(', ')}
                                </div>
                              )}

                              {/* Missing fields warning */}
                              {(definitionValidations[element.elementId].result?.missingFields?.length ?? 0) > 0 && (
                                <div className="text-amber-700 mb-1">
                                  <strong>Missing:</strong> {definitionValidations[element.elementId].result?.missingFields?.join(', ')}
                                </div>
                              )}

                              {/* Warnings */}
                              {(definitionValidations[element.elementId].result?.warnings?.length ?? 0) > 0 && (
                                <ul className="list-disc list-inside text-amber-600 space-y-0.5">
                                  {definitionValidations[element.elementId].result?.warnings?.map((w, idx) => (
                                    <li key={idx}>{w}</li>
                                  ))}
                                </ul>
                              )}

                              {/* Suggestions */}
                              {(definitionValidations[element.elementId].result?.suggestions?.length ?? 0) > 0 && (
                                <div className="mt-1 pt-1 border-t border-gray-200">
                                  <span className="text-blue-700 font-medium">Suggestions:</span>
                                  <ul className="list-disc list-inside text-blue-600 space-y-0.5">
                                    {definitionValidations[element.elementId].result?.suggestions?.map((s, idx) => (
                                      <li key={idx}>{s}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Suggested formula */}
                              {definitionValidations[element.elementId].result?.suggestedFormula && (
                                <div className="mt-1 font-mono bg-white p-1 rounded border border-gray-200 text-gray-700">
                                  <strong>Suggested:</strong> {definitionValidations[element.elementId].result?.suggestedFormula}
                                </div>
                              )}
                            </div>
                          ) : definitionValidations[element.elementId].error ? (
                            <div className="text-xs text-red-600">
                              Validation error: {definitionValidations[element.elementId].error}
                            </div>
                          ) : null}
                        </div>
                      )}

                      {/* Natural Language Transformation Input */}
                      {isEditing && (
                        <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Code className="w-4 h-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-900">
                              Describe Your Transformation
                            </span>
                          </div>
                          <p className="text-xs text-purple-700 mb-2">
                            Tell us in plain English how to calculate this element. Examples:
                          </p>
                          <ul className="text-xs text-purple-600 mb-3 list-disc list-inside space-y-1">
                            <li>"Count user survey scores for Q1, Q2 and Q3 and average to get engagement score"</li>
                            <li>"Calculate total by multiplying quantity by price"</li>
                            <li>"Convert date from MM/DD/YYYY to YYYY-MM-DD format"</li>
                            <li>"Categorize values: High if greater than 80, Medium if 50-80, Low otherwise"</li>
                          </ul>
                          <Textarea
                            placeholder="Describe your transformation in plain English..."
                            value={mapping.transformationDescription || element.transformationLogic?.description || ''}
                            onChange={(e) => handleMappingChange(element.elementId, 'transformationDescription', e.target.value)}
                            rows={3}
                            className="text-sm bg-white"
                          />

                          {/* AI Generation Button */}
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-purple-100 hover:bg-purple-200 text-purple-800 border-purple-300"
                              onClick={() => handleInterpretTransformation(element)}
                              disabled={
                                aiStates[element.elementId]?.isGenerating ||
                                !mapping.transformationDescription ||
                                mapping.transformationDescription.trim().length < 5
                              }
                            >
                              {aiStates[element.elementId]?.isGenerating ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Wand2 className="w-3 h-3 mr-1" />
                                  Generate Code
                                </>
                              )}
                            </Button>

                            {mapping.transformationCode && sampleData?.length && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-green-100 hover:bg-green-200 text-green-800 border-green-300"
                                onClick={() => handleValidateTransformation(element)}
                                disabled={aiStates[element.elementId]?.isValidating}
                              >
                                {aiStates[element.elementId]?.isValidating ? (
                                  <>
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                    Validating...
                                  </>
                                ) : (
                                  <>
                                    <PlayCircle className="w-3 h-3 mr-1" />
                                    Test Code
                                  </>
                                )}
                              </Button>
                            )}
                          </div>

                          {/* AI Error Message */}
                          {aiStates[element.elementId]?.lastError && (
                            <Alert className="mt-2 bg-red-50 border-red-200">
                              <AlertCircle className="h-4 w-4 text-red-600" />
                              <AlertDescription className="text-xs text-red-700">
                                {aiStates[element.elementId].lastError}
                              </AlertDescription>
                            </Alert>
                          )}

                          {/* Validation Results */}
                          {aiStates[element.elementId]?.validationResults && (
                            <div className={`mt-2 p-2 rounded border ${
                              aiStates[element.elementId].validationResults?.isValid
                                ? 'bg-green-50 border-green-200'
                                : 'bg-yellow-50 border-yellow-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                {aiStates[element.elementId].validationResults?.isValid ? (
                                  <>
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    <span className="text-xs font-medium text-green-800">
                                      Validation Passed
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                                    <span className="text-xs font-medium text-yellow-800">
                                      Some rows had issues
                                    </span>
                                  </>
                                )}
                              </div>
                              {aiStates[element.elementId]?.validationResults?.sampleOutputs?.length ? (
                                <div className="text-xs text-gray-600">
                                  <span className="font-medium">Sample outputs: </span>
                                  {aiStates[element.elementId]?.validationResults?.sampleOutputs
                                    ?.slice(0, 3)
                                    .map((output, i) => (
                                      <Badge key={i} variant="outline" className="mx-1">
                                        {String(output ?? 'null')}
                                      </Badge>
                                    ))
                                  }
                                </div>
                              ) : null}
                            </div>
                          )}

                          {/* Generated Code Preview */}
                          {mapping.transformationCode && (
                            <div className="mt-3 p-2 bg-gray-800 rounded">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-gray-400">Generated JavaScript</span>
                                <Badge variant="outline" className="text-xs bg-gray-700 text-gray-300 border-gray-600">
                                  AI Generated
                                </Badge>
                              </div>
                              <pre className="text-xs font-mono text-green-400 overflow-x-auto whitespace-pre-wrap">
                                {mapping.transformationCode}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Display existing transformation if not editing */}
                      {!isEditing && (element.transformationRequired || mapping.transformationDescription) && (
                        <div className="border-t pt-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Code className="w-4 h-4 text-purple-600" />
                            <span className="text-sm font-medium text-gray-900">
                              Transformation Logic
                            </span>
                          </div>
                          <p className="text-sm text-gray-700">
                            {mapping.transformationDescription || element.transformationLogic?.description || 'No transformation defined'}
                          </p>
                          {(mapping.transformationCode || element.transformationLogic?.code) && (
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono overflow-x-auto">
                              {mapping.transformationCode || element.transformationLogic?.code}
                            </pre>
                          )}
                        </div>
                      )}

                      {/* Optional: Show technical code field when editing */}
                      {isEditing && (
                        <details className="text-xs">
                          <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                            Advanced: Edit generated code
                          </summary>
                          <Textarea
                            placeholder="Generated transformation code (auto-filled by Data Engineer agent)"
                            value={mapping.transformationCode || element.transformationLogic?.code || ''}
                            onChange={(e) => handleMappingChange(element.elementId, 'transformationCode', e.target.value)}
                            rows={3}
                            className="font-mono text-xs mt-2"
                          />
                        </details>
                      )}

                      {/* Alternatives */}
                      {element.alternatives && element.alternatives.length > 0 && (
                        <div className="border-t pt-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Lightbulb className="w-4 h-4 text-yellow-600" />
                            <span className="text-sm font-medium text-gray-900">
                              Alternative Mappings
                            </span>
                          </div>
                          <div className="space-y-1">
                            {element.alternatives.map((alt, idx) => (
                              <div key={idx} className="text-xs text-gray-600 flex items-center gap-2">
                                <ArrowRight className="w-3 h-3" />
                                <span className="font-medium">{alt.sourceField}</span>
                                <Badge variant="outline" className="text-xs">
                                  {Math.round(alt.confidence * 100)}% match
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Edit Actions */}
                      {isEditing && (
                        <div className="flex items-center gap-2 pt-3 border-t">
                          <Button
                            size="sm"
                            onClick={() => handleSaveElement(element.elementId)}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save Mapping
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCancelEdit}
                          >
                            <X className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Optional Elements (Collapsed by default) */}
        {optionalElements.length > 0 && (
          <details className="bg-white rounded-lg border border-gray-200 p-4">
            <summary className="cursor-pointer font-medium text-sm text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-600" />
              Optional Elements ({optionalElements.length})
            </summary>
            <div className="mt-3 space-y-2">
              {optionalElements.map((element) => (
                <div key={element.elementId} className="text-sm p-2 bg-gray-50 rounded">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{element.elementName}</span>
                    <span className="text-xs text-gray-600">
                      {element.sourceAvailable ? '✓ Available' : '✗ Not found'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
