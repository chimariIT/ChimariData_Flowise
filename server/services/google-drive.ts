export class GoogleDriveService {
    static getAuthUrl() {
        return "https://accounts.google.com/o/oauth2/v2/auth";
    }
    static async getTokenFromCode(code: string) {
        return {
            access_token: "mock_access_token",
            refresh_token: "mock_refresh_token",
        };
    }
    async initializeWithToken(accessToken: string, refreshToken: string) {}
    async listFiles(query: string) {
        return [];
    }
    async downloadFile(fileId: string): Promise<Buffer> {
        return Buffer.from("mock file content");
    }
    async getFileMetadata(fileId: string) {
        return {
            name: "mock.csv",
            mimeType: "text/csv",
        };
    }
}
