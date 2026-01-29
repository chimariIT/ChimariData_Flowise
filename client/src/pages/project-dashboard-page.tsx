import { useRoute, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardBuilder from "@/components/dashboard-builder";
import { Loader2, AlertCircle, RefreshCw, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

export default function ProjectDashboardPage() {
    const [, params] = useRoute("/projects/:id/dashboard");
    const [, setLocation] = useLocation();
    const projectId = params?.id;
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // MEDIUM PRIORITY FIX: Use structured query key for better cache invalidation
    const { data: project, isLoading, error, refetch } = useQuery({
        queryKey: ['project', projectId],
        queryFn: () => apiClient.getProject(projectId!),
        enabled: !!projectId
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    // LOW PRIORITY FIX: Improved error state with more context and retry option
    if (error || !project) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to load project</h2>
                <p className="text-gray-500 mb-4 text-center max-w-md">
                    {error instanceof Error
                        ? error.message
                        : projectId
                            ? `Could not load project "${projectId}". It may have been deleted or you may not have access.`
                            : 'No project ID provided in the URL.'
                    }
                </p>
                <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setLocation('/dashboard')}>
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Back to Dashboard
                    </Button>
                    {projectId && (
                        <Button onClick={() => refetch()}>
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Try Again
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Project Dashboard</h1>
                <p className="text-gray-500">
                    Create and manage visualizations for {(project as any).name || 'this project'}
                </p>
            </div>

            {/* LOW PRIORITY FIX: Use dashboard parameter properly in onSave callback */}
            <DashboardBuilder
                project={project}
                onSave={(dashboard) => {
                    // Show success toast with dashboard info
                    toast({
                        title: "Dashboard saved",
                        description: `"${dashboard?.name || 'Dashboard'}" has been saved successfully.`,
                    });
                    // Invalidate cache to ensure fresh data on next load
                    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
                }}
            />
        </div>
    );
}
