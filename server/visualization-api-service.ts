import { spawn } from 'child_process';
import path from 'path';

export class VisualizationAPIService {
  
  static async createVisualization(data: any[], config: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(process.cwd(), 'server', 'visualization-service.py');
      
      // Prepare data and config as JSON strings
      const dataJson = JSON.stringify(data);
      const configJson = JSON.stringify(config);
      
      console.log('Creating visualization with Python service...');
      console.log('Config:', config);
      console.log('Data rows:', data.length);
      
      // Spawn Python process
      const pythonProcess = spawn('python3', [pythonScript, dataJson, configJson]);
      
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('Python stderr:', data.toString());
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            console.log('Visualization created successfully');
            resolve(result);
          } catch (parseError) {
            console.error('Failed to parse Python output:', output);
            reject(new Error(`Failed to parse visualization result: ${parseError}`));
          }
        } else {
          console.error(`Python process exited with code ${code}`);
          console.error('Error output:', errorOutput);
          reject(new Error(`Visualization failed: ${errorOutput}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.error('Failed to spawn Python process:', error);
        reject(new Error(`Failed to start visualization service: ${error.message}`));
      });
    });
  }
}

export class PandasTransformationAPIService {
  
  static async applyTransformations(data: any[], transformations: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const pythonScript = path.join(process.cwd(), 'server', 'pandas-transformation-service.py');
      
      // Prepare data and transformations as JSON strings
      const dataJson = JSON.stringify(data);
      const transformationsJson = JSON.stringify(transformations);
      
      console.log('Applying transformations with pandas...');
      console.log('Transformations:', transformations);
      console.log('Data rows:', data.length);
      
      // Spawn Python process
      const pythonProcess = spawn('python3', [pythonScript, dataJson, transformationsJson]);
      
      let output = '';
      let errorOutput = '';
      
      pythonProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      pythonProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
        console.error('Python stderr:', data.toString());
      });
      
      pythonProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(output);
            console.log('Transformation completed successfully');
            resolve(result);
          } catch (parseError) {
            console.error('Failed to parse Python output:', output);
            reject(new Error(`Failed to parse transformation result: ${parseError}`));
          }
        } else {
          console.error(`Python process exited with code ${code}`);
          console.error('Error output:', errorOutput);
          reject(new Error(`Transformation failed: ${errorOutput}`));
        }
      });
      
      pythonProcess.on('error', (error) => {
        console.error('Failed to spawn Python process:', error);
        reject(new Error(`Failed to start transformation service: ${error.message}`));
      });
    });
  }
}