import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Database, 
  FileText, 
  Search, 
  Filter, 
  Calendar, 
  HardDrive, 
  Globe, 
  Cloud,
  Plus,
  CheckCircle
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface DatasetSelectorProps {
  onSelect: (datasets: any[]) => void;
  onUploadNew?: () => void;
  allowMultiple?: boolean;
  projectId?: string;
  selectedDatasets?: string[];
}

const SOURCE_TYPE_ICONS = {
  'csv': FileText,
  'json': FileText,
  'pdf': FileText,
  'xlsx': FileText,
  'web': Globe,
  'api': Database,
  'upload': HardDrive,
  'cloud': Cloud
};

const SOURCE_TYPE_COLORS = {
  'csv': 'bg-blue-100 text-blue-800',
  'json': 'bg-green-100 text-green-800',
  'pdf': 'bg-red-100 text-red-800',
  'xlsx': 'bg-orange-100 text-orange-800',
  'web': 'bg-purple-100 text-purple-800',
  'api': 'bg-cyan-100 text-cyan-800',
  'upload': 'bg-gray-100 text-gray-800',
  'cloud': 'bg-indigo-100 text-indigo-800'
};

export function DatasetSelector({ 
  onSelect, 
  onUploadNew, 
  allowMultiple = false, 
  projectId,
  selectedDatasets = []
}: DatasetSelectorProps) {
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>(selectedDatasets);
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceTypeFilter, setSourceTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("updated_desc");

  // Fetch available datasets
  const { data: datasets = [], isLoading, error } = useQuery({
    queryKey: ['/api/datasets'],
    enabled: true
  });

  // Fetch project datasets if projectId is provided
  const { data: projectDatasets = [] } = useQuery({
    queryKey: ['/api/projects', projectId, 'datasets'],
    enabled: !!projectId
  });

  // Type assertions for proper TypeScript support
  const typedDatasets = datasets as any[];
  const typedProjectDatasets = projectDatasets as any[];

  // Filter and sort datasets
  const filteredDatasets = typedDatasets
    .filter((dataset: any) => {
      const matchesSearch = dataset.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (dataset.description || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSourceType = sourceTypeFilter === 'all' || dataset.sourceType === sourceTypeFilter;
      return matchesSearch && matchesSourceType;
    })
    .sort((a: any, b: any) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name);
        case 'name_desc':
          return b.name.localeCompare(a.name);
        case 'created_desc':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'created_asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'updated_desc':
        default:
          return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      }
    });

  // Get unique source types for filter
  const sourceTypes = Array.from(new Set(typedDatasets.map((d: any) => d.sourceType)));

  const handleDatasetSelect = (datasetId: string, checked: boolean) => {
    if (allowMultiple) {
      const newSelection = checked 
        ? [...selectedDatasetIds, datasetId]
        : selectedDatasetIds.filter(id => id !== datasetId);
      setSelectedDatasetIds(newSelection);
    } else {
      setSelectedDatasetIds(checked ? [datasetId] : []);
    }
  };

  const handleConfirmSelection = () => {
    const selectedDatasetObjects = typedDatasets.filter((d: any) => selectedDatasetIds.includes(d.id));
    onSelect(selectedDatasetObjects);
  };

  const isDatasetInProject = (datasetId: string) => {
    // Handle both data shapes: direct datasetId or nested association.datasetId
    return typedProjectDatasets.some((pd: any) => 
      pd.datasetId === datasetId || pd.association?.datasetId === datasetId
    );
  };

  if (error) {
    return (
      <Alert>
        <AlertDescription>
          Failed to load datasets. Please try again.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Select Datasets</h3>
          <p className="text-sm text-muted-foreground">
            Choose from your existing datasets or upload a new one
          </p>
        </div>
        {onUploadNew && (
          <Button onClick={onUploadNew} className="flex items-center gap-2" data-testid="button-upload-new">
            <Plus className="w-4 h-4" />
            Upload New Dataset
          </Button>
        )}
      </div>

      {/* Filters and Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search datasets..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="input-search-datasets"
          />
        </div>
        <Select value={sourceTypeFilter} onValueChange={setSourceTypeFilter}>
          <SelectTrigger data-testid="select-source-type">
            <SelectValue placeholder="Filter by source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sourceTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger data-testid="select-sort-by">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_desc">Recently Updated</SelectItem>
            <SelectItem value="created_desc">Recently Created</SelectItem>
            <SelectItem value="name_asc">Name (A-Z)</SelectItem>
            <SelectItem value="name_desc">Name (Z-A)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dataset List */}
      <ScrollArea className="h-96">
        <div className="space-y-3">
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="text-sm text-muted-foreground mt-2">Loading datasets...</p>
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="text-center py-8">
              <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">
                {searchTerm || sourceTypeFilter !== 'all' 
                  ? 'No datasets match your filters'
                  : 'No datasets available'}
              </p>
            </div>
          ) : (
            filteredDatasets.map((dataset: any) => {
              const IconComponent = SOURCE_TYPE_ICONS[dataset.sourceType as keyof typeof SOURCE_TYPE_ICONS] || FileText;
              const isSelected = selectedDatasetIds.includes(dataset.id);
              const inProject = isDatasetInProject(dataset.id);
              
              return (
                <Card 
                  key={dataset.id} 
                  className={`cursor-pointer transition-colors ${
                    isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => handleDatasetSelect(dataset.id, !isSelected)}
                  data-testid={`card-dataset-${dataset.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-3 flex-1">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            checked={isSelected}
                            onChange={() => {}}
                            data-testid={`checkbox-dataset-${dataset.id}`}
                          />
                          <IconComponent className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <h4 className="font-medium truncate" data-testid={`text-dataset-name-${dataset.id}`}>
                              {dataset.name}
                            </h4>
                            {inProject && (
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-in-project-${dataset.id}`}>
                                <CheckCircle className="w-3 h-3 mr-1" />
                                In Project
                              </Badge>
                            )}
                          </div>
                          {dataset.description && (
                            <p className="text-sm text-muted-foreground truncate mb-2">
                              {dataset.description}
                            </p>
                          )}
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <Badge 
                              variant="outline" 
                              className={SOURCE_TYPE_COLORS[dataset.sourceType as keyof typeof SOURCE_TYPE_COLORS]}
                            >
                              {dataset.sourceType}
                            </Badge>
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-3 h-3" />
                              <span>
                                {formatDistanceToNow(new Date(dataset.updatedAt || dataset.createdAt), { addSuffix: true })}
                              </span>
                            </span>
                            {dataset.ingestionMetadata?.recordCount && (
                              <span>{dataset.ingestionMetadata.recordCount.toLocaleString()} records</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Selection Summary and Actions */}
      {selectedDatasetIds.length > 0 && (
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div className="text-sm">
            <span className="font-medium">{selectedDatasetIds.length}</span> dataset{selectedDatasetIds.length !== 1 ? 's' : ''} selected
          </div>
          <Button onClick={handleConfirmSelection} data-testid="button-confirm-selection">
            {allowMultiple ? 'Add Datasets' : 'Select Dataset'}
          </Button>
        </div>
      )}
    </div>
  );
}