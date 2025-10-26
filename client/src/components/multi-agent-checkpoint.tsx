// client/src/components/multi-agent-checkpoint.tsx

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp, 
  Database, 
  Brain, 
  Briefcase,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  Sparkles,
  Clock,
  DollarSign,
  Target,
  AlertCircle
} from 'lucide-react';

interface ExpertOpinion {
  agentId: 'data_engineer' | 'data_scientist' | 'business_agent';
  agentName: string;
  opinion: any;
  confidence: number;
  timestamp: string;
  responseTime: number;
}

interface SynthesizedRecommendation {
  overallAssessment: 'proceed' | 'proceed_with_caution' | 'revise_approach' | 'not_feasible';
  confidence: number;
  keyFindings: string[];
  combinedRisks: Array<{ source: string; risk: string; severity: 'high' | 'medium' | 'low' }>;
  actionableRecommendations: string[];
  expertConsensus: {
    dataQuality: 'good' | 'acceptable' | 'poor';
    technicalFeasibility: 'feasible' | 'challenging' | 'not_feasible';
    businessValue: 'high' | 'medium' | 'low';
  };
  estimatedTimeline: string;
  estimatedCost?: string;
}

interface MultiAgentCoordinationResult {
  coordinationId: string;
  projectId: string;
  expertOpinions: ExpertOpinion[];
  synthesis: SynthesizedRecommendation;
  timestamp: string;
  totalResponseTime: number;
}

interface MultiAgentCheckpointProps {
  checkpointId: string;
  projectId: string;
  message: string;
  coordinationResult: MultiAgentCoordinationResult;
  onFeedback: (feedback: string, approved: boolean) => void;
  isPending?: boolean;
}

const assessmentConfig = {
  proceed: {
    color: 'bg-green-100 text-green-800 border-green-200',
    icon: CheckCircle,
    label: 'Proceed with Analysis',
    description: 'All systems green! Ready to move forward.'
  },
  proceed_with_caution: {
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    icon: AlertTriangle,
    label: 'Proceed with Caution',
    description: 'Some concerns identified. Review recommendations carefully.'
  },
  revise_approach: {
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    icon: AlertCircle,
    label: 'Revise Approach',
    description: 'Consider adjustments before proceeding.'
  },
  not_feasible: {
    color: 'bg-red-100 text-red-800 border-red-200',
    icon: AlertCircle,
    label: 'Not Feasible',
    description: 'Significant issues detected. Major changes needed.'
  }
};

const agentConfig = {
  data_engineer: {
    name: 'Data Engineer',
    icon: Database,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200'
  },
  data_scientist: {
    name: 'Data Scientist',
    icon: Brain,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200'
  },
  business_agent: {
    name: 'Business Analyst',
    icon: Briefcase,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200'
  }
};

const qualityConfig = {
  good: { color: 'text-green-600', label: 'Good', icon: CheckCircle },
  acceptable: { color: 'text-yellow-600', label: 'Acceptable', icon: AlertTriangle },
  poor: { color: 'text-red-600', label: 'Poor', icon: AlertCircle }
};

const valueConfig = {
  high: { color: 'text-green-600', label: 'High', icon: TrendingUp },
  medium: { color: 'text-yellow-600', label: 'Medium', icon: Target },
  low: { color: 'text-gray-600', label: 'Low', icon: TrendingUp }
};

const feasibilityConfig = {
  feasible: { color: 'text-green-600', label: 'Feasible', icon: CheckCircle },
  challenging: { color: 'text-yellow-600', label: 'Challenging', icon: AlertTriangle },
  not_feasible: { color: 'text-red-600', label: 'Not Feasible', icon: AlertCircle }
};

const severityConfig = {
  high: { color: 'text-red-600', bgColor: 'bg-red-50' },
  medium: { color: 'text-yellow-600', bgColor: 'bg-yellow-50' },
  low: { color: 'text-gray-600', bgColor: 'bg-gray-50' }
};

function ExpertOpinionCard({ opinion }: { opinion: ExpertOpinion }) {
  const [expanded, setExpanded] = useState(false);
  const config = agentConfig[opinion.agentId];
  const AgentIcon = config.icon;

  // Extract key metrics from opinion based on agent type
  const getOpinionSummary = () => {
    if (opinion.agentId === 'data_engineer') {
      return {
        title: 'Data Quality Assessment',
        score: opinion.opinion?.overallScore ? `${Math.round(opinion.opinion.overallScore * 100)}%` : 'N/A',
        mainMetric: 'Quality Score',
        issues: opinion.opinion?.issues?.length || 0,
        recommendations: opinion.opinion?.recommendations || []
      };
    } else if (opinion.agentId === 'data_scientist') {
      return {
        title: 'Feasibility Analysis',
        score: opinion.opinion?.feasible ? 'Feasible' : 'Not Feasible',
        mainMetric: 'Technical Feasibility',
        issues: opinion.opinion?.concerns?.length || 0,
        recommendations: opinion.opinion?.recommendations || []
      };
    } else {
      return {
        title: 'Business Impact Assessment',
        score: opinion.opinion?.businessValue || 'N/A',
        mainMetric: 'Business Value',
        issues: opinion.opinion?.risks?.length || 0,
        recommendations: opinion.opinion?.recommendations || []
      };
    }
  };

  const summary = getOpinionSummary();

  return (
    <Card className={`${config.borderColor} border-2 transition-all hover:shadow-md`}>
      <CardHeader className={`${config.bgColor} pb-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg bg-white ${config.color}`}>
              <AgentIcon className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base">{config.name}</CardTitle>
              <p className="text-xs text-gray-600 mt-0.5">{summary.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {Math.round(opinion.confidence * 100)}% confident
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        {/* Quick Summary */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">{summary.mainMetric}</span>
            <span className={`text-sm font-bold ${config.color}`}>{summary.score}</span>
          </div>
          
          {summary.issues > 0 && (
            <div className="text-xs text-gray-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {summary.issues} {summary.issues === 1 ? 'issue' : 'issues'} identified
            </div>
          )}
        </div>

        {/* Top Recommendations */}
        {summary.recommendations.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-600 mb-2">Top Recommendations:</p>
            <ul className="space-y-1.5">
              {summary.recommendations.slice(0, expanded ? undefined : 2).map((rec: string, i: number) => (
                <li key={i} className="text-xs text-gray-700 flex items-start gap-2">
                  <CheckCircle className="w-3 h-3 mt-0.5 text-green-600 flex-shrink-0" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Expand/Collapse Button */}
        {(summary.recommendations.length > 2 || expanded) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
            className="w-full mt-2 text-xs"
          >
            {expanded ? (
              <>
                <ChevronUp className="w-3 h-3 mr-1" />
                Show Less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3 mr-1" />
                Show More
              </>
            )}
          </Button>
        )}

        {/* Detailed View */}
        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-3">
            {/* Data Engineer Details */}
            {opinion.agentId === 'data_engineer' && opinion.opinion && (
              <>
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1">Completeness:</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all"
                        style={{ width: `${(opinion.opinion.completeness || 0) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">{Math.round((opinion.opinion.completeness || 0) * 100)}%</span>
                  </div>
                </div>

                {opinion.opinion.issues && opinion.opinion.issues.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Issues Found:</p>
                    <div className="space-y-1.5">
                      {opinion.opinion.issues.map((issue: any, i: number) => (
                        <div key={i} className={`text-xs p-2 rounded ${severityConfig[issue.severity as keyof typeof severityConfig]?.bgColor || 'bg-gray-50'}`}>
                          <span className="font-medium">{issue.type || 'Issue'}:</span> {issue.affected} ({issue.count} occurrences)
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {opinion.opinion.estimatedFixTime && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Clock className="w-3 h-3" />
                    <span>Estimated fix time: {opinion.opinion.estimatedFixTime}</span>
                  </div>
                )}
              </>
            )}

            {/* Data Scientist Details */}
            {opinion.agentId === 'data_scientist' && opinion.opinion && (
              <>
                {opinion.opinion.requiredAnalyses && opinion.opinion.requiredAnalyses.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Required Analyses:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {opinion.opinion.requiredAnalyses.map((analysis: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {analysis}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {opinion.opinion.dataRequirements && (
                  <div className="space-y-2">
                    {opinion.opinion.dataRequirements.met && opinion.opinion.dataRequirements.met.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-600 mb-1">✓ Requirements Met:</p>
                        <div className="text-xs text-gray-700 space-y-1">
                          {opinion.opinion.dataRequirements.met.map((req: string, i: number) => (
                            <div key={i}>• {req}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {opinion.opinion.dataRequirements.missing && opinion.opinion.dataRequirements.missing.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-red-600 mb-1">✗ Missing Requirements:</p>
                        <div className="text-xs text-gray-700 space-y-1">
                          {opinion.opinion.dataRequirements.missing.map((req: string, i: number) => (
                            <div key={i}>• {req}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {opinion.opinion.dataRequirements.canDerive && opinion.opinion.dataRequirements.canDerive.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-blue-600 mb-1">⚡ Can Derive:</p>
                        <div className="text-xs text-gray-700 space-y-1">
                          {opinion.opinion.dataRequirements.canDerive.map((req: string, i: number) => (
                            <div key={i}>• {req}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {opinion.opinion.estimatedDuration && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Clock className="w-3 h-3" />
                    <span>Estimated duration: {opinion.opinion.estimatedDuration}</span>
                  </div>
                )}
              </>
            )}

            {/* Business Agent Details */}
            {opinion.agentId === 'business_agent' && opinion.opinion && (
              <>
                {opinion.opinion.alignment && (
                  <div>
                    <p className="text-xs font-medium text-gray-600 mb-2">Alignment Scores:</p>
                    <div className="space-y-2">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Goals Alignment</span>
                          <span className="font-medium">{Math.round(opinion.opinion.alignment.goals * 100)}%</span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-green-600 h-1.5 rounded-full"
                            style={{ width: `${opinion.opinion.alignment.goals * 100}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Industry Alignment</span>
                          <span className="font-medium">{Math.round(opinion.opinion.alignment.industry * 100)}%</span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-green-600 h-1.5 rounded-full"
                            style={{ width: `${opinion.opinion.alignment.industry * 100}%` }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span>Best Practices</span>
                          <span className="font-medium">{Math.round(opinion.opinion.alignment.bestPractices * 100)}%</span>
                        </div>
                        <div className="bg-gray-200 rounded-full h-1.5">
                          <div 
                            className="bg-green-600 h-1.5 rounded-full"
                            style={{ width: `${opinion.opinion.alignment.bestPractices * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {opinion.opinion.benefits && opinion.opinion.benefits.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-green-600 mb-2">Expected Benefits:</p>
                    <ul className="space-y-1">
                      {opinion.opinion.benefits.map((benefit: string, i: number) => (
                        <li key={i} className="text-xs text-gray-700 flex items-start gap-2">
                          <TrendingUp className="w-3 h-3 mt-0.5 text-green-600 flex-shrink-0" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {opinion.opinion.risks && opinion.opinion.risks.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-red-600 mb-2">Identified Risks:</p>
                    <ul className="space-y-1">
                      {opinion.opinion.risks.map((risk: string, i: number) => (
                        <li key={i} className="text-xs text-gray-700 flex items-start gap-2">
                          <AlertTriangle className="w-3 h-3 mt-0.5 text-red-600 flex-shrink-0" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {opinion.opinion.expectedROI && (
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <DollarSign className="w-3 h-3" />
                    <span>Expected ROI: <span className="font-medium">{opinion.opinion.expectedROI}</span></span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MultiAgentCheckpoint({
  checkpointId,
  projectId,
  message,
  coordinationResult,
  onFeedback,
  isPending = false
}: MultiAgentCheckpointProps) {
  const [feedbackText, setFeedbackText] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  const { synthesis, expertOpinions, totalResponseTime } = coordinationResult;
  const assessmentInfo = assessmentConfig[synthesis.overallAssessment];
  const AssessmentIcon = assessmentInfo.icon;

  const qualityInfo = qualityConfig[synthesis.expertConsensus.dataQuality];
  const feasibilityInfo = feasibilityConfig[synthesis.expertConsensus.technicalFeasibility];
  const valueInfo = valueConfig[synthesis.expertConsensus.businessValue];
  const QualityIcon = qualityInfo.icon;
  const FeasibilityIcon = feasibilityInfo.icon;
  const ValueIcon = valueInfo.icon;

  return (
    <div className="space-y-4">
      {/* Overall Assessment Header */}
      <Card className={`border-2 ${assessmentInfo.color.split(' ')[0]} shadow-lg`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className={`p-3 rounded-xl ${assessmentInfo.color} border-2`}>
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg mb-1">Multi-Agent Analysis Complete</CardTitle>
                <p className="text-sm text-gray-600">{message}</p>
              </div>
            </div>
            <Badge className={`${assessmentInfo.color} border text-sm px-3 py-1`}>
              {Math.round(synthesis.confidence * 100)}% confident
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {/* Overall Assessment Banner */}
          <div className={`${assessmentInfo.color} border-2 rounded-lg p-4 mb-4`}>
            <div className="flex items-center gap-3 mb-2">
              <AssessmentIcon className="w-6 h-6" />
              <div>
                <h3 className="font-bold text-base">{assessmentInfo.label}</h3>
                <p className="text-xs mt-0.5">{assessmentInfo.description}</p>
              </div>
            </div>
          </div>

          {/* Expert Consensus Summary */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <QualityIcon className={`w-4 h-4 ${qualityInfo.color}`} />
                <span className="text-xs font-medium text-gray-600">Data Quality</span>
              </div>
              <p className={`text-sm font-bold ${qualityInfo.color}`}>{qualityInfo.label}</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <FeasibilityIcon className={`w-4 h-4 ${feasibilityInfo.color}`} />
                <span className="text-xs font-medium text-gray-600">Feasibility</span>
              </div>
              <p className={`text-sm font-bold ${feasibilityInfo.color}`}>{feasibilityInfo.label}</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <ValueIcon className={`w-4 h-4 ${valueInfo.color}`} />
                <span className="text-xs font-medium text-gray-600">Business Value</span>
              </div>
              <p className={`text-sm font-bold ${valueInfo.color}`}>{valueInfo.label}</p>
            </div>
          </div>

          {/* Key Findings */}
          {synthesis.keyFindings.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Key Findings
              </h4>
              <ul className="space-y-2">
                {synthesis.keyFindings.map((finding, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2 bg-blue-50 p-2 rounded border-l-2 border-blue-400">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-blue-600 flex-shrink-0" />
                    <span>{finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actionable Recommendations */}
          {synthesis.actionableRecommendations.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Recommended Actions
              </h4>
              <ul className="space-y-2">
                {synthesis.actionableRecommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2 bg-green-50 p-2 rounded border-l-2 border-green-400">
                    <CheckCircle className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Timeline & Cost */}
          <div className="flex items-center gap-4 mb-4 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Timeline: <span className="font-medium">{synthesis.estimatedTimeline}</span></span>
            </div>
            {synthesis.estimatedCost && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <span>Expected ROI: <span className="font-medium">{synthesis.estimatedCost}</span></span>
              </div>
            )}
          </div>

          {/* Combined Risks */}
          {synthesis.combinedRisks.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Combined Risks
              </h4>
              <div className="space-y-2">
                {synthesis.combinedRisks.map((risk, i) => (
                  <div key={i} className={`text-sm p-2 rounded border-l-2 ${
                    risk.severity === 'high' ? 'bg-red-50 border-red-400' :
                    risk.severity === 'medium' ? 'bg-yellow-50 border-yellow-400' :
                    'bg-gray-50 border-gray-400'
                  }`}>
                    <div className="flex items-start justify-between">
                      <span className="text-gray-700">{risk.risk}</span>
                      <Badge variant="outline" className={`text-xs ${
                        risk.severity === 'high' ? 'border-red-400 text-red-700' :
                        risk.severity === 'medium' ? 'border-yellow-400 text-yellow-700' :
                        'border-gray-400 text-gray-700'
                      }`}>
                        {risk.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Source: {risk.source}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator className="my-4" />

          {/* Expert Opinions Toggle */}
          <Button
            variant="outline"
            onClick={() => setShowDetails(!showDetails)}
            className="w-full mb-4"
          >
            {showDetails ? (
              <>
                <ChevronUp className="w-4 h-4 mr-2" />
                Hide Expert Details
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4 mr-2" />
                View Expert Opinions ({expertOpinions.length})
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Expert Opinion Cards */}
      {showDetails && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {expertOpinions.map((opinion) => (
            <ExpertOpinionCard key={opinion.agentId} opinion={opinion} />
          ))}
        </div>
      )}

      {/* User Feedback Section */}
      <Card className="border-2 border-yellow-200 bg-yellow-50">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-yellow-600" />
            <CardTitle className="text-base text-yellow-900">Your Response Required</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Provide feedback, ask questions, or request clarification..."
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            className="mb-3 bg-white"
            rows={3}
          />
          
          <div className="flex gap-2">
            <Button
              onClick={() => {
                onFeedback(feedbackText, true);
                setFeedbackText('');
              }}
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <ThumbsUp className="w-4 h-4 mr-2" />
              Proceed with Analysis
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                onFeedback(feedbackText, false);
                setFeedbackText('');
              }}
              disabled={isPending}
              className="border-orange-200 text-orange-600 hover:bg-orange-50"
            >
              <ThumbsDown className="w-4 h-4 mr-2" />
              Revise Approach
            </Button>
          </div>

          <p className="text-xs text-gray-600 mt-3">
            <Clock className="w-3 h-3 inline mr-1" />
            Analysis completed in {(totalResponseTime / 1000).toFixed(1)}s
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
