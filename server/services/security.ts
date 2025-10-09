import crypto from 'crypto';

export class SecurityUtils {
    static getCSPHeaders() {
        return {
            'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; connect-src 'self' https://api.stripe.com https://js.stripe.com ws://localhost:3000 ws://localhost:5173; font-src 'self' https://fonts.gstatic.com; frame-src 'self' https://js.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self';"
        };
    }

    static validateFileUpload(file: Express.Multer.File) {
        const allowedTypes = [
            'application/json',
            'text/csv',
            'application/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'application/octet-stream'
        ];
        const allowedExtensions = ['.json', '.csv', '.xlsx', '.xls', '.txt'];
        const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));

        if (allowedTypes.includes(file.mimetype) || hasValidExtension) {
            return {
                valid: true,
                sanitizedName: this.sanitizeFilename(file.originalname)
            };
        }
        return {
            valid: false,
            error: 'Unsupported file type.'
        };
    }

    static sanitizeFilename(filename: string): string {
        return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    }

    static generateRandomToken(length: number = 48): string {
        return crypto.randomBytes(length).toString('hex');
    }
}
