import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Mail, ArrowLeft, CheckCircle } from "lucide-react";

interface ForgotPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ForgotPasswordModal({ isOpen, onClose }: ForgotPasswordModalProps) {
  const [step, setStep] = useState<'request' | 'verify' | 'reset' | 'success'>('request');
  const [email, setEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() })
      });

      const data = await response.json();

      if (response.ok) {
        setStep('verify');
        toast({
          title: "Reset Code Sent",
          description: "Check your email for the password reset code"
        });
      } else {
        setError(data.error || "Failed to send reset code");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      setError("Please enter the verification code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          email: email.trim(), 
          code: verificationCode.trim() 
        })
      });

      const data = await response.json();

      if (response.ok) {
        setStep('reset');
      } else {
        setError(data.error || "Invalid verification code");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          code: verificationCode.trim(),
          newPassword
        })
      });

      const data = await response.json();

      if (response.ok) {
        setStep('success');
        toast({
          title: "Password Reset Successfully",
          description: "You can now log in with your new password"
        });
      } else {
        setError(data.error || "Failed to reset password");
      }
    } catch (error) {
      setError("Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setStep('request');
    setEmail("");
    setVerificationCode("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    onClose();
  };

  const renderContent = () => {
    switch (step) {
      case 'request':
        return (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                disabled={isLoading}
              />
            </div>
            
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Sending..." : "Send Reset Code"}
            </Button>
          </form>
        );

      case 'verify':
        return (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="text-center mb-4">
              <Mail className="w-12 h-12 mx-auto text-blue-500 mb-2" />
              <p className="text-sm text-gray-600">
                We've sent a verification code to <strong>{email}</strong>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter 6-digit code"
                maxLength={6}
                disabled={isLoading}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setStep('request')}
                disabled={isLoading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? "Verifying..." : "Verify Code"}
              </Button>
            </div>
          </form>
        );

      case 'reset':
        return (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                disabled={isLoading}
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setStep('verify')}
                disabled={isLoading}
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? "Resetting..." : "Reset Password"}
              </Button>
            </div>
          </form>
        );

      case 'success':
        return (
          <div className="text-center space-y-4">
            <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
            <div>
              <h3 className="text-lg font-medium text-green-700">Password Reset Complete</h3>
              <p className="text-sm text-gray-600 mt-2">
                Your password has been successfully reset. You can now log in with your new password.
              </p>
            </div>
            <Button onClick={handleClose} className="w-full">
              Continue to Login
            </Button>
          </div>
        );
    }
  };

  const getTitle = () => {
    switch (step) {
      case 'request': return "Forgot Password";
      case 'verify': return "Verify Email";
      case 'reset': return "Reset Password";
      case 'success': return "Password Reset Complete";
      default: return "Forgot Password";
    }
  };

  const getDescription = () => {
    switch (step) {
      case 'request': return "Enter your email address and we'll send you a code to reset your password.";
      case 'verify': return "Enter the verification code sent to your email.";
      case 'reset': return "Choose a new password for your account.";
      case 'success': return "";
      default: return "";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          {getDescription() && (
            <DialogDescription>{getDescription()}</DialogDescription>
          )}
        </DialogHeader>
        
        <div className="mt-4">
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}