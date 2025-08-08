import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, BarChart3, Brain, TrendingUp } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            ChimariData.com
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Transform your data into actionable insights with our progressive analytics platform
          </p>
          <Button 
            onClick={() => window.location.href = '/api/login'} 
            size="lg"
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
          >
            Log In to Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card className="text-center">
            <CardHeader>
              <Upload className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <CardTitle>Data Upload</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Upload CSV, Excel, or other data files for instant analysis
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <TrendingUp className="w-12 h-12 text-green-600 mx-auto mb-4" />
              <CardTitle>Data Transformation</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Clean, transform, and prepare your data for analysis
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <BarChart3 className="w-12 h-12 text-purple-600 mx-auto mb-4" />
              <CardTitle>Visualization</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Create beautiful charts and visualizations from your data
              </CardDescription>
            </CardContent>
          </Card>

          <Card className="text-center">
            <CardHeader>
              <Brain className="w-12 h-12 text-orange-600 mx-auto mb-4" />
              <CardTitle>AI Insights</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Get intelligent insights powered by advanced AI analysis
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Four Progressive Paths to Data Excellence
          </h2>
          <p className="text-gray-600 mb-8 max-w-3xl mx-auto">
            Choose from Data Transformation, Data Analysis, Data Visualizations, or AI Insights. 
            Each path is designed to meet your specific analytical needs with professional-grade tools.
          </p>
          <div className="bg-white rounded-lg p-6 shadow-lg max-w-md mx-auto">
            <h3 className="font-semibold text-lg mb-2">Free Trial Available</h3>
            <p className="text-gray-600 text-sm">
              Try our platform with basic descriptive analysis and visualizations for files up to 10MB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}