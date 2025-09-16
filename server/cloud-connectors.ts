import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { BlobServiceClient } from '@azure/storage-blob';
import { Readable } from 'stream';

export interface CloudFile {
  name: string;
  path: string;
  size: number;
  lastModified: Date;
  contentType: string;
}

export interface CloudConnectorConfig {
  provider: 'aws' | 'azure' | 'gcp';
  credentials: {
    // AWS
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
    bucket?: string;
    // Azure
    connectionString?: string;
    containerName?: string;
    // GCP (existing implementation)
    serviceAccountKey?: string;
    bucketName?: string;
  };
}

export interface CloudDataSource {
  id: string;
  name: string;
  provider: 'aws' | 'azure' | 'gcp';
  config: CloudConnectorConfig;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: Date;
}

export class CloudConnectorService {
  
  async testConnection(config: CloudConnectorConfig): Promise<{
    success: boolean;
    message: string;
    fileCount?: number;
  }> {
    try {
      switch (config.provider) {
        case 'aws':
          return await this.testAWSConnection(config);
        case 'azure':
          return await this.testAzureConnection(config);
        case 'gcp':
          return await this.testGCPConnection(config);
        default:
          return { success: false, message: 'Unsupported provider' };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  private async testAWSConnection(config: CloudConnectorConfig): Promise<{
    success: boolean;
    message: string;
    fileCount?: number;
  }> {
    const { accessKeyId, secretAccessKey, region, bucket } = config.credentials;
    
    if (!accessKeyId || !secretAccessKey || !region || !bucket) {
      return { 
        success: false, 
        message: 'Missing AWS credentials: accessKeyId, secretAccessKey, region, and bucket are required' 
      };
    }

    try {
      const s3Client = new S3Client({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey
        }
      });

      const command = new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 10
      });

      const response = await s3Client.send(command);
      const fileCount = response.KeyCount || 0;

      return {
        success: true,
        message: `Successfully connected to AWS S3 bucket '${bucket}'`,
        fileCount
      };
    } catch (error) {
      return {
        success: false,
        message: `AWS S3 connection failed: ${error.message}`
      };
    }
  }

  private async testAzureConnection(config: CloudConnectorConfig): Promise<{
    success: boolean;
    message: string;
    fileCount?: number;
  }> {
    const { connectionString, containerName } = config.credentials;
    
    if (!connectionString || !containerName) {
      return { 
        success: false, 
        message: 'Missing Azure credentials: connectionString and containerName are required' 
      };
    }

    try {
      const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
      const containerClient = blobServiceClient.getContainerClient(containerName);

      // Test connection by listing first few blobs
      const iterator = containerClient.listBlobsFlat({
        includeMetadata: true,
        includeSnapshots: false
      });

      let fileCount = 0;
      for await (const blob of iterator) {
        fileCount++;
        if (fileCount >= 10) break; // Limit test to first 10 files
      }

      return {
        success: true,
        message: `Successfully connected to Azure container '${containerName}'`,
        fileCount
      };
    } catch (error) {
      return {
        success: false,
        message: `Azure Blob Storage connection failed: ${error.message}`
      };
    }
  }

  private async testGCPConnection(config: CloudConnectorConfig): Promise<{
    success: boolean;
    message: string;
    fileCount?: number;
  }> {
    // This would integrate with the existing Google Drive service
    // For now, return a placeholder implementation
    return {
      success: true,
      message: 'GCP connection test - integrate with existing Google Drive service',
      fileCount: 0
    };
  }

  async listFiles(config: CloudConnectorConfig, path?: string): Promise<CloudFile[]> {
    switch (config.provider) {
      case 'aws':
        return await this.listAWSFiles(config, path);
      case 'azure':
        return await this.listAzureFiles(config, path);
      case 'gcp':
        return await this.listGCPFiles(config, path);
      default:
        throw new Error('Unsupported provider');
    }
  }

  private async listAWSFiles(config: CloudConnectorConfig, path?: string): Promise<CloudFile[]> {
    const { accessKeyId, secretAccessKey, region, bucket } = config.credentials;
    
    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey }
    });

    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: path || '',
      MaxKeys: 100
    });

    const response = await s3Client.send(command);
    const files: CloudFile[] = [];

    if (response.Contents) {
      for (const object of response.Contents) {
        if (object.Key && object.Size !== undefined) {
          files.push({
            name: object.Key.split('/').pop() || object.Key,
            path: object.Key,
            size: object.Size,
            lastModified: object.LastModified || new Date(),
            contentType: this.inferContentType(object.Key)
          });
        }
      }
    }

    return files;
  }

  private async listAzureFiles(config: CloudConnectorConfig, path?: string): Promise<CloudFile[]> {
    const { connectionString, containerName } = config.credentials;
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);

    const files: CloudFile[] = [];
    const iterator = containerClient.listBlobsFlat({
      prefix: path || '',
      includeMetadata: true
    });

    for await (const blob of iterator) {
      files.push({
        name: blob.name.split('/').pop() || blob.name,
        path: blob.name,
        size: blob.properties.contentLength || 0,
        lastModified: blob.properties.lastModified || new Date(),
        contentType: blob.properties.contentType || this.inferContentType(blob.name)
      });

      if (files.length >= 100) break; // Limit results
    }

    return files;
  }

  private async listGCPFiles(config: CloudConnectorConfig, path?: string): Promise<CloudFile[]> {
    // Integrate with existing Google Drive service
    return [];
  }

  async downloadFile(config: CloudConnectorConfig, filePath: string): Promise<Buffer> {
    switch (config.provider) {
      case 'aws':
        return await this.downloadAWSFile(config, filePath);
      case 'azure':
        return await this.downloadAzureFile(config, filePath);
      case 'gcp':
        return await this.downloadGCPFile(config, filePath);
      default:
        throw new Error('Unsupported provider');
    }
  }

  private async downloadAWSFile(config: CloudConnectorConfig, filePath: string): Promise<Buffer> {
    const { accessKeyId, secretAccessKey, region, bucket } = config.credentials;
    
    const s3Client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey }
    });

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: filePath
    });

    const response = await s3Client.send(command);
    
    if (response.Body instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    
    throw new Error('Failed to download file from AWS S3');
  }

  private async downloadAzureFile(config: CloudConnectorConfig, filePath: string): Promise<Buffer> {
    const { connectionString, containerName } = config.credentials;
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(filePath);

    const downloadResponse = await blobClient.download();
    
    if (downloadResponse.readableStreamBody) {
      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    
    throw new Error('Failed to download file from Azure Blob Storage');
  }

  private async downloadGCPFile(config: CloudConnectorConfig, filePath: string): Promise<Buffer> {
    // Integrate with existing Google Drive service
    throw new Error('GCP download not implemented');
  }

  private inferContentType(filename: string): string {
    const extension = filename.split('.').pop()?.toLowerCase();
    const contentTypes: { [key: string]: string } = {
      'csv': 'text/csv',
      'json': 'application/json',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xls': 'application/vnd.ms-excel',
      'txt': 'text/plain',
      'pdf': 'application/pdf'
    };
    
    return contentTypes[extension || ''] || 'application/octet-stream';
  }

  async validateCredentials(config: CloudConnectorConfig): Promise<{
    valid: boolean;
    message: string;
    missingFields?: string[];
  }> {
    const missingFields: string[] = [];
    
    switch (config.provider) {
      case 'aws':
        if (!config.credentials.accessKeyId) missingFields.push('accessKeyId');
        if (!config.credentials.secretAccessKey) missingFields.push('secretAccessKey');
        if (!config.credentials.region) missingFields.push('region');
        if (!config.credentials.bucket) missingFields.push('bucket');
        break;
      
      case 'azure':
        if (!config.credentials.connectionString) missingFields.push('connectionString');
        if (!config.credentials.containerName) missingFields.push('containerName');
        break;
      
      case 'gcp':
        if (!config.credentials.serviceAccountKey) missingFields.push('serviceAccountKey');
        if (!config.credentials.bucketName) missingFields.push('bucketName');
        break;
    }

    if (missingFields.length > 0) {
      return {
        valid: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields
      };
    }

    return { valid: true, message: 'All required credentials provided' };
  }
}

export const cloudConnectorService = new CloudConnectorService();