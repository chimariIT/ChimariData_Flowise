import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ProjectContextType {
  currentProject: any | null;
  setCurrentProject: (project: any) => void;
  refreshProject: () => void;
  projects: any[];
  setProjects: (projects: any[]) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [currentProject, setCurrentProjectState] = useState<any | null>(null);
  const [projects, setProjects] = useState<any[]>([]);

  // Load current project from URL params and localStorage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');
    
    if (projectId) {
      // Try to load from localStorage first for immediate availability
      const cachedProject = localStorage.getItem(`project_${projectId}`);
      if (cachedProject) {
        try {
          const project = JSON.parse(cachedProject);
          setCurrentProjectState(project);
        } catch (error) {
          console.error('Failed to parse cached project:', error);
        }
      }
      
      // Then fetch fresh data from API
      fetchProject(projectId);
    }
  }, []);

  // Save project to localStorage whenever it changes
  useEffect(() => {
    if (currentProject?.id) {
      localStorage.setItem(`project_${currentProject.id}`, JSON.stringify(currentProject));
    }
  }, [currentProject]);

  const fetchProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      });
      
      if (response.ok) {
        const project = await response.json();
        setCurrentProjectState(project);
        
        // Update URL if needed
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('project') !== projectId) {
          urlParams.set('project', projectId);
          window.history.replaceState({}, '', `${window.location.pathname}?${urlParams}`);
        }
      }
    } catch (error) {
      console.error('Failed to fetch project:', error);
    }
  };

  const setCurrentProject = (project: any) => {
    setCurrentProjectState(project);
    
    if (project?.id) {
      // Update URL
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set('project', project.id);
      window.history.replaceState({}, '', `${window.location.pathname}?${urlParams}`);
    }
  };

  const refreshProject = () => {
    if (currentProject?.id) {
      fetchProject(currentProject.id);
    }
  };

  return (
    <ProjectContext.Provider value={{
      currentProject,
      setCurrentProject,
      refreshProject,
      projects,
      setProjects
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
}