import crypto from 'crypto';
import bcrypt from 'bcrypt';

// In-memory store for reset tokens (in production, use database)
const resetTokens = new Map<string, {
  email: string;
  code: string;
  expiresAt: Date;
  used: boolean;
}>();

export class PasswordResetService {
  // Generate a 6-digit verification code
  static generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Generate a secure token
  static generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  // Create a password reset request
  static async createResetRequest(email: string): Promise<{ success: boolean; code?: string; error?: string }> {
    try {
      // Import storage dynamically to avoid circular dependency
      const { storage } = await import('./storage');
      
      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);

      if (!existingUser) {
        // Don't reveal whether email exists for security - return success anyway
        return { success: true }; 
      }

      // Check if user has a password (not OAuth-only)
      if (!existingUser.hashedPassword) {
        return { 
          success: false, 
          error: 'This account uses social login. Please sign in using the social login button.' 
        };
      }

      // Generate verification code and token
      const code = this.generateVerificationCode();
      const token = this.generateToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Clean up any existing unused tokens for this email
      for (const [key, value] of resetTokens.entries()) {
        if (value.email === email && !value.used) {
          resetTokens.delete(key);
        }
      }

      // Store reset token
      resetTokens.set(token, {
        email,
        code,
        expiresAt,
        used: false
      });

      console.log(`Password reset code for ${email}: ${code}`); // In production, send via email

      return { success: true, code };
    } catch (error) {
      console.error('Error creating reset request:', error);
      return { success: false, error: 'Failed to create reset request' };
    }
  }

  // Verify the reset code
  static async verifyResetCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
    try {
      for (const [token, data] of resetTokens.entries()) {
        if (data.email === email && 
            data.code === code && 
            !data.used && 
            data.expiresAt > new Date()) {
          return { success: true };
        }
      }

      return { success: false, error: 'Invalid or expired verification code' };
    } catch (error) {
      console.error('Error verifying reset code:', error);
      return { success: false, error: 'Failed to verify code' };
    }
  }

  // Reset the password
  static async resetPassword(
    email: string, 
    code: string, 
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Import storage dynamically to avoid circular dependency
      const { storage } = await import('./storage');
      
      // Find and validate the reset token
      let validToken: string | null = null;
      for (const [token, data] of resetTokens.entries()) {
        if (data.email === email && 
            data.code === code && 
            !data.used && 
            data.expiresAt > new Date()) {
          validToken = token;
          break;
        }
      }

      if (!validToken) {
        return { success: false, error: 'Invalid or expired verification code' };
      }

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (!existingUser) {
        return { success: false, error: 'User not found' };
      }

      // Hash the new password
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update user password
      await storage.updateUser(existingUser.id, { 
        hashedPassword,
        updatedAt: new Date()
      });

      // Mark the reset token as used
      const tokenData = resetTokens.get(validToken);
      if (tokenData) {
        tokenData.used = true;
      }

      return { success: true };
    } catch (error) {
      console.error('Error resetting password:', error);
      return { success: false, error: 'Failed to reset password' };
    }
  }

  // Clean up expired tokens (should be run periodically)
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const now = new Date();
      for (const [token, data] of resetTokens.entries()) {
        if (data.expiresAt < now) {
          resetTokens.delete(token);
        }
      }
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
    }
  }
}