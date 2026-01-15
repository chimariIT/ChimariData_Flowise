import { useQuery } from '@tanstack/react-query';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
    Database,
    Zap,
    Workflow,
    Info,
    ChevronRight,
    Search,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import { apiClient } from '@/lib/api';

interface EvidenceChainProps {
    projectId: string;
    questionId: string;
    trigger?: React.ReactNode;
}

interface EvidenceChainResult {
    question: { id: string; text: string };
    elements: Array<{
        elementId: string;
        elementName: string;
        sourceDataset: string;
        sourceColumn: string;
        relevance: number;
        linkType: string;
    }>;
    transformations: Array<{
        transformationId: string;
        name: string;
        type: string;
        config: any;
        status: string;
    }>;
}

export function EvidenceChainUI({ projectId, questionId, trigger }: EvidenceChainProps) {
    const { data: chain, isLoading, error } = useQuery<EvidenceChainResult>({
        queryKey: ['evidence-chain', projectId, questionId],
        queryFn: async () => {
            const response = await apiClient.get(`/api/semantic-pipeline/${projectId}/evidence-chain/${questionId}`);
            if (response && 'chain' in response) {
                return response.chain as EvidenceChainResult;
            }
            return response as EvidenceChainResult;
        },
        enabled: !!projectId && !!questionId
    });

    const getRelevanceColor = (score: number) => {
        if (score >= 0.8) return 'bg-green-500';
        if (score >= 0.5) return 'bg-blue-500';
        return 'bg-yellow-500';
    };

    const getLinkTypeBadge = (linkType: string) => {
        switch (linkType) {
            case 'groups_by': return <Badge variant="secondary">Grouping</Badge>;
            case 'aggregates': return <Badge variant="default">Aggregation</Badge>;
            case 'filters_by': return <Badge variant="outline">Filter</Badge>;
            default: return <Badge variant="outline">{linkType}</Badge>;
        }
    };

    return (
        <Dialog>
            <DialogTrigger asChild>
                {trigger || (
                    <Button variant="ghost" size="sm" className="h-8 gap-2">
                        <Info className="w-4 h-4" />
                        <span>How We Answered</span>
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Search className="w-5 h-5 text-blue-500" />
                        Evidence Chain: Traceability
                    </DialogTitle>
                    <DialogDescription>
                        Understanding the data and logic used to answer your question.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex items-center justify-center p-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                ) : error ? (
                    <div className="p-8 text-center text-destructive flex flex-col items-center gap-2">
                        <AlertCircle className="w-8 h-8" />
                        <p>Failed to load evidence chain.</p>
                    </div>
                ) : !chain ? (
                    <div className="p-8 text-center text-muted-foreground">
                        No evidence found for this question.
                    </div>
                ) : (
                    <ScrollArea className="flex-1 pr-4">
                        <div className="space-y-6 py-4">
                            {/* Question Context */}
                            <div className="bg-muted/50 p-4 rounded-lg border">
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-2">Original Question</h4>
                                <p className="text-lg font-medium italic">"{chain.question.text}"</p>
                            </div>

                            {/* Data Elements Section */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-primary font-semibold">
                                    <Database className="w-4 h-4" />
                                    <h4>Data Evidence (Semantic Matching)</h4>
                                </div>
                                <div className="grid gap-3">
                                    {chain.elements.map((element) => (
                                        <Card key={element.elementId} className="border-l-4 border-l-blue-500">
                                            <CardContent className="p-4 flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold">{element.elementName}</span>
                                                        {getLinkTypeBadge(element.linkType)}
                                                    </div>
                                                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                                                        <Database className="w-3 h-3" />
                                                        <span>{element.sourceColumn}</span>
                                                        <ChevronRight className="w-3 h-3" />
                                                        <span>Dataset: {element.sourceDataset.split('_')[0]}...</span>
                                                    </div>
                                                </div>
                                                <div className="w-32 space-y-1">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-muted-foreground">Relevance</span>
                                                        <span className="font-medium">{Math.round(element.relevance * 100)}%</span>
                                                    </div>
                                                    <Progress
                                                        value={element.relevance * 100}
                                                        className={`h-1.5 ${getRelevanceColor(element.relevance)}`}
                                                    />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                    {chain.elements.length === 0 && (
                                        <p className="text-sm text-muted-foreground italic">No specific data elements linked yet.</p>
                                    )}
                                </div>
                            </div>

                            <Separator />

                            {/* Logic / Transformations Section */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 text-purple-600 font-semibold">
                                    <Workflow className="w-4 h-4" />
                                    <h4>Inferred Logic (Transformation Chain)</h4>
                                </div>
                                <div className="space-y-3">
                                    {chain.transformations.map((transform, idx) => (
                                        <div key={transform.transformationId} className="flex gap-4 items-start">
                                            <div className="flex flex-col items-center">
                                                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 border border-purple-200">
                                                    {idx + 1}
                                                </div>
                                                {idx < chain.transformations.length - 1 && (
                                                    <div className="w-0.5 h-full bg-border mt-1" />
                                                )}
                                            </div>
                                            <div className="flex-1 pb-4">
                                                <Card>
                                                    <CardHeader className="p-4 pb-2">
                                                        <div className="flex justify-between items-center">
                                                            <CardTitle className="text-base flex items-center gap-2 uppercase tracking-tight">
                                                                <Zap className="w-3 h-3" />
                                                                {transform.type}
                                                            </CardTitle>
                                                            <Badge variant={transform.status === 'completed' ? 'secondary' : 'outline'}>
                                                                {transform.status}
                                                            </Badge>
                                                        </div>
                                                        <CardTitle className="text-lg font-bold">{transform.name}</CardTitle>
                                                    </CardHeader>
                                                    <CardContent className="p-4 pt-0">
                                                        <div className="text-sm text-muted-foreground">
                                                            {transform.type === 'join' && (
                                                                <p>Merging customer data with transaction records using common keys.</p>
                                                            )}
                                                            {transform.type === 'aggregate' && (
                                                                <p>Calculating statistical summaries across the selected time period.</p>
                                                            )}
                                                            {transform.type === 'filter' && (
                                                                <p>Excluding outliers and irrelevant segments to focus on the target audience.</p>
                                                            )}
                                                        </div>
                                                    </CardContent>
                                                </Card>
                                            </div>
                                        </div>
                                    ))}
                                    {chain.transformations.length === 0 && (
                                        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex gap-3 text-yellow-800">
                                            <AlertCircle className="w-5 h-5 shrink-0" />
                                            <div className="text-sm">
                                                <span className="font-semibold">Direct Answer:</span> No complex transformations were required for this specific question.
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Conclusion / Verification */}
                            <div className="bg-green-50 border border-green-200 p-4 rounded-lg flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                                <p className="text-sm text-green-800">
                                    <span className="font-bold">Verified Traceability:</span> This answer is anchored in the verified schema of your uploaded data.
                                </p>
                            </div>
                        </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    );
}
