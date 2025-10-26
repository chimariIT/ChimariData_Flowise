import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle, AlertCircle, Edit, Check } from "lucide-react";
import { SchemaAnalysis } from "./SchemaAnalysis";

interface SchemaValidationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (schema: Record<string, string>) => void;
  detectedSchema: Record<string, string>;
  sampleData?: Record<string, any>[];
}

export function SchemaValidationDialog({
  isOpen,
  onClose,
  onConfirm,
  detectedSchema,
  sampleData = []
}: SchemaValidationDialogProps) {
  const [editedSchema, setEditedSchema] = useState<Record<string, string>>(detectedSchema);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);

  const dataTypes = ['string', 'number', 'integer', 'boolean', 'date', 'datetime', 'text'];

  const handleConfirm = () => {
    onConfirm(editedSchema);
    onClose();
  };

  const startEditing = (column: string) => {
    setEditingColumn(column);
  };

  const saveEdit = (column: string, newType: string) => {
    setEditedSchema(prev => ({
      ...prev,
      [column]: newType
    }));
    setEditingColumn(null);
  };

  const getTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'number':
      case 'integer':
        return 'bg-blue-100 text-blue-800';
      case 'boolean':
        return 'bg-purple-100 text-purple-800';
      case 'date':
      case 'datetime':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const hasChanges = JSON.stringify(editedSchema) !== JSON.stringify(detectedSchema);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            Schema Validation & Review
          </DialogTitle>
          <DialogDescription>
            Review and edit the detected data types for your columns. This ensures accurate analysis.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6">
            {/* Detected Schema Table */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Detected Schema</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column Name</TableHead>
                    <TableHead>Detected Type</TableHead>
                    <TableHead>Sample Values</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(editedSchema).map(([column, type]) => (
                    <TableRow key={column}>
                      <TableCell className="font-medium">{column}</TableCell>
                      <TableCell>
                        {editingColumn === column ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={type}
                              onChange={(e) => {
                                setEditedSchema(prev => ({
                                  ...prev,
                                  [column]: e.target.value
                                }));
                              }}
                              className="rounded border px-2 py-1 text-sm"
                            >
                              {dataTypes.map(dt => (
                                <option key={dt} value={dt}>{dt}</option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => saveEdit(column, type)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <Badge className={getTypeBadgeColor(type)}>
                            {type}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-gray-600 max-w-xs truncate">
                          {sampleData.slice(0, 3).map((row, idx) => (
                            <div key={idx}>{String(row[column] || 'N/A')}</div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {editingColumn !== column && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(column)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Schema Analysis Component */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Schema Analysis</h3>
              <SchemaAnalysis schema={editedSchema} />
            </div>

            {/* Changes Summary */}
            {hasChanges && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-yellow-900 mb-1">Schema Changes Detected</h4>
                    <p className="text-sm text-yellow-800">
                      You've modified the detected schema. These changes will be applied to your analysis.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          
          <div className="flex items-center gap-2">
            {hasChanges && (
              <span className="text-sm text-gray-600">
                Changes will be applied
              </span>
            )}
            <Button onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700">
              <CheckCircle className="w-4 h-4 mr-2" />
              Confirm Schema
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}



