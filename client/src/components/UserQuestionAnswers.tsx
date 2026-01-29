import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageCircle, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, Database, BarChart3, FileText, Shuffle, Lock } from "lucide-react";
import { useState } from "react";

interface UserQuestionAnswersProps {
    project: any;
    className?: string;
    isPaid?: boolean;
    onUnlock?: () => void;
}

interface QuestionAnswer {
    question: string;
    answer: string;
    confidence?: number;
    sources?: string[];
    status: 'answered' | 'partial' | 'pending';
    // Phase 4: Enhanced evidence
    evidenceInsights?: string[];
    dataElementsUsed?: string[];
    analysisTypes?: string[];
    // GAP E: Full evidence chain from questionAnswerMapping
    evidenceChain?: {
        questionId?: string;
        dataElements?: string[];
        analyses?: string[];
        transformationsApplied?: string[];
        insightIds?: string[];
    };
}

/**
 * UserQuestionAnswers Component
 * 
 * PRIORITY DISPLAY: Shows user's original questions and AI-generated answers prominently
 * Uses AI-powered answers from QuestionAnswerService when available, falls back to keyword matching
 */
export default function UserQuestionAnswers({ project, className = "", isPaid = true, onUnlock }: UserQuestionAnswersProps) {
    // Extract AI-generated Q&A from analysis results (if available)
    const analysisResults = project?.analysisResults;
    const aiGeneratedQA = analysisResults?.questionAnswers;

    // Fallback: Extract user's original questions from project session
    const businessQuestions = project?.businessQuestions || project?.prepareData?.businessQuestions || "";
    const analysisGoal = project?.analysisGoal || project?.prepareData?.analysisGoal || "";

    // Extract insights for fallback matching
    const insights = analysisResults?.insights || [];

    // Use AI-generated answers if available, otherwise fall back to keyword matching
    const getQuestionAnswers = (): QuestionAnswer[] => {
        // PRIORITY 1: Use AI-generated answers from QuestionAnswerService
        if (aiGeneratedQA && aiGeneratedQA.answers && aiGeneratedQA.answers.length > 0) {
            console.log(`✅ Using ${aiGeneratedQA.answers.length} AI-generated answers`);
            return aiGeneratedQA.answers.map((qa: any) => ({
                question: qa.question,
                answer: qa.answer,
                confidence: qa.confidence,
                sources: qa.sources || [],
                status: qa.status,
                // Phase 4: Include evidence
                evidenceInsights: qa.evidenceInsights || [],
                dataElementsUsed: qa.dataElementsUsed || [],
                analysisTypes: qa.analysisTypes || [],
                // GAP E: Full evidence chain
                evidenceChain: qa.evidenceChain || undefined
            }));
        }

        // FALLBACK: Use keyword matching (legacy behavior)
        console.log(`⚠️ No AI-generated answers found, using keyword matching fallback`);

        const questions = parseQuestions(businessQuestions);
        if (questions.length === 0) return [];

        return questions.map((question) => {
            const relatedInsights = insights.filter((insight: any) => {
                const questionLower = question.toLowerCase();
                const insightText = `${insight.title} ${insight.description}`.toLowerCase();
                const keywords = questionLower
                    .split(/\s+/)
                    .filter(word => word.length > 3 && !['what', 'when', 'where', 'which', 'how', 'why', 'are', 'the', 'this', 'that', 'these', 'those'].includes(word));
                return keywords.some(keyword => insightText.includes(keyword));
            });

            if (relatedInsights.length > 0) {
                const answer = relatedInsights.map((i: any) => `${i.title}: ${i.description}`).join(' ');
                const avgConfidence = relatedInsights.reduce((sum: number, i: any) => sum + (i.confidence || 50), 0) / relatedInsights.length;
                return {
                    question,
                    answer,
                    confidence: avgConfidence,
                    sources: relatedInsights.map((i: any) => i.dataSource).filter(Boolean),
                    status: 'answered' as const
                };
            } else if (insights.length > 0) {
                return {
                    question,
                    answer: `Based on the analysis, we found ${insights.length} key insights about your data. While we don't have a direct answer to this specific question, the overall analysis shows: ${insights[0]?.description || 'patterns in your data that may be relevant.'}`,
                    confidence: 40,
                    status: 'partial' as const
                };
            } else {
                return {
                    question,
                    answer: "Analysis is still processing. Please check back shortly for answers.",
                    status: 'pending' as const
                };
            }
        });
    };

    const parseQuestions = (questionsText: string): string[] => {
        if (!questionsText || typeof questionsText !== 'string') return [];
        return questionsText.split(/\n|;|\d+\.\s/).map(q => q.trim()).filter(q => q.length > 0 && q !== '');
    };

    const questionAnswers = getQuestionAnswers();

    // If no questions were asked, show the analysis goal with summary
    if (questionAnswers.length === 0 && analysisGoal) {
        return (
            <Card className={className}>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-blue-600" />
                        Your Analysis Goal
                    </CardTitle>
                    <CardDescription>What you wanted to understand from your data</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-sm font-medium text-blue-900 mb-2">Your Goal:</p>
                            <p className="text-gray-700">{analysisGoal}</p>
                        </div>
                        {insights.length > 0 && (
                            <div className="space-y-3">
                                <p className="text-sm font-medium text-gray-900">Key Findings:</p>
                                {insights.slice(0, 3).map((insight: any, index: number) => (
                                    <div key={index} className="p-3 border rounded-lg">
                                        <p className="font-medium text-gray-900 mb-1">{insight.title}</p>
                                        <p className="text-sm text-gray-600">{insight.description}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>
        );
    }

    if (questionAnswers.length === 0) return null;

    const getStatusIcon = (status: QuestionAnswer['status']) => {
        switch (status) {
            case 'answered': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
            case 'partial': return <AlertCircle className="w-5 h-5 text-yellow-600" />;
            case 'pending': return <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />;
        }
    };

    const getStatusBadge = (status: QuestionAnswer['status']) => {
        switch (status) {
            case 'answered': return <Badge className="bg-green-100 text-green-800">Answered</Badge>;
            case 'partial': return <Badge className="bg-yellow-100 text-yellow-800">Partial Answer</Badge>;
            case 'pending': return <Badge className="bg-gray-100 text-gray-600">Pending</Badge>;
        }
    };

    const getConfidenceBadge = (confidence?: number) => {
        if (!confidence) return null;
        const percent = Math.round(confidence);
        let badgeClass = "bg-gray-100 text-gray-700";
        if (percent >= 80) badgeClass = "bg-green-100 text-green-800";
        else if (percent >= 60) badgeClass = "bg-yellow-100 text-yellow-800";
        else if (percent >= 40) badgeClass = "bg-orange-100 text-orange-800";
        return <Badge className={badgeClass}>{percent}% confidence</Badge>;
    };

    return (
        <Card className={`${className} border-blue-200 shadow-md`}>
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50">
                <CardTitle className="flex items-center gap-2 text-xl">
                    <MessageCircle className="w-6 h-6 text-blue-600" />
                    Answers to Your Questions
                    {aiGeneratedQA && (
                        <Badge className="ml-2 bg-green-100 text-green-800">AI-Powered Answers</Badge>
                    )}
                </CardTitle>
                <CardDescription className="text-base">
                    {aiGeneratedQA
                        ? "Direct answers generated by our AI Project Manager based on your analysis"
                        : "Answers matched from analysis insights"}
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                <div className="space-y-6">
                    {questionAnswers.map((qa, index) => {
                        // P3-1 FIX: Blur Q&A pairs after index 1 for unpaid users
                        const isBlurred = !isPaid && index >= 2;
                        return (
                        <div key={index} className={`p-5 border-2 border-gray-200 rounded-lg hover:border-blue-300 transition-colors relative ${isBlurred ? 'overflow-hidden' : ''}`}>
                            {isBlurred && (
                                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                                    <Lock className="w-6 h-6 text-gray-400 mb-2" />
                                    <p className="text-sm text-gray-600 font-medium">Unlock full results</p>
                                    {onUnlock && (
                                        <Button size="sm" variant="outline" className="mt-2" onClick={onUnlock}>
                                            Unlock All Answers
                                        </Button>
                                    )}
                                </div>
                            )}
                            <div className="flex items-start gap-3 mb-4">
                                {getStatusIcon(qa.status)}
                                <div className="flex-1">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <p className="text-lg font-semibold text-gray-900">Q{index + 1}: {qa.question}</p>
                                        {getStatusBadge(qa.status)}
                                    </div>
                                    <div className="mt-3 p-4 bg-blue-50 rounded-lg border border-blue-100">
                                        <p className="text-sm font-medium text-blue-900 mb-2">Answer:</p>
                                        <p className="text-gray-800 leading-relaxed">{qa.answer}</p>
                                    </div>
                                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                                        {getConfidenceBadge(qa.confidence)}
                                        {qa.sources && qa.sources.length > 0 && (
                                            <div className="text-xs text-gray-500">Sources: {qa.sources.join(', ')}</div>
                                        )}
                                    </div>
                                    {/* Phase 4: Evidence Section */}
                                    {((qa.evidenceInsights && qa.evidenceInsights.length > 0) ||
                                      (qa.dataElementsUsed && qa.dataElementsUsed.length > 0) ||
                                      (qa.analysisTypes && qa.analysisTypes.length > 0)) && (
                                        <EvidenceSection qa={qa} insights={insights} />
                                    )}
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600">
                        <strong>Note:</strong> These answers are generated from your data analysis.
                        For detailed technical insights and methodology, see the "AI Insights" and "Timeline" tabs.
                    </p>
                </div>
            </CardContent>
        </Card>
    );
}

/**
 * Evidence Section Component (Phase 4 + GAP E)
 * Expandable section showing supporting evidence for an answer
 * GAP E: Now includes full evidence chain with transformations
 */
function EvidenceSection({ qa, insights }: { qa: QuestionAnswer; insights: any[] }) {
    const [expanded, setExpanded] = useState(false);

    // GAP E: Use evidenceChain if available, otherwise fall back to individual fields
    const dataElements = qa.evidenceChain?.dataElements || qa.dataElementsUsed || [];
    const analyses = qa.evidenceChain?.analyses || qa.analysisTypes || [];
    const transformations = qa.evidenceChain?.transformationsApplied || [];
    const supportingInsights = qa.evidenceChain?.insightIds || qa.evidenceInsights || [];

    const evidenceCount = supportingInsights.length + dataElements.length + analyses.length + transformations.length;

    if (evidenceCount === 0) return null;

    return (
        <div className="mt-4 border-t pt-4">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-between w-full text-left text-sm font-medium text-gray-700 hover:text-gray-900"
            >
                <span className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    How We Answered This ({evidenceCount} items)
                </span>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {expanded && (
                <div className="mt-3 space-y-3 pl-6">
                    {/* GAP E: Data Elements Used */}
                    {dataElements.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Database className="w-4 h-4 text-green-600" />
                                <span className="text-sm font-medium text-gray-700">Data Used:</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {dataElements.map((elementId, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs bg-green-50 text-green-700">
                                        {elementId}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* GAP E: Transformations Applied */}
                    {transformations.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Shuffle className="w-4 h-4 text-orange-600" />
                                <span className="text-sm font-medium text-gray-700">Transformations Applied:</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {transformations.map((transform, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs bg-orange-50 text-orange-700">
                                        {transform}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* GAP E: Analyses Run */}
                    {analyses.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <BarChart3 className="w-4 h-4 text-purple-600" />
                                <span className="text-sm font-medium text-gray-700">Analyses Run:</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {analyses.map((type, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs bg-purple-50 text-purple-700">
                                        {type}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                    {/* Supporting Insights */}
                    {supportingInsights.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <BarChart3 className="w-4 h-4 text-blue-600" />
                                <span className="text-sm font-medium text-gray-700">Supporting Insights:</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {supportingInsights.map((insightId, idx) => {
                                    const insight = insights.find((i: any) => i.id?.toString() === insightId);
                                    return (
                                        <Badge key={idx} variant="outline" className="text-xs bg-blue-50 text-blue-700">
                                            {insight?.title || insightId}
                                        </Badge>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
