import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import HomePage from "@/pages/home-page";
import ProjectPage from "@/pages/project-page";
import DescriptiveStatsPage from "@/pages/descriptive-stats-page";
import VisualizationPage from "@/pages/visualization-page";
import AuthPage from "@/pages/auth";
import GuidedAnalysisCheckout from "@/pages/checkout";
import GuidedAnalysisResults from "@/pages/guided-analysis-results";
import Landing from "@/pages/Landing";
import { ProjectProvider } from "@/hooks/useProjectContext";
import { useAuth } from "@/hooks/useAuth";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={HomePage} />
          <Route path="/project/:id" component={ProjectPage} />
          <Route path="/descriptive-stats/:id" component={DescriptiveStatsPage} />
          <Route path="/visualization/:id" component={VisualizationPage} />
          <Route path="/auth" component={AuthPage} />
          <Route path="/checkout" component={GuidedAnalysisCheckout} />
          <Route path="/guided-analysis/:id" component={GuidedAnalysisResults} />
        </>
      )}
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ProjectProvider>
        <Router />
        <Toaster />
      </ProjectProvider>
    </QueryClientProvider>
  );
}