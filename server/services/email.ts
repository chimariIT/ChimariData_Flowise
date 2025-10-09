export class EmailService {
    async sendPasswordResetEmail(email: string, token: string, code: string) {}
    async sendVerificationEmail(email: string, token: string) {}
}
