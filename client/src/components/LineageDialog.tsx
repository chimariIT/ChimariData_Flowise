import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  GitBranch, 
  Database, 
  Settings, 
  BarChart3, 
  CheckCircle, 
  Clock,
  Download,
  Info
} from "lucide-react";

interface LineageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  artifactId?: string;
}

interface LineageItem {
  id: string;
  type: 'source' | 'transformation' | 'analysis' | 'artifact';
  name: string;
  description: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
  metadata?: any;
}

export function LineageDialog({
  isOpen,
  onClose,
  projectId,
  artifactId
}: LineageDialogProps) {
  const [lineageData, setLineageData] = useState<LineageItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Mock lineage data - in real implementation, this would come from an API
  const mockLineageData: LineageItem[] = [
    {
      id: 'source-1',
      type: 'source',
      name: 'sales_data.csv',
      description: 'Original uploaded dataset',
      timestamp: '2025-01-01T10:00:00Z',
      status: 'completed',
      metadata: { rows: 1000, columns: 5 }
    },
    {
      id: 'transform-1',
      type: 'transformation',
      name: 'Data Cleaning',
      description: 'Removed null values and outliers',
      timestamp: '2025-01-01T10:05:00Z',
      status: 'completed',
      metadata: { rowsAffected: 950 }
    },
    {
      id: 'transform-2',
      type: 'transformation',
      name: 'Feature Engineering',
      description: 'Created calculated columns',
      timestamp: '2025-01-01T10:10:00Z',
      status: 'completed',
      metadata: { columnsAdded: 3 }
    },
    {
      id: 'analysis-1',
      type: 'analysis',
      name: 'Descriptive Statistics',
      description: 'Summary statistics analysis',
      timestamp: '2025-01-01T10:15:00Z',
      status: 'completed',
      metadata: { methods: ['mean', 'median', 'std'] }
    },
    {
      id: 'analysis-2',
      type: 'analysis',
      name: 'Correlation Analysis',
      description: 'Variable relationship analysis',
      timestamp: '2025-01-01T10:20:00Z',
      status: 'completed',
      metadata: { correlationsFound: 5 }
    },
    {
      id: 'artifact-1',
      type: 'artifact',
      name: 'Executive Summary Report',
      description: 'Formatted for executive audience',
      timestamp: '2025-01-01T10:25:00Z',
      status: 'completed',
      metadata: { audience: 'executive', format: 'pdf' }
    }
  ];

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'source':
        return <Database className="w-4 h-4" />;
      case 'transformation':
        return <Settings className="w-4 h-4" />;
      case 'analysis':
        return <BarChart3 className="w-4 h-4" />;
      case 'artifact':
        return <Download className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'source':
        return 'bg-blue-100 text-blue-800';
      case 'transformation':
        return 'bg-yellow-100 text-yellow-800';
      case 'analysis':
        return 'bg-green-100 text-green-800';
      case 'artifact':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Group lineage by type
  const groupedLineage = {
    source: mockLineageData.filter(item => item.type === 'source'),
    transformation: mockLineageData.filter(item => item.type === 'transformation'),
    analysis: mockLineageData.filter(item => item.type === 'analysis'),
    artifact: mockLineageData.filter(item => item.type === 'artifact')
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-blue-600" />
            Artifact Lineage & Traceability
          </DialogTitle>
          <DialogDescription>
            Track the complete history of data transformations and analysis steps that produced this artifact
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="timeline" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="source">Source Data</TabsTrigger>
            <TabsTrigger value="transformations">Transformations</TabsTrigger>
            <TabsTrigger value="analysis">Analysis Steps</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="space-y-4">
            <ScrollArea className="h-96">
              <div className="space-y-4">
                {mockLineageData.map((item, index) => (
                  <div key={item.id} className="flex items-start gap-4">
                    {/* Timeline Line */}
                    <div className="flex flex-col items-center">
                      <div className={`p-2 rounded-full ${getTypeColor(item.type)}`}>
                        {getTypeIcon(item.type)}
                      </div>
                      {index < mockLineageData.length - 1 && (
                        <div className="w-0.5 h-12 bg-gray-300 mt-2" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1">
                      <Card>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-semibold">{item.name}</CardTitle>
                            <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                          </div>
                          <CardDescription className="text-xs">{item.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-2 text-xs text-gray-600">
                            <Clock className="w-3 h-3" />
                            <span>{new Date(item.timestamp).toLocaleString()}</span>
                          </div>
                          {item.metadata && (
                            <div className="mt-2 text-xs text-gray-500">
                              {JSON.stringify(item.metadata, null, 2)}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="source" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Source Data</CardTitle>
                <CardDescription>Original datasets used in this analysis</CardDescription>
              </CardHeader>
              <CardContent>
                {groupedLineage.source.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg mb-2">
                    <Database className="w-5 h-5 text-blue-600" />
                    <div className="flex-1">
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-gray-600">{item.description}</p>
                    </div>
                    <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transformations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Data Transformations</CardTitle>
                <CardDescription>Applied transformations and preprocessing steps</CardDescription>
              </CardHeader>
              <CardContent>
                {groupedLineage.transformation.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg mb-2">
                    <Settings className="w-5 h-5 text-yellow-600" />
                    <div className="flex-1">
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-gray-600">{item.description}</p>
                    </div>
                    <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Analysis Steps</CardTitle>
                <CardDescription>Analytical methods and techniques applied</CardDescription>
              </CardHeader>
              <CardContent>
                {groupedLineage.analysis.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 border rounded-lg mb-2">
                    <BarChart3 className="w-5 h-5 text-green-600" />
                    <div className="flex-1">
                      <h4 className="font-medium">{item.name}</h4>
                      <p className="text-sm text-gray-600">{item.description}</p>
                    </div>
                    <Badge className={getStatusColor(item.status)}>{item.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}



