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

  const { data: projects, isLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      const result = await apiClient.getProjects();
      return result;
    },
    enabled: !!projectId,
  });

  const project = projects?.projects?.find((p: any) => p.id === projectId);

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

  const schemaFields = project.schema ? Object.entries(project.schema).map(([name, info]: [string, any]) => ({
    name,
    type: info.type || 'text',
    description: info.description || '',
    nullable: info.nullable,
    unique: info.unique,
    sampleValues: info.sampleValues || []
  })) : [];

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