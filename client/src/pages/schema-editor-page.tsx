import React, { useState, useEffect } from 'react';
import { useRoute } from 'wouter';
import { useLocation } from 'wouter';
import { SchemaEditor } from '@/components/schema-editor';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from "@/lib/api";
import { Loader2 } from 'lucide-react';

export default function SchemaEditorPage() {
  const [, params] = useRoute('/project/:id/schema');
  const [, setLocation] = useLocation();
  const projectId = params?.id;

  const { data: projects, isLoading, error } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      try {
        const result = await apiClient.getProjects();
        console.log('Schema editor - projects response:', result);
        return result;
      } catch (error) {
        console.error('Schema editor - failed to fetch projects:', error);
        throw error;
      }
    },
    enabled: !!projectId,
    retry: false
  });

  const project = projects?.projects?.find((p: any) => p.id === projectId);
  
  console.log('Schema editor debug:', {
    projectId,
    projects: projects?.projects,
    project,
    isLoading,
    error: error?.message
  });

  // If there's an authentication error, redirect to login
  if (error && error.message?.includes('Failed to fetch projects: 401')) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">Please sign in to access the schema editor.</p>
          <button 
            onClick={() => window.location.href = '/auth'}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const handleSave = (updatedSchema: any) => {
    // Navigate back to project results after saving
    setLocation(`/project/${projectId}`);
  };

  const handleCancel = () => {
    // Navigate back to project results
    setLocation(`/project/${projectId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Project Not Found</h2>
          <p className="text-muted-foreground">The requested project could not be found.</p>
        </div>
      </div>
    );
  }

  const schemaFields = project.schema ? Object.entries(project.schema).map(([name, info]: [string, any]) => {
    // Handle both old string format and new object format
    const fieldInfo = typeof info === 'object' ? info : { type: info, description: '' };
    
    return {
      name,
      type: fieldInfo.type || 'text',
      description: fieldInfo.description || '',
      nullable: fieldInfo.nullable || false,
      unique: fieldInfo.unique || false,
      sampleValues: fieldInfo.sampleValues || []
    };
  }) : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <SchemaEditor
        projectId={projectId!}
        initialSchema={schemaFields}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  );
}