import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle } from 'lucide-react';

// Mock templates for testing
const MOCK_TEMPLATES = [
  { id: 'template-1', name: 'Sales Analysis', description: 'Analyze sales performance' },
  { id: 'template-2', name: 'Marketing ROI', description: 'Measure marketing effectiveness' },
  { id: 'template-3', name: 'Customer Satisfaction', description: 'Analyze customer feedback' },
  { id: 'template-4', name: 'Operations Efficiency', description: 'Optimize operational processes' }
];

export function TemplateSelectionTest() {
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [clickLog, setClickLog] = useState<string[]>([]);

  const handleTemplateToggle = (templateId: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `${timestamp}: Clicked ${templateId}`;
    
    console.log('=== TEMPLATE TOGGLE DEBUG ===');
    console.log('Template ID:', templateId);
    console.log('Current selected:', selectedTemplates);
    console.log('Is currently selected:', selectedTemplates.includes(templateId));
    
    setClickLog(prev => [...prev, logEntry]);
    
    setSelectedTemplates(prev => {
      const isSelected = prev.includes(templateId);
      const next = isSelected 
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId];
      
      console.log('Previous state:', prev);
      console.log('Is selected:', isSelected);
      console.log('Next state:', next);
      console.log('============================');
      
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedTemplates([]);
    setClickLog([]);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Template Selection Test</CardTitle>
          <div className="flex gap-2">
            <button 
              onClick={clearSelection}
              className="px-3 py-1 bg-red-100 text-red-800 rounded text-sm"
            >
              Clear All
            </button>
            <div className="text-sm text-gray-600">
              Selected: {selectedTemplates.length} templates
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {MOCK_TEMPLATES.map((template, index) => (
              <div
                key={`template-${template.id}-${index}`}
                data-testid="template-item"
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  selectedTemplates.includes(template.id)
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
                onClick={() => {
                  console.log('Template clicked:', template.id, template.name);
                  handleTemplateToggle(template.id);
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{template.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    <p className="text-xs text-gray-400 mt-1">ID: {template.id}</p>
                  </div>
                  {selectedTemplates.includes(template.id) && (
                    <CheckCircle className="w-5 h-5 text-green-600" data-testid="selected-template" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Debug Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Selected Templates:</h4>
              <div className="bg-gray-100 p-2 rounded text-sm font-mono">
                {JSON.stringify(selectedTemplates, null, 2)}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Click Log:</h4>
              <div className="bg-gray-100 p-2 rounded text-sm font-mono max-h-32 overflow-y-auto">
                {clickLog.length === 0 ? 'No clicks yet' : clickLog.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
