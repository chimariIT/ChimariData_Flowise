import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Link, FileText, Plus, ArrowRight, Database, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface MultiFileJoinerProps {
  currentProject: any;
  userProjects: any[];
  onJoinComplete: (joinedProject: any) => void;
}

export default function MultiFileJoiner({ currentProject, userProjects, onJoinComplete }: MultiFileJoinerProps) {
  const { toast } = useToast();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [joinType, setJoinType] = useState<'inner' | 'left' | 'right' | 'outer'>('inner');
  const [joinKeys, setJoinKeys] = useState<{ [key: string]: string }>({});
  const [isJoining, setIsJoining] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);

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
    if (!canPerformJoin()) return;
    
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
          joinKeys: joinKeys
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

  if (availableProjects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Multi-File Data Joining
          </CardTitle>
          <CardDescription>
            No additional processed datasets available for joining.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Upload and process more datasets to enable joining capabilities.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Multi-File Data Joining
        </CardTitle>
        <CardDescription>
          Combine multiple datasets based on common fields
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Current Dataset */}
        <div>
          <h4 className="font-medium mb-3">Current Dataset (Base)</h4>
          <div className="p-4 border rounded-lg bg-blue-50">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-blue-600" />
              <div className="flex-1">
                <div className="font-medium">{currentProject.name}</div>
                <div className="text-sm text-gray-600">
                  {Object.keys(currentProject.schema || {}).length} fields, {currentProject.recordCount || 0} records
                </div>
              </div>
              <Badge variant="secondary">Base Dataset</Badge>
            </div>
          </div>
        </div>

        {/* Available Datasets */}
        <div>
          <h4 className="font-medium mb-3">Select Datasets to Join</h4>
          <div className="space-y-3">
            {availableProjects.map((project) => (
              <div key={project.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
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
                        {Object.keys(project.schema || {}).length} fields, {project.recordCount || 0} records
                      </div>
                    </div>
                  </div>
                  
                  {selectedFiles.includes(project.id) && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Join on:</span>
                      <Select 
                        value={joinKeys[project.id] || ""} 
                        onValueChange={(value) => handleJoinKeySelection(project.id, value)}
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          {getFieldsForProject(project.id).map((field) => (
                            <SelectItem key={field} value={field}>
                              {field}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Join Configuration */}
        {selectedFiles.length > 0 && (
          <div>
            <h4 className="font-medium mb-3">Join Configuration</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Join Type */}
              <div>
                <label className="block text-sm font-medium mb-2">Join Type</label>
                <Select value={joinType} onValueChange={(value: any) => setJoinType(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {joinTypes.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <div>
                          <div className="font-medium">{type.label}</div>
                          <div className="text-xs text-gray-500">{type.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Join Preview */}
              <div>
                <label className="block text-sm font-medium mb-2">Join Summary</label>
                <div className="p-3 border rounded-lg bg-gray-50 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">{currentProject.name}</span>
                    <ArrowRight className="w-4 h-4" />
                    <span>{selectedFiles.length} dataset(s)</span>
                  </div>
                  <div className="text-gray-600">
                    Type: {joinTypes.find(t => t.value === joinType)?.label}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setSelectedFiles([]);
              setJoinKeys({});
            }}
            disabled={selectedFiles.length === 0}
          >
            Clear Selection
          </Button>
          <Button
            onClick={executeJoin}
            disabled={!canPerformJoin() || isJoining}
            className="flex items-center gap-2"
          >
            {isJoining ? (
              <>
                <Zap className="w-4 h-4 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <Link className="w-4 h-4" />
                Join Datasets
              </>
            )}
          </Button>
        </div>

        {/* Join Status */}
        {selectedFiles.length > 0 && (
          <div className="p-4 border-l-4 border-blue-500 bg-blue-50">
            <div className="text-sm text-blue-800">
              <strong>Ready to join:</strong> {selectedFiles.length + 1} datasets using {joinType} join
            </div>
            {!canPerformJoin() && (
              <div className="text-sm text-orange-600 mt-1">
                Please select join fields for all selected datasets
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}