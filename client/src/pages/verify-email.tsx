import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [errorMessage, setErrorMessage] = useState("");
  const [canResend, setCanResend] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    const verifyEmail = async () => {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");

      if (!token) {
        setStatus("error");
        setErrorMessage("No verification token provided");
        return;
      }

      try {
        const response = await fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
        const data = await response.json();

        if (response.ok && data.success) {
          setStatus("success");
          toast({
            title: "Email Verified!",
            description: data.message || "Your email has been verified successfully."
          });
        } else {
          setStatus("error");
          setErrorMessage(data.error || "Verification failed");
          setCanResend(data.canResend || false);
        }
      } catch (error) {
        setStatus("error");
        setErrorMessage("Failed to verify email. Please try again.");
      }
    };

    verifyEmail();
  }, [toast]);

  const handleResendVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResending(true);

    try {
      const result = await apiClient.post("/api/auth/resend-verification", { email: resendEmail });

      if (result.success) {
        toast({
          title: "Email Sent",
          description: result.message || "Verification email sent. Please check your inbox."
        });
        setResendEmail("");
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to resend verification email",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resend verification email. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8 bg-gradient-to-br from-gray-100 to-gray-200">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              {status === "verifying" && (
                <Loader2 className="w-16 h-16 text-gray-500 animate-spin" />
              )}
              {status === "success" && (
                <CheckCircle className="w-16 h-16 text-green-500" />
              )}
              {status === "error" && (
                <XCircle className="w-16 h-16 text-red-500" />
              )}
            </div>
            <CardTitle className="text-3xl">
              {status === "verifying" && "Verifying Email..."}
              {status === "success" && "Email Verified!"}
              {status === "error" && "Verification Failed"}
            </CardTitle>
            <CardDescription>
              {status === "verifying" && "Please wait while we verify your email address."}
              {status === "success" && "Your email has been verified successfully."}
              {status === "error" && errorMessage}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {status === "success" && (
              <div className="space-y-4">
                <p className="text-center text-muted-foreground">
                  You can now log in to your account.
                </p>
                <Button
                  onClick={() => setLocation("/auth")}
                  className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800"
                >
                  Go to Login
                </Button>
              </div>
            )}

            {status === "error" && canResend && (
              <div className="space-y-4">
                <div className="border-t pt-4">
                  <p className="text-sm text-center text-muted-foreground mb-4">
                    Need a new verification link?
                  </p>
                  <form onSubmit={handleResendVerification} className="space-y-4">
                    <div>
                      <Label htmlFor="resend-email">Email Address</Label>
                      <Input
                        id="resend-email"
                        type="email"
                        placeholder="Enter your email"
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800"
                      disabled={isResending}
                    >
                      {isResending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Mail className="w-4 h-4 mr-2" />
                          Resend Verification Email
                        </>
                      )}
                    </Button>
                  </form>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/auth")}
                  className="w-full"
                >
                  Back to Login
                </Button>
              </div>
            )}

            {status === "error" && !canResend && (
              <div className="space-y-4">
                <p className="text-sm text-center text-muted-foreground">
                  Please contact support if you continue to have issues.
                </p>
                <Button
                  onClick={() => setLocation("/auth")}
                  className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800"
                >
                  Back to Login
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
