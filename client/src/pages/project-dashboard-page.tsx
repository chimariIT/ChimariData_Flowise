import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardBuilder from "@/components/dashboard-builder";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProjectDashboardPage() {
    const [, params] = useRoute("/projects/:id/dashboard");
    const projectId = params?.id;
    const { toast } = useToast();

    const { data: project, isLoading, error } = useQuery({
        queryKey: [`/api/projects/${projectId}`],
        enabled: !!projectId
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !project) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-red-500">
                <p>Failed to load project</p>
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

            <DashboardBuilder
                project={project}
                onSave={(dashboard) => {
                    console.log("Dashboard saved:", dashboard);
                    // Optional: Redirect or show success message (already handled in component)
                }}
            />
        </div>
    );
}
