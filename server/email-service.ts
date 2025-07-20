import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

export interface EmailVerificationParams {
  to: string;
  firstName?: string;
  verificationUrl: string;
}

export interface PasswordResetParams {
  to: string;
  firstName?: string;
  resetUrl: string;
}

export class EmailService {
  private static FROM_EMAIL = 'verification@chimaridata.com';
  private static FROM_NAME = 'ChimariData';

  static async sendVerificationEmail(params: EmailVerificationParams): Promise<boolean> {
    try {
      const { to, firstName, verificationUrl } = params;
      
      const msg = {
        to,
        from: {
          email: this.FROM_EMAIL,
          name: this.FROM_NAME
        },
        subject: 'Verify your ChimariData account',
        html: this.getVerificationEmailTemplate(firstName || 'User', verificationUrl),
        text: this.getVerificationEmailText(firstName || 'User', verificationUrl)
      };

      await mailService.send(msg);
      console.log(`✅ Verification email sent to ${to}`);
      return true;
    } catch (error) {
      console.error('❌ SendGrid verification email error:', error);
      return false;
    }
  }

  static async sendPasswordResetEmail(params: PasswordResetParams): Promise<boolean> {
    try {
      const { to, firstName, resetUrl } = params;
      
      const msg = {
        to,
        from: {
          email: this.FROM_EMAIL,
          name: this.FROM_NAME
        },
        subject: 'Reset your ChimariData password',
        html: this.getPasswordResetEmailTemplate(firstName || 'User', resetUrl),
        text: this.getPasswordResetEmailText(firstName || 'User', resetUrl)
      };

      await mailService.send(msg);
      console.log(`✅ Password reset email sent to ${to}`);
      return true;
    } catch (error) {
      console.error('❌ SendGrid password reset email error:', error);
      return false;
    }
  }

  private static getVerificationEmailTemplate(firstName: string, verificationUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify Your ChimariData Account</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .button:hover { background: #5a6fd8; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to ChimariData!</h1>
            <p>Progressive Data Analytics Platform</p>
        </div>
        <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>Thank you for joining ChimariData! To complete your account setup and access our progressive data analytics platform, please verify your email address.</p>
            
            <p style="text-align: center;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
            </p>
            
            <p>Once verified, you'll have access to our tiered analytics platform:</p>
            <ul>
                <li><strong>$5 Trial:</strong> 1 file (10MB), schema + basic stats + 1 AI insight</li>
                <li><strong>$10 Starter:</strong> 2 files (50MB), transformation + analysis + 3 AI insights</li>
                <li><strong>$20 Professional:</strong> 5 files (100MB), advanced insights + 5 AI insights</li>
                <li><strong>$50 Enterprise:</strong> Full access to all features</li>
            </ul>
            
            <p>If you didn't create this account, you can safely ignore this email.</p>
            
            <p>This verification link will expire in 24 hours.</p>
            
            <p>Best regards,<br>The ChimariData Team</p>
        </div>
        <div class="footer">
            <p>© 2025 ChimariData. All rights reserved.</p>
            <p>If the button doesn't work, copy and paste this link: ${verificationUrl}</p>
        </div>
    </div>
</body>
</html>`;
  }

  private static getVerificationEmailText(firstName: string, verificationUrl: string): string {
    return `
Hi ${firstName},

Welcome to ChimariData! 

To complete your account setup, please verify your email address by clicking the link below:

${verificationUrl}

Once verified, you'll have access to our tiered analytics platform:
- $5 Trial: 1 file (10MB), schema + basic stats + 1 AI insight
- $10 Starter: 2 files (50MB), transformation + analysis + 3 AI insights  
- $20 Professional: 5 files (100MB), advanced insights + 5 AI insights
- $50 Enterprise: Full access to all features

If you didn't create this account, you can safely ignore this email.

This verification link will expire in 24 hours.

Best regards,
The ChimariData Team

© 2025 ChimariData. All rights reserved.
`;
  }

  private static getPasswordResetEmailTemplate(firstName: string, resetUrl: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your ChimariData Password</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .button { display: inline-block; background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
        .button:hover { background: #5a6fd8; }
        .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset Request</h1>
            <p>ChimariData</p>
        </div>
        <div class="content">
            <h2>Hi ${firstName},</h2>
            <p>We received a request to reset your ChimariData account password. Click the button below to create a new password:</p>
            
            <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            
            <p>If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
            
            <p>This reset link will expire in 1 hour for security reasons.</p>
            
            <p>Best regards,<br>The ChimariData Team</p>
        </div>
        <div class="footer">
            <p>© 2025 ChimariData. All rights reserved.</p>
            <p>If the button doesn't work, copy and paste this link: ${resetUrl}</p>
        </div>
    </div>
</body>
</html>`;
  }

  private static getPasswordResetEmailText(firstName: string, resetUrl: string): string {
    return `
Hi ${firstName},

We received a request to reset your ChimariData account password. Click the link below to create a new password:

${resetUrl}

If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.

This reset link will expire in 1 hour for security reasons.

Best regards,
The ChimariData Team

© 2025 ChimariData. All rights reserved.
`;
  }
}