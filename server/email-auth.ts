import bcrypt from "bcryptjs";
import crypto from "crypto";
import { storage } from "./hybrid-storage";
import { registerSchema, loginSchema } from "@shared/schema";
import { z } from "zod";

export interface EmailAuthService {
  register(userData: z.infer<typeof registerSchema>): Promise<{ user: any; token: string }>;
  login(credentials: z.infer<typeof loginSchema>): Promise<{ user: any; token: string }>;
  verifyEmail(token: string): Promise<{ success: boolean; message: string }>;
  sendVerificationEmail(email: string): Promise<{ success: boolean; message: string }>;
  generateAuthToken(userId: string): string;
  verifyAuthToken(token: string): Promise<{ userId: string } | null>;
}

class EmailAuthServiceImpl implements EmailAuthService {
  
  async register(userData: z.infer<typeof registerSchema>): Promise<{ user: any; token: string }> {
    const { email, password, firstName, lastName } = userData;
    
    // Check if user already exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      throw new Error("User already exists with this email");
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Create user ID for email registration
    const userId = crypto.randomBytes(16).toString('hex');
    
    // Create user
    const user = await storage.createUser({
      id: userId,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      provider: "local",
      emailVerified: false,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires
    });
    
    // Send verification email
    await this.sendVerificationEmail(email);
    
    // Generate auth token
    const token = this.generateAuthToken(userId);
    
    return { 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified
      }, 
      token 
    };
  }
  
  async login(credentials: z.infer<typeof loginSchema>): Promise<{ user: any; token: string }> {
    const { email, password } = credentials;
    
    // Find user by email
    const user = await storage.getUserByEmail(email);
    if (!user) {
      throw new Error("Invalid email or password");
    }
    
    // Check if user is using email/password authentication
    if (user.provider !== "local" || !user.password) {
      throw new Error("This account uses social login. Please use the sign-in button.");
    }
    
    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }
    
    // Generate auth token
    const token = this.generateAuthToken(user.id);
    
    return { 
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        emailVerified: user.emailVerified
      }, 
      token 
    };
  }
  
  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    const user = await storage.getUserByVerificationToken(token);
    
    if (!user) {
      return { success: false, message: "Invalid or expired verification token" };
    }
    
    if (user.emailVerificationExpires && new Date() > user.emailVerificationExpires) {
      return { success: false, message: "Verification token has expired" };
    }
    
    // Update user as verified
    await storage.updateUser(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null
    });
    
    return { success: true, message: "Email verified successfully" };
  }
  
  async sendVerificationEmail(email: string): Promise<{ success: boolean; message: string }> {
    // For development, we'll simulate sending email
    // In production, integrate with services like SendGrid, AWS SES, etc.
    
    const user = await storage.getUserByEmail(email);
    if (!user || !user.emailVerificationToken) {
      return { success: false, message: "User not found or no verification token" };
    }
    
    // In development, log the verification URL
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${user.emailVerificationToken}`;
    console.log(`
    ===============================================
    EMAIL VERIFICATION REQUIRED
    ===============================================
    To: ${email}
    Subject: Verify your ChimariData account
    
    Please click the link below to verify your email:
    ${verificationUrl}
    
    This link will expire in 24 hours.
    ===============================================
    `);
    
    return { success: true, message: "Verification email sent" };
  }
  
  generateAuthToken(userId: string): string {
    // Simple token generation - in production, use JWT or similar
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
    
    // Store token in memory for simplicity
    // In production, use Redis or database
    tokenStore.set(token, { userId, expiresAt });
    
    return token;
  }
  
  async verifyAuthToken(token: string): Promise<{ userId: string } | null> {
    const tokenData = tokenStore.get(token);
    
    if (!tokenData) {
      return null;
    }
    
    if (Date.now() > tokenData.expiresAt) {
      tokenStore.delete(token);
      return null;
    }
    
    return { userId: tokenData.userId };
  }
}

// Simple in-memory token store
// In production, use Redis or database
const tokenStore = new Map<string, { userId: string; expiresAt: number }>();

export const emailAuthService = new EmailAuthServiceImpl();