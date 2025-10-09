import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Database, 
  Upload, 
  CheckCircle, 
  AlertCircle,
  FileText,
  BarChart3,
  Settings,
  Download,
  Eye
} from "lucide-react";

interface DataStepProps {
  journeyType: string;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAsContent?: boolean;
}

export default function DataStep({ journeyType, onNext, onPrevious, renderAsContent = false }: DataStepProps) {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [dataPreview, setDataPreview] = useState<Record<string, any[]>>({});
  const [dataValidation, setDataValidation] = useState<any>(null);
  const [linkedSchema, setLinkedSchema] = useState<{ [table: string]: { columns: Record<string, string>, primaryKey?: string, foreignKeys?: Array<{ column: string, references: string }> } }>({});
  const [editingRelations, setEditingRelations] = useState(false);
  const [pendingRelations, setPendingRelations] = useState<{ [table: string]: { primaryKey?: string, foreignKeys: Array<{ column: string, references: string }> } }>({});
  const [inferring, setInferring] = useState(false);

  const getJourneyTypeInfo = () => {
    switch (journeyType) {
      case 'non-tech':
        return {
          title: "AI-Guided Data Upload",
          description: "Our AI will automatically validate and prepare your data",
          icon: Database,
          color: "blue"
        };
      case 'business':
        return {
          title: "Business Data Upload", 
          description: "Upload your business data with template-based validation",
          icon: BarChart3,
          color: "green"
        };
      case 'technical':
        return {
          title: "Technical Data Upload",
          description: "Upload data with full control over validation and transformation",
          icon: Settings,
          color: "purple"
        };
      case 'consultation':
        return {
          title: "Consultation Data Upload",
          description: "Upload data for expert review and preparation",
          icon: Eye,
          color: "yellow"
        };
      default:
        return {
          title: "Data Upload",
          description: "Upload and prepare your data for analysis",
          icon: Database,
          color: "blue"
        };
    }
  };

  const journeyInfo = getJourneyTypeInfo();
  const Icon = journeyInfo.icon;

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploadedFiles((prev) => [...prev, ...files]);
    setUploadStatus('uploading');
    setUploadProgress(0);

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          setUploadStatus('processing');
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    // Simulate processing
    setTimeout(() => {
      setUploadProgress(100);
      setUploadStatus('completed');
      
      // Generate mock data preview for each file
      const previews: Record<string, any[]> = {};
      files.forEach((f, idx) => {
        previews[f.name] = [
          { id: 1, name: 'John Doe', age: 28, department: 'Sales', salary: 55000 },
          { id: 2, name: 'Jane Smith', age: 32, department: 'Marketing', salary: 62000 },
          { id: 3, name: 'Bob Johnson', age: 45, department: 'Engineering', salary: 78000 },
        ];
      });
      setDataPreview((prev) => ({ ...prev, ...previews }));

      // Generate mock validation + schema linking
      setDataValidation({
        totalRows: 2400,
        totalColumns: 12,
        missingValues: 14,
        duplicateRows: 4,
        qualityScore: 93
      });
      setLinkedSchema({
        employees: {
          columns: { id: 'integer', name: 'string', age: 'integer', department_id: 'integer', hire_date: 'date', status: 'string' },
          primaryKey: 'id',
          foreignKeys: [{ column: 'department_id', references: 'departments.id' }]
        },
        departments: {
          columns: { id: 'integer', name: 'string', policy_change_date: 'date' },
          primaryKey: 'id'
        }
      });
      
      clearInterval(progressInterval);
    }, 2000);
  };

  const getUploadStatusIcon = () => {
    switch (uploadStatus) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'uploading':
      case 'processing':
        return <Database className="w-5 h-5 text-blue-600 animate-pulse" />;
      default:
        return <Upload className="w-5 h-5 text-gray-600" />;
    }
  };

  const getUploadStatusText = () => {
    switch (uploadStatus) {
      case 'uploading':
        return 'Uploading file...';
      case 'processing':
        return 'Processing and validating data...';
      case 'completed':
        return 'Data uploaded and validated successfully!';
      case 'error':
        return 'Upload failed. Please try again.';
      default:
        return 'Ready to upload';
    }
  };

  const content = (
    <div className="space-y-6">
      {/* Journey Type Info */}
      <Card className={`border-${journeyInfo.color}-200 bg-${journeyInfo.color}-50`}>
        <CardHeader>
          <CardTitle className={`flex items-center gap-2 text-${journeyInfo.color}-900`}>
            <Icon className="w-5 h-5" />
            {journeyInfo.title}
          </CardTitle>
          <CardDescription className={`text-${journeyInfo.color}-700`}>
            {journeyInfo.description}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* File Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Your Data
          </CardTitle>
          <CardDescription>
            Upload your data file for analysis. Supported formats: CSV, Excel, JSON
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Upload Area */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                multiple
                accept=".csv,.xlsx,.xls,.json"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}
              />
              <label
                htmlFor="file-upload"
                className={`cursor-pointer ${uploadStatus === 'uploading' || uploadStatus === 'processing' ? 'cursor-not-allowed opacity-50' : ''}`}
              >
                <div className="flex flex-col items-center space-y-4">
                  {getUploadStatusIcon()}
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      {uploadedFiles.length ? `${uploadedFiles.length} file(s) selected` : 'Click to upload or drag and drop'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {getUploadStatusText()}
                    </p>
                  </div>
                  {!uploadedFiles.length && (
                    <Button variant="outline" disabled={uploadStatus === 'uploading' || uploadStatus === 'processing'}>
                      Choose File
                    </Button>
                  )}
                </div>
              </label>
            </div>

            {/* Upload Progress */}
            {(uploadStatus === 'uploading' || uploadStatus === 'processing') && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Upload Progress</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Data Validation Results */}
      {uploadStatus === 'completed' && dataValidation && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Data Validation Results
            </CardTitle>
            <CardDescription className="text-green-700">
              Your data has been successfully validated and is ready for analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{dataValidation.totalRows}</p>
                <p className="text-sm text-green-700">Total Rows</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{dataValidation.totalColumns}</p>
                <p className="text-sm text-green-700">Columns</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{dataValidation.missingValues}</p>
                <p className="text-sm text-green-700">Missing Values</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-900">{dataValidation.qualityScore}%</p>
                <p className="text-sm text-green-700">Quality Score</p>
              </div>
            </div>
            
            {/* Role-specific schema view */}
            <div className="space-y-3 mt-2">
              <h4 className="font-medium text-green-900">Schema Overview</h4>
              {journeyType === 'non-tech' && (
                <p className="text-sm text-green-800">
                  We detected People and Departments tables and linked them automatically.
                </p>
              )}
              {journeyType === 'business' && (
                <p className="text-sm text-green-800">
                  Key fields: Employee ID, Department, Hire Date, Policy Change Date. Relationships mapped for cross-table KPIs.
                </p>
              )}
              <div className="grid md:grid-cols-2 gap-3">
                {Object.entries(linkedSchema).map(([table, def]) => (
                  <div key={table} className="p-3 bg-white rounded border">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{table}</span>
                      {editingRelations ? (
                        <select
                          className="text-xs border rounded px-1 py-0.5"
                          value={pendingRelations[table]?.primaryKey || def.primaryKey || ''}
                          onChange={(e) => setPendingRelations(prev => ({
                            ...prev,
                            [table]: { ...(prev[table] || { foreignKeys: def.foreignKeys || [] }), primaryKey: e.target.value }
                          }))}
                        >
                          <option value="">Select PK</option>
                          {Object.keys(def.columns).map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      ) : (
                        def.primaryKey && (
                          <Badge variant="outline" className="text-xs">PK: {def.primaryKey}</Badge>
                        )
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {Object.entries(def.columns).map(([col, type]) => (
                        <Badge key={col} variant="secondary" className="bg-green-100 text-green-800">
                          {journeyType === 'technical' ? `${col}: ${type}` : col}
                        </Badge>
                      ))}
                    </div>
                    {editingRelations ? (
                      <div className="space-y-2">
                        {(pendingRelations[table]?.foreignKeys || def.foreignKeys || []).map((fk, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <span>FK</span>
                            <select
                              className="border rounded px-1 py-0.5"
                              value={fk.column}
                              onChange={(e) => {
                                const updated = [...(pendingRelations[table]?.foreignKeys || def.foreignKeys || [])];
                                updated[idx] = { ...updated[idx], column: e.target.value };
                                setPendingRelations(prev => ({ ...prev, [table]: { primaryKey: (prev[table]?.primaryKey || def.primaryKey), foreignKeys: updated } }));
                              }}
                            >
                              {Object.keys(def.columns).map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                            <span>→</span>
                            <select
                              className="border rounded px-1 py-0.5"
                              value={fk.references}
                              onChange={(e) => {
                                const updated = [...(pendingRelations[table]?.foreignKeys || def.foreignKeys || [])];
                                updated[idx] = { ...updated[idx], references: e.target.value };
                                setPendingRelations(prev => ({ ...prev, [table]: { primaryKey: (prev[table]?.primaryKey || def.primaryKey), foreignKeys: updated } }));
                              }}
                            >
                              {Object.entries(linkedSchema).map(([t, d]) => (
                                (d.primaryKey ? <option key={`${t}.${d.primaryKey}`} value={`${t}.${d.primaryKey}`}>{t}.{d.primaryKey}</option> : null)
                              ))}
                            </select>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" onClick={() => {
                          const updated = [...(pendingRelations[table]?.foreignKeys || def.foreignKeys || [])];
                          updated.push({ column: Object.keys(def.columns)[0], references: Object.entries(linkedSchema).map(([t, d]) => `${t}.${d.primaryKey || 'id'}`)[0] });
                          setPendingRelations(prev => ({ ...prev, [table]: { primaryKey: (prev[table]?.primaryKey || def.primaryKey), foreignKeys: updated } }));
                        }}>Add FK</Button>
                      </div>
                    ) : (
                      (def.foreignKeys && def.foreignKeys.length > 0) && (
                        <p className="text-xs text-gray-600">FK: {def.foreignKeys.map(fk => `${fk.column} → ${fk.references}`).join(', ')}</p>
                      )
                    )}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingRelations(v => !v)}>
                  {editingRelations ? 'Done Editing' : 'Edit Relationships'}
                </Button>
                <Button variant="outline" size="sm" disabled={inferring} onClick={async () => {
                  try {
                    setInferring(true);
                    const resp = await fetch('/api/data/infer-relationships', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ tables: linkedSchema })
                    });
                    const json = await resp.json();
                    if (json?.suggestions) {
                      // Merge suggestions into pending then apply
                      const merged: any = {};
                      for (const [t, s] of Object.entries<any>(json.suggestions)) {
                        merged[t] = { primaryKey: s.primaryKey || linkedSchema[t]?.primaryKey, foreignKeys: s.foreignKeys || linkedSchema[t]?.foreignKeys || [] };
                      }
                      setPendingRelations(merged);
                      setEditingRelations(true);
                    }
                  } finally {
                    setInferring(false);
                  }
                }}>
                  {inferring ? 'Detecting…' : 'Auto-detect relationships'}
                </Button>
                {editingRelations && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => {
                    const next: any = {};
                    for (const [t, def] of Object.entries(linkedSchema)) {
                      next[t] = {
                        ...def,
                        primaryKey: pendingRelations[t]?.primaryKey || def.primaryKey,
                        foreignKeys: pendingRelations[t]?.foreignKeys || def.foreignKeys || []
                      };
                    }
                    setLinkedSchema(next);
                    setEditingRelations(false);
                  }}>Apply</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Data Preview (multiple files) */}
      {uploadStatus === 'completed' && Object.keys(dataPreview).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Data Preview
            </CardTitle>
            <CardDescription>
              First rows for each uploaded file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(dataPreview).map(([name, rows]) => (
                <div key={name}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{name}</h4>
                    <Badge variant="secondary" className="bg-gray-100 text-gray-800">{rows.length} rows shown</Badge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                      <thead>
                        <tr className="bg-gray-50">
                          {Object.keys(rows[0]).map((column) => (
                            <th key={column} className="border border-gray-300 px-3 py-2 text-left font-medium">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => (
                          <tr key={index}>
                            {Object.values(row).map((value, cellIndex) => (
                              <td key={cellIndex} className="border border-gray-300 px-3 py-2">
                                {String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Journey-specific Information */}
      {journeyType === 'non-tech' && uploadStatus === 'completed' && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Database className="w-5 h-5" />
              AI Data Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-blue-700 mb-3">
              Our AI has automatically analyzed your data and will suggest the best analysis approach based on:
            </p>
            <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
              <li>Data structure and column types</li>
              <li>Data quality and completeness</li>
              <li>Optimal statistical methods</li>
              <li>Best visualization approaches</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {journeyType === 'technical' && uploadStatus === 'completed' && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <Settings className="w-5 h-5" />
              Technical Data Options
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-purple-700 mb-3">
              Advanced data processing options available in the next step:
            </p>
            <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
              <li>Custom data transformations</li>
              <li>Feature engineering</li>
              <li>Statistical preprocessing</li>
              <li>Machine learning data preparation</li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Ready for Next Step */}
      {uploadStatus === 'completed' && (
        <Card className="border-green-200 bg-green-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <CheckCircle className="w-5 h-5" />
              Data Upload Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-green-800 font-medium mb-3">
              ✅ Your data is ready for analysis! You can now proceed to configure and execute your analysis.
            </p>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {dataValidation.totalRows} rows uploaded
              </Badge>
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                {dataValidation.qualityScore}% quality score
              </Badge>
              {uploadedFiles.length > 1 && (
                <Badge variant="secondary" className="bg-green-100 text-green-800">
                  {uploadedFiles.length} files linked
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (renderAsContent) {
    return content;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Data Preparation
        </CardTitle>
        <CardDescription>
          Upload, validate, and transform your data
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}