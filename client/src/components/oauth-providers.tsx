import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface OAuthProvider {
  name: string;
  authUrl: string;
}

interface OAuthProvidersProps {
  title?: string;
  description?: string;
  showTitle?: boolean;
}

export function OAuthProviders({ 
  title = "Sign in to your account", 
  description = "Choose your preferred sign-in method",
  showTitle = true 
}: OAuthProvidersProps) {
  
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch available providers from backend
    fetch('/api/auth/providers')
      .then(res => res.json())
      .then(data => {
        setProviders(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch OAuth providers:', err);
        setLoading(false);
      });
  }, []);
  
  const handleProviderLogin = (authUrl: string) => {
    window.location.href = authUrl;
  };

  const getProviderIcon = (providerName: string) => {
    switch (providerName.toLowerCase()) {
      case 'google':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        );
      case 'microsoft':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#f25022" d="M1 1h10v10H1z"/>
            <path fill="#00a4ef" d="M13 1h10v10H13z"/>
            <path fill="#7fba00" d="M1 13h10v10H1z"/>
            <path fill="#ffb900" d="M13 13h10v10H13z"/>
          </svg>
        );
      case 'apple':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
        );
      default:
        return null;
    }
  };

  const getProviderDisplayName = (providerName: string) => {
    switch (providerName.toLowerCase()) {
      case 'google':
        return 'Google';
      case 'microsoft':
        return 'Microsoft';
      case 'apple':
        return 'Apple';
      default:
        return providerName.charAt(0).toUpperCase() + providerName.slice(1);
    }
  };

  if (loading) {
    return (
      <Card className="w-full max-w-md">
        {showTitle && (
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
        )}
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      {showTitle && (
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {providers.map((provider) => (
          <Button
            key={provider.name}
            variant="outline"
            size="lg"
            className="w-full flex items-center gap-3 h-12"
            onClick={() => handleProviderLogin(provider.authUrl)}
          >
            {getProviderIcon(provider.name)}
            Sign in with {getProviderDisplayName(provider.name)}
          </Button>
        ))}
        
        {providers.length > 0 && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Secure authentication
                </span>
              </div>
            </div>
            
            <p className="text-xs text-center text-muted-foreground">
              Your data is protected by enterprise-grade security measures
            </p>
          </>
        )}
        
        {providers.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No authentication providers configured
          </p>
        )}
      </CardContent>
    </Card>
  );
}