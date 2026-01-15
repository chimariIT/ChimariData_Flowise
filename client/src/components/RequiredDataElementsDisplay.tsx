import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Database,
  FileText,
  Target,
  Lightbulb,
  CheckCircle,
  AlertCircle,
  BarChart3,
  TrendingUp,
  Clock
} from "lucide-react";

interface RequiredDataElement {
  elementId: string;
  elementName: string;
  description: string;
  dataType: 'numeric' | 'categorical' | 'datetime' | 'text' | 'boolean' | 'geospatial';
  purpose: string;
  analysisUsage: string[];
  required: boolean;
  // Question linkage for traceability
  relatedQuestions?: string[];
  sourceField?: string;
  sourceAvailable?: boolean;
}

interface AnalysisPath {
  analysisId: string;
  analysisName: string;
  analysisType: 'descriptive' | 'diagnostic' | 'predictive' | 'prescriptive';
  description: string;
  techniques: string[];
  estimatedDuration: string;
  expectedArtifacts: Array<{
    artifactType: 'visualization' | 'model' | 'report' | 'dashboard' | 'metric';
    description: string;
  }>;
}

interface RequiredDataElementsDisplayProps {
  analysisPath: AnalysisPath[];
  requiredDataElements: RequiredDataElement[];
  completeness?: {
    totalElements: number;
    elementsMapped: number;
    elementsWithTransformation: number;
    readyForExecution: boolean;
  };
  status?: string;
}

const getDataTypeIcon = (type: string) => {
  switch (type) {
    case 'numeric':
      return <BarChart3 className="w-3 h-3" />;
    case 'datetime':
      return <Clock className="w-3 h-3" />;
    case 'categorical':
      return <Database className="w-3 h-3" />;
    default:
      return <FileText className="w-3 h-3" />;
  }
};

const getDataTypeBadgeColor = (type: string) => {
  switch (type) {
    case 'numeric':
      return 'bg-blue-100 text-blue-800';
    case 'datetime':
      return 'bg-purple-100 text-purple-800';
    case 'categorical':
      return 'bg-green-100 text-green-800';
    case 'text':
      return 'bg-gray-100 text-gray-800';
    case 'boolean':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

const getAnalysisTypeIcon = (type: string) => {
  switch (type) {
    case 'descriptive':
      return <BarChart3 className="w-4 h-4 text-blue-600" />;
    case 'diagnostic':
      return <Target className="w-4 h-4 text-purple-600" />;
    case 'predictive':
      return <TrendingUp className="w-4 h-4 text-green-600" />;
    case 'prescriptive':
      return <Lightbulb className="w-4 h-4 text-orange-600" />;
    default:
      return <BarChart3 className="w-4 h-4 text-gray-600" />;
  }
};

export function RequiredDataElementsDisplay({
  analysisPath,
  requiredDataElements,
  completeness,
  status
}: RequiredDataElementsDisplayProps) {
  const requiredElements = requiredDataElements.filter(e => e.required);
  const optionalElements = requiredDataElements.filter(e => !e.required);

  return (
    <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5 text-blue-600" />
          Required Data Elements
        </CardTitle>
        <CardDescription>
          Based on your analysis goals, we've identified the data elements you'll need
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Analysis Path Summary */}
        {analysisPath && analysisPath.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-blue-600" />
              Recommended Analysis Approach
            </h3>
            <div className="space-y-2">
              {analysisPath.map((analysis) => (
                <div
                  key={analysis.analysisId}
                  className="bg-white rounded-lg border border-blue-200 p-3"
                >
                  <div className="flex items-start gap-2 mb-2">
                    {getAnalysisTypeIcon(analysis.analysisType)}
                    <div className="flex-1">
                      <h4 className="font-medium text-sm text-gray-900">
                        {analysis.analysisName}
                      </h4>
                      <p className="text-xs text-gray-600 mt-1">
                        {analysis.description}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {analysis.estimatedDuration}
                    </Badge>
                  </div>
                  {analysis.techniques.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {analysis.techniques.map((technique: any, idx: number) => {
                        // Handle both string and object format
                        const techniqueName = typeof technique === 'string'
                          ? technique
                          : (technique.name || technique.technique || technique.type || 'Unknown');
                        return (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="text-xs bg-blue-100 text-blue-700"
                          >
                            {techniqueName.replace(/_/g, ' ')}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Required Data Elements */}
        {requiredElements.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Required Data Elements ({requiredElements.length})
            </h3>
            <Alert className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-sm text-blue-800">
                Your uploaded dataset must contain these elements for the analysis to proceed
              </AlertDescription>
            </Alert>
            <div className="grid gap-2">
              {requiredElements.map((element) => (
                <div
                  key={element.elementId}
                  className="bg-white rounded-lg border border-gray-200 p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm text-gray-900">
                          {element.elementName}
                        </h4>
                        <Badge className={`text-xs ${getDataTypeBadgeColor(element.dataType)}`}>
                          {getDataTypeIcon(element.dataType)}
                          <span className="ml-1">{element.dataType}</span>
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600">{element.description}</p>
                    </div>
                    <Badge variant="destructive" className="text-xs">
                      Required
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 mt-2">
                    <span className="font-medium">Purpose:</span> {element.purpose}
                  </div>
                  {/* Show related questions - key traceability feature */}
                  {element.relatedQuestions && element.relatedQuestions.length > 0 && (
                    <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100">
                      <div className="text-xs font-medium text-blue-800 mb-1">
                        Answers these questions:
                      </div>
                      <ul className="text-xs text-blue-700 space-y-1">
                        {element.relatedQuestions.slice(0, 3).map((q, idx) => (
                          <li key={idx} className="flex items-start gap-1">
                            <span className="text-blue-500">•</span>
                            <span className="line-clamp-2">{q}</span>
                          </li>
                        ))}
                        {element.relatedQuestions.length > 3 && (
                          <li className="text-blue-500 italic">
                            +{element.relatedQuestions.length - 3} more questions
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                  {/* Show source field mapping if available */}
                  {element.sourceField && (
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant={element.sourceAvailable ? "default" : "secondary"} className="text-xs">
                        {element.sourceAvailable ? "✓ Mapped to:" : "Needs mapping:"} {element.sourceField}
                      </Badge>
                    </div>
                  )}
                  {element.analysisUsage.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {element.analysisUsage.map((usage, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {usage}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Optional Data Elements */}
        {optionalElements.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-600" />
              Optional Data Elements ({optionalElements.length})
            </h3>
            <Alert>
              <AlertDescription className="text-sm text-gray-700">
                These elements would enhance the analysis but are not strictly required
              </AlertDescription>
            </Alert>
            <div className="grid gap-2">
              {optionalElements.map((element) => (
                <div
                  key={element.elementId}
                  className="bg-white rounded-lg border border-gray-200 p-3 opacity-90"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm text-gray-900">
                          {element.elementName}
                        </h4>
                        <Badge className={`text-xs ${getDataTypeBadgeColor(element.dataType)}`}>
                          {element.dataType}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600">{element.description}</p>
                      <div className="text-xs text-gray-600 mt-2">
                        <span className="font-medium">Purpose:</span> {element.purpose}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Optional
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completeness Summary */}
        {completeness && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              Progress Summary
            </h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {completeness.totalElements}
                </div>
                <div className="text-xs text-gray-600">Total Elements</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {completeness.elementsMapped}
                </div>
                <div className="text-xs text-gray-600">Mapped</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {completeness.elementsWithTransformation}
                </div>
                <div className="text-xs text-gray-600">Need Transform</div>
              </div>
            </div>
          </div>
        )}

        {/* Next Steps */}
        <Alert className="bg-gradient-to-r from-blue-100 to-indigo-100 border-blue-300">
          <FileText className="h-4 w-4 text-blue-700" />
          <AlertDescription className="text-sm text-blue-900">
            <strong>Next:</strong> We'll map these required elements to your uploaded data columns and identify any transformations needed to prepare your data for analysis.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
