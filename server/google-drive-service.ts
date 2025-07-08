import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  webViewLink: string;
}

export class GoogleDriveService {
  private oauth2Client: OAuth2Client;
  private drive: any;

  constructor() {
    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
  }

  async initializeWithToken(accessToken: string, refreshToken?: string): Promise<void> {
    this.oauth2Client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    this.drive = google.drive({ version: 'v3', auth: this.oauth2Client });
  }

  async listFiles(query?: string): Promise<GoogleDriveFile[]> {
    try {
      const response = await this.drive.files.list({
        q: query || "mimeType='text/csv' or mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or mimeType='application/json'",
        fields: 'files(id, name, mimeType, size, modifiedTime, webViewLink)',
        pageSize: 50,
      });

      return response.data.files || [];
    } catch (error) {
      console.error('Error listing Google Drive files:', error);
      throw new Error('Failed to list Google Drive files');
    }
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    try {
      const response = await this.drive.files.get({
        fileId,
        alt: 'media',
      });

      return Buffer.from(response.data);
    } catch (error) {
      console.error('Error downloading file from Google Drive:', error);
      throw new Error('Failed to download file from Google Drive');
    }
  }

  async getFileMetadata(fileId: string): Promise<GoogleDriveFile> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, modifiedTime, webViewLink',
      });

      return response.data;
    } catch (error) {
      console.error('Error getting file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }

  static getAuthUrl(): string {
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
  }

  static async getTokenFromCode(code: string): Promise<{ access_token: string; refresh_token?: string }> {
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    return {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token,
    };
  }
}