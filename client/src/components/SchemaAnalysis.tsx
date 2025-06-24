import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Database, 
  CheckCircle, 
  Loader2,
  FileText,
  BarChart3,
  Hash,
  Calendar,
  Type,
  Lightbulb
} from "lucide-react";

interface ColumnInfo {
  name: string;
  type: string;
  sampleValues: string[];
  nullCount: number;
  uniqueCount: number;
  aiSummary: string;
}

interface SchemaData {
  columns: ColumnInfo[];
  totalRecords: number;
  completeness: number;
  quality: number;
}

interface SchemaAnalysisProps {
  uploadId: number;
  filename: string;
  onAnalysisComplete: (schemaData: SchemaData) => void;
  isAnalyzing?: boolean;
}

const TYPE_ICONS = {
  text: Type,
  number: Hash,
  date: Calendar,
  boolean: CheckCircle,
  decimal: Hash,
  integer: Hash,
};

const TYPE_COLORS = {
  text: "bg-blue-100 text-blue-800",
  number: "bg-green-100 text-green-800", 
  date: "bg-purple-100 text-purple-800",
  boolean: "bg-orange-100 text-orange-800",
  decimal: "bg-emerald-100 text-emerald-800",
  integer: "bg-teal-100 text-teal-800",
};

export function SchemaAnalysis({ 
  uploadId, 
  filename, 
  onAnalysisComplete, 
  isAnalyzing = false 
}: SchemaAnalysisProps) {
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [schemaData, setSchemaData] = useState<SchemaData | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<'pending' | 'analyzing' | 'complete' | 'failed'>('pending');
  const [currentStep, setCurrentStep] = useState('');

  useEffect(() => {
    if (isAnalyzing && analysisStatus === 'pending') {
      startAnalysis();
    }
  }, [isAnalyzing, analysisStatus]);

  const startAnalysis = async () => {
    setAnalysisStatus('analyzing');
    setAnalysisProgress(0);

    // Simulate schema analysis progress
    const analysisSteps = [
      { step: 'Reading file structure', progress: 20, delay: 800 },
      { step: 'Detecting column types', progress: 40, delay: 1200 },
      { step: 'Analyzing data quality', progress: 60, delay: 1000 },
      { step: 'Generating AI summaries', progress: 80, delay: 1500 },
      { step: 'Finalizing schema', progress: 100, delay: 600 }
    ];

    for (const { step, progress, delay } of analysisSteps) {
      setCurrentStep(step);
      await new Promise(resolve => setTimeout(resolve, delay));
      setAnalysisProgress(progress);
    }

    // Generate mock schema data (in real implementation, this would come from backend)
    const mockSchemaData: SchemaData = {
      columns: [
        {
          name: 'customer_id',
          type: 'integer',
          sampleValues: ['1001', '1002', '1003', '1004', '1005'],
          nullCount: 0,
          uniqueCount: 1000,
          aiSummary: 'Unique identifier for customers. Sequential numbering starting from 1001.'
        },
        {
          name: 'purchase_date',
          type: 'date',
          sampleValues: ['2024-01-15', '2024-01-16', '2024-01-17'],
          nullCount: 5,
          uniqueCount: 365,
          aiSummary: 'Transaction dates spanning the full year 2024. Some missing values likely due to data processing errors.'
        },
        {
          name: 'amount',
          type: 'decimal',
          sampleValues: ['29.99', '149.50', '89.99', '199.00'],
          nullCount: 2,
          uniqueCount: 756,
          aiSummary: 'Purchase amounts in USD. Range from $9.99 to $999.99 with typical values around $50-150.'
        },
        {
          name: 'category',
          type: 'text',
          sampleValues: ['Electronics', 'Clothing', 'Home & Garden', 'Books'],
          nullCount: 12,
          uniqueCount: 8,
          aiSummary: 'Product categories. 8 main categories with Electronics and Clothing being most frequent.'
        },
        {
          name: 'customer_satisfaction',
          type: 'integer',
          sampleValues: ['4', '5', '3', '4', '5'],
          nullCount: 45,
          uniqueCount: 5,
          aiSummary: 'Customer satisfaction scores from 1-5. Average rating is 4.2 with most customers rating 4 or 5.'
        }
      ],
      totalRecords: 1000,
      completeness: 94.2,
      quality: 87.5
    };

    setSchemaData(mockSchemaData);
    setAnalysisStatus('complete');
    onAnalysisComplete(mockSchemaData);
  };

  const renderColumnCard = (column: ColumnInfo) => {
    const IconComponent = TYPE_ICONS[column.type] || Type;
    const completeness = ((schemaData!.totalRecords - column.nullCount) / schemaData!.totalRecords) * 100;

    return (
      <Card key={column.name} className="hover:shadow-lg transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-mono">{column.name}</CardTitle>
            <Badge className={TYPE_COLORS[column.type] || "bg-gray-100 text-gray-800"}>
              <IconComponent className="w-3 h-3 mr-1" />
              {column.type}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Data Quality */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Completeness</span>
              <span>{completeness.toFixed(1)}%</span>
            </div>
            <Progress value={completeness} className="h-2" />
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-slate-500">Unique Values</div>
              <div className="font-medium">{column.uniqueCount.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-slate-500">Missing Values</div>
              <div className="font-medium">{column.nullCount}</div>
            </div>
          </div>

          {/* Sample Values */}
          <div>
            <div className="text-sm text-slate-500 mb-2">Sample Values</div>
            <div className="flex flex-wrap gap-1">
              {column.sampleValues.slice(0, 3).map((value, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {value}
                </Badge>
              ))}
              {column.sampleValues.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{column.sampleValues.length - 3} more
                </Badge>
              )}
            </div>
          </div>

          {/* AI Summary */}
          <div className="bg-blue-50 rounded-lg p-3">
            <div className="flex items-start space-x-2">
              <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-800">{column.aiSummary}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-purple-600" />
            <span>Schema Analysis</span>
          </CardTitle>
          <CardDescription>
            Analyzing your data structure and generating AI-powered column summaries
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Info */}
          <div className="flex items-center space-x-3 p-4 bg-slate-50 rounded-lg">
            <FileText className="w-6 h-6 text-slate-500" />
            <div>
              <div className="font-medium">{filename}</div>
              <div className="text-sm text-slate-500">Upload ID: {uploadId}</div>
            </div>
          </div>

          {/* Analysis Progress */}
          {analysisStatus === 'analyzing' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Analysis Progress</span>
                  <span>{analysisProgress}%</span>
                </div>
                <Progress value={analysisProgress} className="h-2" />
              </div>
              <div className="flex items-center space-x-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{currentStep}</span>
              </div>
            </div>
          )}

          {/* Schema Results */}
          {analysisStatus === 'complete' && schemaData && (
            <div className="space-y-6">
              {/* Overall Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-blue-800">
                      {schemaData.columns.length}
                    </div>
                    <div className="text-sm text-blue-600">Columns Detected</div>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-green-800">
                      {schemaData.totalRecords.toLocaleString()}
                    </div>
                    <div className="text-sm text-green-600">Total Records</div>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="p-4 text-center">
                    <div className="text-2xl font-bold text-purple-800">
                      {schemaData.quality}%
                    </div>
                    <div className="text-sm text-purple-600">Data Quality Score</div>
                  </CardContent>
                </Card>
              </div>

              {/* Success Alert */}
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <strong className="text-green-800">Schema Analysis Complete</strong>
                  <div className="text-sm mt-1">
                    Found {schemaData.columns.length} columns with {schemaData.completeness.toFixed(1)}% data completeness.
                    Ready to proceed to analysis phase.
                  </div>
                </AlertDescription>
              </Alert>

              {/* Column Details */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Column Analysis</h3>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {schemaData.columns.map(renderColumnCard)}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between">
            {analysisStatus === 'pending' && (
              <Button onClick={startAnalysis} disabled={isAnalyzing}>
                <Database className="w-4 h-4 mr-2" />
                Start Schema Analysis
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}