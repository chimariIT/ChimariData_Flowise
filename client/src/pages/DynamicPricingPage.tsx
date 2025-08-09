import { useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { DynamicPricingWorkflow } from '@/components/DynamicPricingWorkflow';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, BarChart, Brain, Settings, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function DynamicPricingPage() {
  const [match, params] = useRoute('/pricing/:projectId');
  const [location, setLocation] = useLocation();
  const projectId = params?.projectId;

  if (!match || !projectId) {
    return <PricingLandingPage onUpload={(id) => setLocation(`/pricing/${id}`)} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto py-8">
        <DynamicPricingWorkflow 
          projectId={projectId}
          onComplete={(workflowId) => {
            setLocation(`/results/${projectId}`);
          }}
        />
      </div>
    </div>
  );
}

function PricingLandingPage({ onUpload }: { onUpload: (projectId: string) => void }) {
  const [dragOver, setDragOver] = useState(false);

  const features = [
    {
      id: 'data_transformation',
      name: 'Data Engineering',
      icon: Settings,
      description: 'Clean, normalize, join datasets, handle missing data, detect outliers',
      startingPrice: 15,
      examples: ['Data cleaning', 'Outlier detection', 'Missing data imputation', 'Dataset joining'],
      complexity: 'Based on data quality issues'
    },
    {
      id: 'data_visualization',
      name: 'Data Visualization',
      icon: BarChart,
      description: 'Professional charts, interactive dashboards, custom visualizations',
      startingPrice: 20,
      examples: ['Bar/line/scatter plots', 'Heatmaps & boxplots', 'Interactive charts', 'Custom dashboards'],
      complexity: 'Based on chart types and interactivity'
    },
    {
      id: 'data_analysis',
      name: 'Data Analysis',
      icon: FileText,
      description: 'Statistical analysis, regression, ANOVA, machine learning, predictive modeling',
      startingPrice: 25,
      examples: ['Correlation analysis', 'Regression modeling', 'ANOVA/ANCOVA', 'Machine learning'],
      complexity: 'Based on analysis type and model complexity'
    },
    {
      id: 'ai_insights',
      name: 'AI Insights',
      icon: Brain,
      description: 'Intelligent business insights, pattern recognition, automated reporting',
      startingPrice: 35,
      examples: ['Business insights', 'Predictive analysis', 'Pattern recognition', 'Root cause analysis'],
      complexity: 'Based on AI model complexity and custom requirements'
    }
  ];

  const handleFileUpload = async (file: File) => {
    // This would typically upload the file and create a project
    // For now, we'll simulate this
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      // Upload file and get project ID
      const response = await fetch('/api/trial-upload', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      if (result.success && result.projectId) {
        onUpload(result.projectId);
      }
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Dynamic Data Analytics Pricing
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Pay only for what you need. Our intelligent pricing system calculates costs based on your 
            data complexity, file size, and selected features.
          </p>
          
          {/* Key Benefits */}
          <div className="flex flex-wrap justify-center gap-4 mb-8">
            <Badge variant="secondary" className="px-4 py-2">
              File-size based pricing
            </Badge>
            <Badge variant="secondary" className="px-4 py-2">
              Complexity adjustments
            </Badge>
            <Badge variant="secondary" className="px-4 py-2">
              Multi-feature discounts
            </Badge>
            <Badge variant="secondary" className="px-4 py-2">
              Transparent breakdown
            </Badge>
          </div>
        </div>

        {/* File Upload Section */}
        <Card className="max-w-2xl mx-auto mb-12">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-6 w-6" />
              Upload Your Data to Get Started
            </CardTitle>
            <CardDescription>
              Upload your CSV, Excel, JSON, or text files to see personalized pricing recommendations
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-all ${
                dragOver 
                  ? 'border-primary bg-primary/5' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Drop your data file here
              </h3>
              <p className="text-gray-600 mb-4">
                Supports CSV, Excel, JSON files up to 100MB
              </p>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".csv,.xlsx,.xls,.json,.txt"
                onChange={handleFileInput}
              />
              <Button 
                onClick={() => document.getElementById('file-upload')?.click()}
                variant="outline"
              >
                Choose File
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Structure */}
        <div className="mb-12">
          <h2 className="text-3xl font-bold text-center mb-8">
            Intelligent Feature Pricing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <CardTitle className="text-lg">{feature.name}</CardTitle>
                    </div>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="text-2xl font-bold text-primary">
                          ${feature.startingPrice}+
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {feature.complexity}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="font-medium mb-2">Includes:</h4>
                        <ul className="text-sm space-y-1">
                          {feature.examples.map((example, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <div className="w-1 h-1 bg-primary rounded-full"></div>
                              {example}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* How It Works */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="text-2xl text-center">How Dynamic Pricing Works</CardTitle>
            <CardDescription className="text-center text-lg">
              Our system analyzes your data to provide fair, transparent pricing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-blue-600 font-bold">1</span>
                </div>
                <h3 className="font-semibold mb-2">Data Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  We analyze your file size, record count, data types, and complexity factors
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-green-600 font-bold">2</span>
                </div>
                <h3 className="font-semibold mb-2">Feature Selection</h3>
                <p className="text-sm text-muted-foreground">
                  Choose the features you need with personalized recommendations
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-purple-600 font-bold">3</span>
                </div>
                <h3 className="font-semibold mb-2">Dynamic Pricing</h3>
                <p className="text-sm text-muted-foreground">
                  Get transparent pricing with discounts for complexity and multi-feature selection
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Benefits */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle>Complexity-Based Adjustments</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-green-600" />
                  <span>Higher costs for PII handling and data quality issues</span>
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-green-600" />
                  <span>Discounts for simple, clean datasets</span>
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-green-600" />
                  <span>Processing time estimates based on complexity</span>
                </li>
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Multi-Feature Discounts</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-600" />
                  <span>15% discount for 2 features</span>
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-600" />
                  <span>25% discount for 3 features</span>
                </li>
                <li className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-blue-600" />
                  <span>35% discount for all 4 features</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center">
          <h3 className="text-2xl font-semibold mb-4">
            Ready to see your personalized pricing?
          </h3>
          <p className="text-gray-600 mb-6">
            Upload your data to get started with intelligent, fair pricing
          </p>
          <Button 
            size="lg"
            onClick={() => document.getElementById('file-upload')?.click()}
            className="px-8 py-3"
          >
            Upload Data & Get Pricing
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}