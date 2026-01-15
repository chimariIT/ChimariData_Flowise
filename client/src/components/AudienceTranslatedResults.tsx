// client/src/components/AudienceTranslatedResults.tsx
// Issue #18: Agent-translated results for audience type with tables and charts

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Users,
  Brain,
  FileText,
  Briefcase,
  Lightbulb,
  Target,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { apiClient } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

interface AudienceTranslatedResultsProps {
  project: any;
  journeyType?: string;
}

type AudienceType = 'executive' | 'business' | 'technical' | 'general';

interface TranslatedResult {
  audienceType: AudienceType;
  executiveSummary: string;
  keyFindings: Array<{
    title: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    metric?: string;
    metricValue?: string | number;
  }>;
  dataTable: {
    title: string;
    headers: string[];
    rows: Array<Record<string, any>>;
    summary?: string;
  };
  recommendations: Array<{
    title: string;
    description: string;
    priority: 'immediate' | 'short-term' | 'long-term';
    effort: 'low' | 'medium' | 'high';
  }>;
  chartData?: {
    type: 'bar' | 'pie' | 'line';
    title: string;
    data: any;
  };
  generatedBy: string; // Which agent generated this
  translatedAt: string;
}

const audienceConfig: Record<AudienceType, { label: string; icon: any; color: string; description: string }> = {
  executive: {
    label: 'Executive View',
    icon: Briefcase,
    color: 'text-purple-600',
    description: 'High-level strategic insights for leadership'
  },
  business: {
    label: 'Business View',
    icon: TrendingUp,
    color: 'text-green-600',
    description: 'Actionable insights for business stakeholders'
  },
  technical: {
    label: 'Technical View',
    icon: Brain,
    color: 'text-blue-600',
    description: 'Detailed technical analysis and methodology'
  },
  general: {
    label: 'General View',
    icon: Users,
    color: 'text-gray-600',
    description: 'Clear, accessible summary for all audiences'
  }
};

export default function AudienceTranslatedResults({ project, journeyType = 'business' }: AudienceTranslatedResultsProps) {
  const [selectedAudience, setSelectedAudience] = useState<AudienceType>(
    journeyType === 'technical' ? 'technical' : journeyType === 'consultation' ? 'executive' : 'business'
  );
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    findings: true,
    table: true,
    recommendations: true
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch translated results from backend
  // FIX: BA stores translations in journeyProgress.translatedResults, not analysisResults.audienceTranslations
  const { data: translatedResults, isLoading, error, refetch } = useQuery<TranslatedResult>({
    queryKey: ['/api/projects', project?.id, 'translated-results', selectedAudience],
    queryFn: async () => {
      if (!project?.id) throw new Error('No project ID');

      // Map 'business' → 'analyst' for backend compatibility
      const backendAudience = selectedAudience === 'business' ? 'analyst' : selectedAudience;
      const generalAudience = selectedAudience === 'general' ? 'analyst' : backendAudience;

      // Check journeyProgress.translatedResults (where BA stores translations)
      const translatedResults = project.journeyProgress?.translatedResults;
      if (translatedResults && translatedResults[generalAudience]) {
        const baTranslation = translatedResults[generalAudience];
        console.log(`✅ [AudienceResults] Found BA translation for ${generalAudience}`);
        return {
          audienceType: selectedAudience,
          executiveSummary: baTranslation.executiveSummary || generateExecutiveSummary(project, selectedAudience, baTranslation.insights || [], []),
          keyFindings: (baTranslation.insights || []).slice(0, 5).map((insight: any) => ({
            title: insight.title || 'Finding',
            description: insight.description || insight.finding || '',
            impact: (insight.impact || 'medium').toLowerCase() as 'high' | 'medium' | 'low',
            metric: insight.metric,
            metricValue: insight.value
          })),
          dataTable: {
            title: 'Key Insights Summary',
            headers: ['Finding', 'Category', 'Confidence'],
            rows: (baTranslation.insights || []).slice(0, 10).map((insight: any) => ({
              finding: insight.title || insight.finding || 'N/A',
              category: insight.category || 'General',
              confidence: insight.confidence ? `${insight.confidence}%` : 'N/A'
            })),
            summary: `${(baTranslation.insights || []).length} items analyzed`
          },
          recommendations: (baTranslation.recommendations || []).slice(0, 5).map((rec: any) => ({
            title: rec.title || 'Recommendation',
            description: rec.description || rec.recommendation || '',
            priority: mapPriority(rec.priority),
            effort: mapEffort(rec.effort)
          })),
          generatedBy: 'Business Agent',
          translatedAt: baTranslation.translatedAt || project.journeyProgress?.baTranslatedAt || new Date().toISOString()
        };
      }

      // Legacy check: Try analysisResults.audienceTranslations
      const existingTranslation = project.analysisResults?.audienceTranslations?.[selectedAudience];
      if (existingTranslation) {
        console.log(`📋 [AudienceResults] Using legacy audienceTranslations for ${selectedAudience}`);
        return existingTranslation;
      }

      // Fallback: Create translation from raw results
      console.log(`⚠️ [AudienceResults] Using fallback translation for ${selectedAudience}`);
      return createFallbackTranslation(project, selectedAudience);
    },
    enabled: !!project?.id && (!!project?.analysisResults || !!project?.journeyProgress?.translatedResults),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 1
  });

  // Create fallback translation from raw analysis results
  const createFallbackTranslation = (proj: any, audience: AudienceType): TranslatedResult => {
    const results = proj.analysisResults || {};
    const insights = results.insights || [];
    const recommendations = results.recommendations || [];
    // GAP 5 FIX: Q&A is stored as { answers: [...] }, not directly as array
    const qaResult = results.questionAnswers || {};
    const questionAnswers = qaResult.answers || [];

    // Build key findings from insights
    const keyFindings = insights.slice(0, 5).map((insight: any) => ({
      title: insight.title || 'Finding',
      description: translateForAudience(insight.description || insight.finding || '', audience),
      impact: (insight.impact || 'medium').toLowerCase() as 'high' | 'medium' | 'low',
      metric: insight.metric,
      metricValue: insight.value
    }));

    // Build data table from question answers or top insights
    const tableRows = questionAnswers.length > 0
      ? questionAnswers.slice(0, 10).map((qa: any) => ({
        question: qa.questionText || qa.question || 'N/A',
        answer: truncateText(qa.answerText || qa.answer || 'Pending analysis', 100),
        confidence: qa.confidence ? `${qa.confidence}%` : 'N/A'
      }))
      : insights.slice(0, 10).map((insight: any) => ({
        finding: insight.title || insight.finding || 'N/A',
        category: insight.category || 'General',
        confidence: insight.confidence ? `${insight.confidence}%` : 'N/A'
      }));

    // Build recommendations
    const translatedRecs = recommendations.slice(0, 5).map((rec: any) => ({
      title: rec.title || 'Recommendation',
      description: translateForAudience(rec.description || rec.recommendation || '', audience),
      priority: mapPriority(rec.priority),
      effort: mapEffort(rec.effort)
    }));

    // Generate executive summary based on audience
    const executiveSummary = generateExecutiveSummary(proj, audience, insights, questionAnswers);

    return {
      audienceType: audience,
      executiveSummary,
      keyFindings,
      dataTable: {
        title: questionAnswers.length > 0 ? 'Questions & Answers Summary' : 'Key Insights Summary',
        headers: questionAnswers.length > 0
          ? ['Question', 'Answer', 'Confidence']
          : ['Finding', 'Category', 'Confidence'],
        rows: tableRows,
        summary: `${tableRows.length} items analyzed from your data`
      },
      recommendations: translatedRecs,
      generatedBy: 'System (Fallback)',
      translatedAt: new Date().toISOString()
    };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast({
        title: 'Results refreshed',
        description: `Updated ${audienceConfig[selectedAudience].label} translation`
      });
    } catch (err) {
      toast({
        title: 'Refresh failed',
        description: 'Could not refresh translated results',
        variant: 'destructive'
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getImpactBadgeColor = (impact: string) => {
    switch (impact.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case 'immediate': return 'bg-red-100 text-red-800';
      case 'short-term': return 'bg-yellow-100 text-yellow-800';
      case 'long-term': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Check if we have analysis results or BA translations at all
  const hasAnalysisResults = !!project?.analysisResults;
  const hasBATranslations = !!project?.journeyProgress?.translatedResults;

  if (!hasAnalysisResults && !hasBATranslations) {
    return (
      <Card className="border-yellow-200 bg-yellow-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-yellow-900">
            <FileText className="w-5 h-5" />
            Results Not Yet Available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-yellow-800">
            Analysis results are still being generated. Please check back after the analysis completes.
          </p>
        </CardContent>
      </Card>
    );
  }

  const CurrentIcon = audienceConfig[selectedAudience].icon;

  return (
    <div className="space-y-6">
      {/* Audience Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5" />
            Results Translated for Your Audience
          </CardTitle>
          <CardDescription>
            Our AI agents have translated your analysis results for different stakeholders
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedAudience} onValueChange={(v) => setSelectedAudience(v as AudienceType)}>
            <TabsList className="grid w-full grid-cols-4">
              {(Object.keys(audienceConfig) as AudienceType[]).map((audience) => {
                const config = audienceConfig[audience];
                const Icon = config.icon;
                return (
                  <TabsTrigger key={audience} value={audience} className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="hidden sm:inline">{config.label.replace(' View', '')}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <div className="mt-3 p-3 bg-gray-50 rounded-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CurrentIcon className={`w-5 h-5 ${audienceConfig[selectedAudience].color}`} />
              <span className="text-sm text-gray-700">{audienceConfig[selectedAudience].description}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading State */}
      {isLoading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              <span className="text-gray-600">Translating results for {audienceConfig[selectedAudience].label}...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <Card className="border-red-200">
          <CardContent className="py-6">
            <p className="text-red-700 text-center">
              Failed to load translated results. Using fallback display.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Translated Results */}
      {translatedResults && !isLoading && (
        <>
          {/* Executive Summary */}
          <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-blue-600" />
                Executive Summary
              </CardTitle>
              <CardDescription>
                Generated by: {translatedResults.generatedBy}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-gray-800 leading-relaxed">{translatedResults.executiveSummary}</p>
            </CardContent>
          </Card>

          {/* Key Findings */}
          <Card>
            <CardHeader
              className="cursor-pointer hover:bg-gray-50 rounded-t-lg"
              onClick={() => toggleSection('findings')}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-green-600" />
                  Key Findings ({translatedResults.keyFindings.length})
                </CardTitle>
                {expandedSections.findings ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
            </CardHeader>
            {expandedSections.findings && (
              <CardContent>
                <div className="space-y-4">
                  {translatedResults.keyFindings.map((finding, idx) => (
                    <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{finding.title}</h4>
                          <p className="text-gray-700 mt-1">{finding.description}</p>
                          {finding.metric && finding.metricValue && (
                            <div className="mt-2 inline-flex items-center gap-2 bg-blue-50 px-3 py-1 rounded-full">
                              <span className="text-sm text-blue-700">{finding.metric}:</span>
                              <span className="font-semibold text-blue-900">{finding.metricValue}</span>
                            </div>
                          )}
                        </div>
                        <Badge className={getImpactBadgeColor(finding.impact)}>
                          {finding.impact.charAt(0).toUpperCase() + finding.impact.slice(1)} Impact
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* Data Table */}
          <Card>
            <CardHeader
              className="cursor-pointer hover:bg-gray-50 rounded-t-lg"
              onClick={() => toggleSection('table')}
            >
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-purple-600" />
                  {translatedResults.dataTable.title}
                </CardTitle>
                {expandedSections.table ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
              </div>
              {translatedResults.dataTable.summary && (
                <CardDescription>{translatedResults.dataTable.summary}</CardDescription>
              )}
            </CardHeader>
            {expandedSections.table && (
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {translatedResults.dataTable.headers.map((header, idx) => (
                          <TableHead key={idx} className="font-semibold">{header}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {translatedResults.dataTable.rows.map((row, rowIdx) => (
                        <TableRow key={rowIdx}>
                          {translatedResults.dataTable.headers.map((header, cellIdx) => {
                            const key = header.toLowerCase().replace(/\s+/g, '');
                            const value = row[key] || row[header] || row[Object.keys(row)[cellIdx]] || 'N/A';
                            return (
                              <TableCell key={cellIdx}>{value}</TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Recommendations */}
          {translatedResults.recommendations.length > 0 && (
            <Card>
              <CardHeader
                className="cursor-pointer hover:bg-gray-50 rounded-t-lg"
                onClick={() => toggleSection('recommendations')}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-orange-600" />
                    Recommendations ({translatedResults.recommendations.length})
                  </CardTitle>
                  {expandedSections.recommendations ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </CardHeader>
              {expandedSections.recommendations && (
                <CardContent>
                  <div className="space-y-4">
                    {translatedResults.recommendations.map((rec, idx) => (
                      <div key={idx} className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h4 className="font-semibold text-orange-900">{rec.title}</h4>
                            <p className="text-orange-800 mt-1">{rec.description}</p>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Badge className={getPriorityBadgeColor(rec.priority)}>
                              {rec.priority.replace('-', ' ')}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {rec.effort} effort
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              )}
            </Card>
          )}

          {/* Footer with agent attribution */}
          <div className="text-center text-sm text-gray-500 py-4">
            <p>
              Results translated at {new Date(translatedResults.translatedAt).toLocaleString()} by {translatedResults.generatedBy}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// Helper functions

function translateForAudience(text: string, audience: AudienceType): string {
  // Simple translation - in a full implementation, this would call the AI service
  if (!text) return '';

  switch (audience) {
    case 'executive':
      // Shorten and focus on business impact
      return text.length > 200 ? text.slice(0, 200) + '...' : text;
    case 'technical':
      // Keep full detail
      return text;
    case 'business':
      // Balance detail and accessibility
      return text.length > 300 ? text.slice(0, 300) + '...' : text;
    default:
      // Simplify for general audience
      return text.length > 250 ? text.slice(0, 250) + '...' : text;
  }
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
}

function mapPriority(priority: string | undefined): 'immediate' | 'short-term' | 'long-term' {
  if (!priority) return 'short-term';
  const lower = priority.toLowerCase();
  if (lower.includes('high') || lower.includes('immediate') || lower.includes('urgent')) return 'immediate';
  if (lower.includes('low') || lower.includes('long')) return 'long-term';
  return 'short-term';
}

function mapEffort(effort: string | undefined): 'low' | 'medium' | 'high' {
  if (!effort) return 'medium';
  const lower = effort.toLowerCase();
  if (lower.includes('low') || lower.includes('easy') || lower.includes('quick')) return 'low';
  if (lower.includes('high') || lower.includes('complex') || lower.includes('difficult')) return 'high';
  return 'medium';
}

function generateExecutiveSummary(project: any, audience: AudienceType, insights: any[], questionAnswersInput: any[]): string {
  const projectName = project.name || 'Your project';
  const insightCount = insights.length;
  // GAP 5 FIX: Handle both array and object formats for questionAnswers
  const questionAnswers = Array.isArray(questionAnswersInput) ? questionAnswersInput : ((questionAnswersInput as any)?.answers || []);
  const qaCount = questionAnswers.length;
  const analysisTypes = project.analysisResults?.analysisTypes || [];

  let summary = '';

  switch (audience) {
    case 'executive':
      summary = `Analysis of ${projectName} has identified ${insightCount} key findings that could impact strategic decision-making. `;
      if (qaCount > 0) {
        summary += `${qaCount} business questions have been answered with data-backed insights. `;
      }
      summary += `The analysis focused on ${analysisTypes.join(', ') || 'comprehensive data patterns'}, revealing opportunities for operational improvement and strategic growth.`;
      break;

    case 'business':
      summary = `Our analysis of ${projectName} uncovered ${insightCount} actionable insights. `;
      if (qaCount > 0) {
        summary += `We've directly addressed ${qaCount} of your business questions with evidence-based answers. `;
      }
      summary += `Key areas analyzed include ${analysisTypes.join(', ') || 'data trends and patterns'}. The findings below provide clear guidance for next steps and expected outcomes.`;
      break;

    case 'technical':
      summary = `Technical analysis of ${projectName} completed with ${insightCount} validated findings. `;
      if (qaCount > 0) {
        summary += `${qaCount} queries processed with statistical confidence metrics. `;
      }
      summary += `Analysis methodology included ${analysisTypes.join(', ') || 'standard statistical methods'}. See below for detailed metrics, data distributions, and confidence intervals.`;
      break;

    default:
      summary = `Analysis complete for ${projectName}. We found ${insightCount} important findings from your data. `;
      if (qaCount > 0) {
        summary += `We answered ${qaCount} questions you asked about your data. `;
      }
      summary += `Below you'll find a clear summary of what we discovered and what it means for you.`;
  }

  return summary;
}
