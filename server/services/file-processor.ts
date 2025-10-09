export class FileProcessor {
    static async processFile(buffer: Buffer, originalname: string, mimetype: string): Promise<any> {
        return {
            preview: [],
            schema: {},
            recordCount: 0,
            data: [],
        };
    }
}
