import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Link, FileText, Plus, ArrowRight, Database, Zap, Upload, CheckCircle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import UploadModal from "./upload-modal";

interface MultiFileJoinerProps {
  currentProject: any;
  userProjects: any[];
  onJoinComplete: (joinedProject: any) => void;
  onProjectsRefresh?: () => void;
}

export default function MultiFileJoiner({ currentProject, userProjects, onJoinComplete, onProjectsRefresh }: MultiFileJoinerProps) {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [joinType, setJoinType] = useState<'inner' | 'left' | 'right' | 'outer'>('inner');
  const [joinKeys, setJoinKeys] = useState<{ [key: string]: string }>({});
  const [isJoining, setIsJoining] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);
  const [workflowStep, setWorkflowStep] = useState<'select' | 'strategy' | 'columns' | 'execute'>('select');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [mergeStrategy, setMergeStrategy] = useState<'merge' | 'concat'>('merge');

  useEffect(() => {
    // Filter projects that can be joined (exclude current project)
    const joinableProjects = userProjects.filter(project => 
      project.id !== currentProject.id && 
      project.processed && 
      project.data && 
      project.data.length > 0
    );
    setAvailableProjects(joinableProjects);
  }, [userProjects, currentProject.id]);

  const joinTypes = [
    {
      value: 'inner',
      label: 'Inner Join',
      description: 'Only matching records from both datasets'
    },
    {
      value: 'left',
      label: 'Left Join', 
      description: 'All records from current dataset'
    },
    {
      value: 'right',
      label: 'Right Join',
      description: 'All records from selected dataset'
    },
    {
      value: 'outer',
      label: 'Full Outer Join',
      description: 'All records from both datasets'
    }
  ];

  const handleFileSelection = (projectId: string) => {
    if (selectedFiles.includes(projectId)) {
      setSelectedFiles(selectedFiles.filter(id => id !== projectId));
      // Remove join key for unselected file
      const newJoinKeys = { ...joinKeys };
      delete newJoinKeys[projectId];
      setJoinKeys(newJoinKeys);
    } else {
      setSelectedFiles([...selectedFiles, projectId]);
    }
  };

  const handleJoinKeySelection = (projectId: string, fieldName: string) => {
    setJoinKeys({
      ...joinKeys,
      [projectId]: fieldName
    });
  };

  const getFieldsForProject = (projectId: string) => {
    const project = availableProjects.find(p => p.id === projectId);
    if (!project || !project.schema) return [];
    
    return Object.keys(project.schema);
  };

  const getCurrentProjectFields = () => {
    if (!currentProject.schema) return [];
    return Object.keys(currentProject.schema);
  };

  const canPerformJoin = () => {
    if (selectedFiles.length === 0) return false;
    
    // Check that join keys are selected for all selected files
    for (const fileId of selectedFiles) {
      if (!joinKeys[fileId]) return false;
    }
    
    return true;
  };

  const executeJoin = async () => {
    if (mergeStrategy === 'merge' && !canPerformJoin()) return;
    
    setIsJoining(true);
    
    try {
      const response = await fetch(`/api/join-datasets/${currentProject.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          joinWithProjects: selectedFiles,
          joinType: joinType,
          joinKeys: joinKeys,
          mergeStrategy: mergeStrategy
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Join operation failed');
      }

      const result = await response.json();
      
      toast({
        title: "Dataset Join Successful",
        description: `Successfully joined ${selectedFiles.length + 1} datasets with ${result.recordCount} total records.`
      });
      
      onJoinComplete(result.project);
      
    } catch (error) {
      console.error('Join failed:', error);
      toast({
        title: "Join Failed",
        description: error instanceof Error ? error.message : "Unable to join datasets",
        variant: "destructive"
      });
    } finally {
      setIsJoining(false);
    }
  };

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    onProjectsRefresh?.();
    toast({
      title: "Dataset Uploaded",
      description: "New dataset is now available for joining"
    });
  };

  const renderWorkflowStep = () => {
    switch (workflowStep) {
      case 'select':
        return (
          <div className="space-y-6">
            {/* Step 1: Upload/Select Datasets */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  Step 1: Select Datasets to Join
                </h3>
                <Button
                  variant="outline"
                  onClick={() => setShowUploadModal(true)}
                  className="flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  Upload New Dataset
                </Button>
              </div>

              {availableProjects.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 mb-4">No additional datasets available for joining</p>
                  <Button onClick={() => setShowUploadModal(true)} className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Dataset
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Current Dataset */}
                  <div className="p-4 border-2 border-blue-500 rounded-lg bg-blue-50">
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5 text-blue-600" />
                      <div className="flex-1">
                        <div className="font-medium text-blue-900">{currentProject.name}</div>
                        <div className="text-sm text-blue-700">
                          Base Dataset • {Object.keys(currentProject.schema || {}).length} fields • {currentProject.recordCount || 0} records
                        </div>
                      </div>
                      <Badge className="bg-blue-600">Base</Badge>
                    </div>
                  </div>

                  {/* Available Datasets */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Select datasets to join:</label>
                    {availableProjects.map((project) => (
                      <div key={project.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedFiles.includes(project.id)}
                            onChange={() => handleFileSelection(project.id)}
                            className="rounded"
                          />
                          <FileText className="w-5 h-5 text-gray-500" />
                          <div className="flex-1">
                            <div className="font-medium">{project.name}</div>
                            <div className="text-sm text-gray-600">
                              {Object.keys(project.schema || {}).length} fields • {project.recordCount || 0} records
                            </div>
                          </div>
                          {selectedFiles.includes(project.id) && (
                            <CheckCircle className="w-5 h-5 text-green-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {selectedFiles.length > 0 && (
              <div className="flex justify-end">
                <Button onClick={() => setWorkflowStep('strategy')}>
                  Next: Select Join Strategy
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        );

      case 'strategy':
        return (
          <div className="space-y-6">
            {/* Step 2: Select Join Strategy */}
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <Settings className="w-5 h-5" />
                Step 2: Select Join Strategy
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="radio"
                      id="merge-strategy"
                      name="strategy"
                      checked={mergeStrategy === 'merge'}
                      onChange={() => setMergeStrategy('merge')}
                      className="rounded"
                    />
                    <label htmlFor="merge-strategy" className="font-medium">Merge (Join on Keys)</label>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Combine datasets based on matching values in specified columns (like SQL JOIN)
                  </p>
                  <div className="text-xs text-gray-500">
                    Best for: Related data with common identifiers
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <input
                      type="radio"
                      id="concat-strategy"
                      name="strategy"
                      checked={mergeStrategy === 'concat'}
                      onChange={() => setMergeStrategy('concat')}
                      className="rounded"
                    />
                    <label htmlFor="concat-strategy" className="font-medium">Concatenate (Stack Rows)</label>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Stack datasets on top of each other (rows concatenation)
                  </p>
                  <div className="text-xs text-gray-500">
                    Best for: Similar data structures, time series
                  </div>
                </div>
              </div>

              {mergeStrategy === 'merge' && (
                <div className="p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-medium mb-3">Merge Join Types</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {joinTypes.map((type) => (
                      <div key={type.value} className="border rounded-lg p-3 bg-white">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="radio"
                            id={`join-${type.value}`}
                            name="joinType"
                            checked={joinType === type.value}
                            onChange={() => setJoinType(type.value as any)}
                            className="rounded"
                          />
                          <label htmlFor={`join-${type.value}`} className="font-medium text-sm">
                            {type.label}
                          </label>
                        </div>
                        <div className="text-xs text-gray-600">{type.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWorkflowStep('select')}>
                Back: Select Datasets
              </Button>
              <Button onClick={() => setWorkflowStep('columns')}>
                Next: Select Join Columns
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'columns':
        return (
          <div className="space-y-6">
            {/* Step 3: Select Join Columns */}
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <Link className="w-5 h-5" />
                Step 3: Select Join Columns
              </h3>

              {mergeStrategy === 'merge' ? (
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 rounded-lg">
                    <p className="text-sm text-amber-800">
                      Select the columns to use as join keys. These columns should contain matching values across datasets.
                    </p>
                  </div>

                  {selectedFiles.map((projectId) => {
                    const project = availableProjects.find(p => p.id === projectId);
                    if (!project) return null;

                    return (
                      <div key={projectId} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">{project.name}</h4>
                          <Badge variant="outline">Join Key Required</Badge>
                        </div>
                        <Select 
                          value={joinKeys[projectId] || ""} 
                          onValueChange={(value) => handleJoinKeySelection(projectId, value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select join column" />
                          </SelectTrigger>
                          <SelectContent>
                            {getFieldsForProject(projectId).map((field) => (
                              <SelectItem key={field} value={field}>
                                {field}
                                <span className="text-xs text-gray-500 ml-2">
                                  ({project.schema[field]?.type || 'unknown'})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}

                  <div className="border rounded-lg p-4 bg-blue-50">
                    <h4 className="font-medium mb-2">Base Dataset Join Key</h4>
                    <Select 
                      value={joinKeys[currentProject.id] || ""} 
                      onValueChange={(value) => handleJoinKeySelection(currentProject.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select base join column" />
                      </SelectTrigger>
                      <SelectContent>
                        {getCurrentProjectFields().map((field) => (
                          <SelectItem key={field} value={field}>
                            {field}
                            <span className="text-xs text-gray-500 ml-2">
                              ({currentProject.schema[field]?.type || 'unknown'})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-800 mb-2">Concatenation Mode</h4>
                  <p className="text-sm text-green-700">
                    Datasets will be stacked vertically. Columns with the same names will be aligned automatically.
                    Missing columns in some datasets will be filled with null values.
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWorkflowStep('strategy')}>
                Back: Select Strategy
              </Button>
              <Button 
                onClick={() => setWorkflowStep('execute')} 
                disabled={mergeStrategy === 'merge' && !canPerformJoin()}
              >
                Next: Execute Join
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'execute':
        return (
          <div className="space-y-6">
            {/* Step 4: Execute Join */}
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5" />
                Step 4: Execute Join
              </h3>

              <div className="space-y-4">
                <div className="p-4 border rounded-lg bg-gray-50">
                  <h4 className="font-medium mb-3">Join Summary</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Base Dataset:</span>
                      <div className="font-medium">{currentProject.name}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Datasets to Join:</span>
                      <div className="font-medium">{selectedFiles.length}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Strategy:</span>
                      <div className="font-medium capitalize">{mergeStrategy}</div>
                    </div>
                    {mergeStrategy === 'merge' && (
                      <div>
                        <span className="text-gray-600">Join Type:</span>
                        <div className="font-medium">{joinTypes.find(t => t.value === joinType)?.label}</div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button
                    onClick={executeJoin}
                    disabled={isJoining}
                    size="lg"
                    className="flex items-center gap-2"
                  >
                    {isJoining ? (
                      <>
                        <Zap className="w-5 h-5 animate-spin" />
                        Processing Join...
                      </>
                    ) : (
                      <>
                        <Link className="w-5 h-5" />
                        Execute {mergeStrategy === 'merge' ? 'Merge' : 'Concatenation'}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setWorkflowStep('columns')}>
                Back: Select Columns
              </Button>
              <Button variant="outline" onClick={() => {
                setWorkflowStep('select');
                setSelectedFiles([]);
                setJoinKeys({});
              }}>
                Start Over
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (availableProjects.length === 0 && workflowStep === 'select') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Multi-File Data Joining
          </CardTitle>
          <CardDescription>
            Upload additional datasets to enable joining capabilities
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="mb-4">No additional processed datasets available for joining.</p>
            <Button onClick={() => setShowUploadModal(true)} className="flex items-center gap-2">
              <Upload className="w-4 h-4" />
              Upload Dataset
            </Button>
          </div>
          <UploadModal
            isOpen={showUploadModal}
            onClose={() => setShowUploadModal(false)}
            onSuccess={handleUploadSuccess}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Multi-File Data Joining
          </CardTitle>
          <CardDescription>
            Follow the step-by-step workflow to combine datasets using pandas/polars merge or concatenation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Workflow Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              {['select', 'strategy', 'columns', 'execute'].map((step, index) => (
                <div key={step} className="flex items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    workflowStep === step ? 'bg-blue-600 text-white' : 
                    ['select', 'strategy', 'columns', 'execute'].indexOf(workflowStep) > index ? 'bg-green-600 text-white' : 
                    'bg-gray-200 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  {index < 3 && (
                    <div className={`h-0.5 w-16 mx-2 ${
                      ['select', 'strategy', 'columns', 'execute'].indexOf(workflowStep) > index ? 'bg-green-600' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-600">
              <span>Select</span>
              <span>Strategy</span>
              <span>Columns</span>
              <span>Execute</span>
            </div>
          </div>

          {renderWorkflowStep()}
        </CardContent>
      </Card>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}