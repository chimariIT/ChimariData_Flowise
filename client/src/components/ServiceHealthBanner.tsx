import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, XCircle, Info, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useState } from 'react';

interface ServiceHealth {
    allServicesOperational: boolean;
    sparkAvailable: boolean;
    pythonAvailable: boolean;
    redisAvailable: boolean;
    databaseAvailable: boolean;
    usingMockData: boolean;
    details: {
        failures: string[];
        warnings: string[];
        services: {
            python: { available: boolean; details: string; critical: boolean };
            spark: { available: boolean; details: string; critical: boolean };
            redis: { available: boolean; details: string; critical: boolean };
            database: { available: boolean; details: string; critical: boolean };
        };
    };
}

export function ServiceHealthBanner() {
    const [isMinimized, setIsMinimized] = useState(false);
    const [isDismissed, setIsDismissed] = useState(false);
    
    const { data: health, isLoading } = useQuery<ServiceHealth>({
        queryKey: ['service-health'],
        queryFn: () => fetch('/api/health').then(r => r.json()).catch(() => ({ allServicesOperational: true })),
        refetchInterval: 60000, // Refresh every minute
        retry: 3,
        staleTime: 30000 // Consider data fresh for 30 seconds
    });

    if (isLoading || !health) return null;

    // Don't show banner if all services operational
    if (health.allServicesOperational) return null;
    
    // Don't show if dismissed
    if (isDismissed) return null;

    const criticalFailures = health.details?.failures || [];
    const warnings = health.details?.warnings || [];
    const isCritical = criticalFailures.length > 0;
    
    // Detect if we're in development mode
    const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';
    
    // In development with only non-critical warnings, show a friendlier info banner
    const isDevInfoOnly = isDevelopment && !isCritical && warnings.length > 0;

    return (
        <div className="fixed top-0 left-0 right-0 z-50 animate-in slide-in-from-top duration-300">
            <Alert
                variant={isCritical ? "destructive" : "default"}
                className={`rounded-none border-l-4 ${
                    isCritical
                        ? 'bg-red-50 border-red-500 dark:bg-red-950/50'
                        : isDevInfoOnly
                            ? 'bg-blue-50 border-blue-400 dark:bg-blue-950/50'
                            : 'bg-yellow-50 border-yellow-400 dark:bg-yellow-950/50'
                }`}
            >
                <div className="flex items-start gap-3">
                    {isCritical ? (
                        <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    ) : isDevInfoOnly ? (
                        <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                    ) : (
                        <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    )}

                    <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                            <AlertTitle className={
                                isCritical 
                                    ? 'text-red-900 dark:text-red-100' 
                                    : isDevInfoOnly
                                        ? 'text-blue-900 dark:text-blue-100'
                                        : 'text-yellow-900 dark:text-yellow-100'
                            }>
                                {isCritical 
                                    ? 'Critical Service Issues Detected' 
                                    : isDevInfoOnly
                                        ? 'ℹ️ Development Mode Active'
                                        : 'Some Services Operating in Degraded Mode'}
                            </AlertTitle>
                            
                            <div className="flex items-center gap-2">
                                {/* Minimize/Expand Button */}
                                <button
                                    onClick={() => setIsMinimized(!isMinimized)}
                                    className={`p-1 rounded hover:bg-white/50 dark:hover:bg-black/20 transition-colors ${
                                        isCritical 
                                            ? 'text-red-700 dark:text-red-300' 
                                            : isDevInfoOnly
                                                ? 'text-blue-700 dark:text-blue-300'
                                                : 'text-yellow-700 dark:text-yellow-300'
                                    }`}
                                    aria-label={isMinimized ? "Expand banner" : "Minimize banner"}
                                    title={isMinimized ? "Show details" : "Hide details"}
                                >
                                    {isMinimized ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                                </button>
                                
                                {/* Dismiss Button (only for non-critical) */}
                                {!isCritical && (
                                    <button
                                        onClick={() => setIsDismissed(true)}
                                        className={`p-1 rounded hover:bg-white/50 dark:hover:bg-black/20 transition-colors ${
                                            isDevInfoOnly
                                                ? 'text-blue-700 dark:text-blue-300'
                                                : 'text-yellow-700 dark:text-yellow-300'
                                        }`}
                                        aria-label="Dismiss banner"
                                        title="Dismiss this message"
                                    >
                                        <X className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {!isMinimized && (
                            <AlertDescription className={
                                isCritical 
                                    ? 'text-red-800 dark:text-red-200' 
                                    : isDevInfoOnly
                                        ? 'text-blue-800 dark:text-blue-200'
                                        : 'text-yellow-800 dark:text-yellow-200'
                            }>
                            {isDevInfoOnly ? (
                                // Friendly development mode message
                                <div className="space-y-2">
                                    <p className="text-sm">
                                        Some services are mocked for local development. This is <strong>normal and expected</strong>.
                                    </p>
                                    <div className="text-xs bg-white dark:bg-gray-900 rounded p-2 border border-blue-200 dark:border-blue-800">
                                        <p className="font-medium mb-1">What this means:</p>
                                        <ul className="list-disc list-inside space-y-0.5 ml-2">
                                            <li>Analysis results may use simulation for development testing</li>
                                            <li>Install Python, Spark, and Redis for real production-like analysis</li>
                                            <li>Production deployment will use real services automatically</li>
                                        </ul>
                                    </div>
                                </div>
                            ) : (
                                // Original warning/error messages for production
                                <>
                                    {health.usingMockData && (
                                        <div className="flex items-start gap-2 mb-2 p-2 bg-white dark:bg-gray-900 rounded border border-red-300 dark:border-red-700">
                                            <Info className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-semibold text-red-900 dark:text-red-100">
                                                    ⚠️ Analysis Results May Be Simulated
                                                </p>
                                                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                                                    Some analysis services are unavailable. Results may not reflect real computational analysis.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {criticalFailures.length > 0 && (
                                        <div className="space-y-1 mb-2">
                                            <p className="font-semibold">Critical Issues:</p>
                                            <ul className="list-disc list-inside space-y-1 text-sm">
                                                {criticalFailures.map((failure, idx) => (
                                                    <li key={idx}>{failure}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {warnings.length > 0 && !isCritical && (
                                        <div className="space-y-1">
                                            <p className="font-semibold">Service Limitations:</p>
                                            <ul className="list-disc list-inside space-y-1 text-sm">
                                                {warnings.map((warning, idx) => (
                                                    <li key={idx}>{warning}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            )}

                            <div className="mt-3 pt-3 border-t border-current/20">
                                <p className="text-sm font-medium mb-1">Service Status:</p>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                    <ServiceStatusItem
                                        name="Python Analysis"
                                        available={health.pythonAvailable}
                                        critical={health.details?.services?.python?.critical}
                                    />
                                    <ServiceStatusItem
                                        name="Spark Processing"
                                        available={health.sparkAvailable}
                                        critical={health.details?.services?.spark?.critical}
                                    />
                                    <ServiceStatusItem
                                        name="Agent Coordination"
                                        available={health.redisAvailable}
                                        critical={health.details?.services?.redis?.critical}
                                    />
                                    <ServiceStatusItem
                                        name="Database"
                                        available={health.databaseAvailable}
                                        critical={health.details?.services?.database?.critical}
                                    />
                                </div>
                            </div>

                            {isCritical && (
                                <p className="mt-3 text-sm font-medium">
                                    Please contact support if this issue persists.
                                </p>
                            )}
                        </AlertDescription>
                        )}
                    </div>
                </div>
            </Alert>
        </div>
    );
}

function ServiceStatusItem({
    name,
    available,
    critical
}: {
    name: string;
    available: boolean;
    critical?: boolean;
}) {
    return (
        <div className="flex items-center gap-2">
            <div
                className={`w-2 h-2 rounded-full ${
                    available
                        ? 'bg-green-500'
                        : critical
                            ? 'bg-red-500'
                            : 'bg-yellow-500'
                }`}
            />
            <span className="text-xs">
                {name}
                {!available && critical && <span className="ml-1 text-red-600 dark:text-red-400">*</span>}
            </span>
        </div>
    );
}
