/**
 * Google Drive Service
 *
 * Sprint 4: Real Google Drive integration for cloud storage
 * Wraps the googleapis library for OAuth-based file access
 */

import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  webViewLink?: string;
}

export class GoogleDriveService {
  private oauth2Client: OAuth2Client;
  private drive: any;
  private isInitialized: boolean = false;

  constructor() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:5000'}/api/auth/google/callback`;

    this.oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  /**
   * Initialize the service with OAuth tokens
   */
  async initializeWithToken(accessToken: string, refreshToken?: string): Promise<void> {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken || undefined,
    });

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client as any });
    this.isInitialized = true;
    console.log('✅ [GoogleDrive] Service initialized with OAuth token');
  }

  /**
   * Check if the service is properly initialized
   */
  isReady(): boolean {
    return this.isInitialized && !!this.drive;
  }

  /**
   * List files from Google Drive
   * By default, filters for data files (CSV, Excel, JSON)
   */
  async listFiles(query?: string): Promise<GoogleDriveFile[]> {
    if (!this.isReady()) {
      throw new Error('Google Drive service not initialized. Call initializeWithToken first.');
    }

    try {
      const defaultQuery = "mimeType='text/csv' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/json' or mimeType='application/vnd.ms-excel'";

      const response = await this.drive.files.list({
        q: query || defaultQuery,
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
        pageSize: 100,
        orderBy: 'modifiedTime desc',
      });

      const files = response.data.files || [];
      console.log(`📁 [GoogleDrive] Listed ${files.length} files`);

      return files.map((file: any) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: parseInt(file.size || '0', 10),
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
      }));
    } catch (error: any) {
      console.error('❌ [GoogleDrive] Error listing files:', error.message);
      throw new Error(`Failed to list Google Drive files: ${error.message}`);
    }
  }

  /**
   * Download a file from Google Drive
   */
  async downloadFile(fileId: string): Promise<Buffer> {
    if (!this.isReady()) {
      throw new Error('Google Drive service not initialized. Call initializeWithToken first.');
    }

    try {
      // First get the file metadata to check type
      const metadata = await this.getFileMetadata(fileId);

      // Handle Google Docs/Sheets export
      if (metadata.mimeType.startsWith('application/vnd.google-apps.')) {
        return await this.exportGoogleDoc(fileId, metadata.mimeType);
      }

      // Regular file download
      const response = await this.drive.files.get({
        fileId,
        alt: 'media',
      }, { responseType: 'arraybuffer' });

      console.log(`⬇️ [GoogleDrive] Downloaded file ${fileId}`);
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('❌ [GoogleDrive] Error downloading file:', error.message);
      throw new Error(`Failed to download file from Google Drive: ${error.message}`);
    }
  }

  /**
   * Export Google Docs/Sheets to a downloadable format
   */
  private async exportGoogleDoc(fileId: string, mimeType: string): Promise<Buffer> {
    const exportMimeTypes: Record<string, string> = {
      'application/vnd.google-apps.spreadsheet': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.google-apps.document': 'application/pdf',
      'application/vnd.google-apps.presentation': 'application/pdf',
    };

    const exportMimeType = exportMimeTypes[mimeType] || 'application/pdf';

    const response = await this.drive.files.export({
      fileId,
      mimeType: exportMimeType,
    }, { responseType: 'arraybuffer' });

    console.log(`📤 [GoogleDrive] Exported Google Doc ${fileId} as ${exportMimeType}`);
    return Buffer.from(response.data);
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string): Promise<GoogleDriveFile> {
    if (!this.isReady()) {
      throw new Error('Google Drive service not initialized. Call initializeWithToken first.');
    }

    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, modifiedTime, webViewLink',
      });

      return {
        id: response.data.id,
        name: response.data.name,
        mimeType: response.data.mimeType,
        size: parseInt(response.data.size || '0', 10),
        modifiedTime: response.data.modifiedTime,
        webViewLink: response.data.webViewLink,
      };
    } catch (error: any) {
      console.error('❌ [GoogleDrive] Error getting file metadata:', error.message);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Search for files by name
   */
  async searchFiles(searchTerm: string): Promise<GoogleDriveFile[]> {
    const query = `name contains '${searchTerm.replace(/'/g, "\\'")}'`;
    return this.listFiles(query);
  }

  /**
   * Get the OAuth authorization URL
   */
  static getAuthUrl(): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:5000'}/api/auth/google/drive/callback`;

    if (!clientId || !clientSecret) {
      console.error('❌ [GoogleDrive] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
      throw new Error('Google Drive OAuth not configured');
    }

    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent', // Force consent to get refresh token
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  static async getTokenFromCode(code: string): Promise<{ access_token: string; refresh_token?: string }> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:5000'}/api/auth/google/drive/callback`;

    if (!clientId || !clientSecret) {
      throw new Error('Google Drive OAuth not configured');
    }

    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    const { tokens } = await oauth2Client.getToken(code);
    console.log('✅ [GoogleDrive] OAuth token exchange successful');

    return {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token || undefined,
    };
  }

  /**
   * Test connection with current credentials
   */
  async testConnection(): Promise<{ success: boolean; message: string; fileCount?: number }> {
    try {
      if (!this.isReady()) {
        return { success: false, message: 'Service not initialized' };
      }

      const files = await this.listFiles();
      return {
        success: true,
        message: `Successfully connected to Google Drive`,
        fileCount: files.length,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
      };
    }
  }
}

// Export singleton instance
export const googleDriveService = new GoogleDriveService();
