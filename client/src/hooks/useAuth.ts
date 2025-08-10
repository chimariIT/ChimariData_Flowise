import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useAuth() {
  const queryClient = useQueryClient();
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // 5 minutes
    // Only fetch if we have a token or are checking authentication status
    enabled: true,
  });

  const logout = () => {
    // Clear local storage
    localStorage.removeItem('auth_token');
    // Clear React Query cache
    queryClient.clear();
    // Redirect to auth page
    window.location.href = '/auth';
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    logout
  };
}