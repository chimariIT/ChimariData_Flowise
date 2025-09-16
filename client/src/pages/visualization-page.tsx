import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import VisualizationWorkshop from "@/components/visualization-workshop";

export default function VisualizationPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [, setLocation] = useLocation();

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["/api/projects", projectId],
    queryFn: async () => {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.status === 401) {
        // Clear invalid token
        localStorage.removeItem('auth_token');
        throw new Error('Authentication required');
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch project: ${response.status}`);
      }
      return await response.json();
    },
    enabled: !!projectId,
    retry: false // Don't retry on auth failures
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading project...</span>
        </div>
      </div>
    );
  }

  if (error || !project) {
    const isAuthError = error?.message?.includes('Authentication required');
    
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{isAuthError ? "Authentication Required" : "Project Not Found"}</CardTitle>
            <CardDescription>
              {isAuthError 
                ? "You need to sign in to access this visualization. Please log in and try again."
                : "The requested project could not be found. This may happen if the project was deleted or you don't have access to it."
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isAuthError ? (
              <>
                <Button onClick={() => setLocation("/auth/login")} className="w-full">
                  Sign In
                </Button>
                <Button onClick={() => setLocation("/")} variant="outline" className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </>
            ) : (
              <Button onClick={() => setLocation("/")} className="w-full">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation(`/project/${projectId}`)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Project
          </Button>
        </div>
      </div>
      
      <VisualizationWorkshop 
        project={project} 
        onClose={() => setLocation(`/project/${projectId}`)}
      />
    </div>
  );
}