import type { ComponentProps } from "react";
import AuthPage from "./auth";

type AuthLoginProps = ComponentProps<typeof AuthPage> & {
  /**
   * Legacy prop kept for backwards compatibility. The new auth flow handles
   * registration within the shared AuthPage component, so this callback is no
   * longer used.
   */
  onRegister?: () => void;
};

export default function AuthLoginPage({ onLogin }: AuthLoginProps) {
  return <AuthPage onLogin={onLogin} />;
}