import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

export interface TimeSeriesConfig {
  dateColumn: string;
  valueColumns: string[];
  frequency?: 'D' | 'W' | 'M' | 'Q' | 'Y'; // Daily, Weekly, Monthly, Quarterly, Yearly
  seasonality?: 'auto' | 'additive' | 'multiplicative';
  forecastPeriods?: number;
  includeHolidays?: boolean;
  confidenceInterval?: number;
}

export interface TimeSeriesResult {
  forecast: Array<{
    date: string;
    value: number;
    upper_bound: number;
    lower_bound: number;
  }>;
  components: {
    trend: Array<{ date: string; value: number }>;
    seasonal: Array<{ date: string; value: number }>;
    holidays?: Array<{ date: string; value: number }>;
  };
  metrics: {
    mae: number; // Mean Absolute Error
    mape: number; // Mean Absolute Percentage Error
    rmse: number; // Root Mean Square Error
  };
  insights: string[];
}

export class TimeSeriesAnalyzer {
  private pythonPath: string;

  constructor() {
    this.pythonPath = process.env.PYTHON_PATH || 'python3';
  }

  async analyzeTimeSeries(
    projectId: string,
    data: any[],
    config: TimeSeriesConfig
  ): Promise<TimeSeriesResult> {
    const tempDir = path.join(process.cwd(), 'temp');
    await fs.mkdir(tempDir, { recursive: true });

    const inputFile = path.join(tempDir, `${projectId}_timeseries_input.json`);
    const outputFile = path.join(tempDir, `${projectId}_timeseries_output.json`);

    try {
      // Prepare input data
      const input = {
        data,
        config,
        output_file: outputFile
      };

      await fs.writeFile(inputFile, JSON.stringify(input, null, 2));

      // Execute Python time series analysis
      const pythonScript = `
import json
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

try:
    # Try to import Prophet
    from prophet import Prophet
    PROPHET_AVAILABLE = True
except ImportError:
    PROPHET_AVAILABLE = False
    print("Prophet not available, using basic forecasting")

def analyze_time_series(input_file, output_file):
    with open(input_file, 'r') as f:
        input_data = json.load(f)
    
    data = pd.DataFrame(input_data['data'])
    config = input_data['config']
    
    # Convert date column to datetime
    data[config['dateColumn']] = pd.to_datetime(data[config['dateColumn']])
    data = data.sort_values(config['dateColumn'])
    
    results = {
        'forecast': [],
        'components': {'trend': [], 'seasonal': []},
        'metrics': {'mae': 0, 'mape': 0, 'rmse': 0},
        'insights': []
    }
    
    for value_col in config['valueColumns']:
        if value_col not in data.columns:
            continue
            
        # Prepare data for analysis
        ts_data = data[[config['dateColumn'], value_col]].dropna()
        ts_data.columns = ['ds', 'y']
        
        if PROPHET_AVAILABLE and len(ts_data) >= 10:
            # Use Prophet for advanced forecasting
            model = Prophet(
                yearly_seasonality=True,
                weekly_seasonality=True,
                daily_seasonality=False,
                interval_width=config.get('confidenceInterval', 0.8)
            )
            
            model.fit(ts_data)
            
            # Create future dataframe
            future_periods = config.get('forecastPeriods', 30)
            future = model.make_future_dataframe(periods=future_periods)
            forecast = model.predict(future)
            
            # Extract forecast data
            forecast_data = forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']].tail(future_periods)
            for _, row in forecast_data.iterrows():
                results['forecast'].append({
                    'date': row['ds'].isoformat(),
                    'value': float(row['yhat']),
                    'lower_bound': float(row['yhat_lower']),
                    'upper_bound': float(row['yhat_upper']),
                    'variable': value_col
                })
            
            # Extract components
            components = model.predict(future)
            for _, row in components.iterrows():
                results['components']['trend'].append({
                    'date': row['ds'].isoformat(),
                    'value': float(row['trend']),
                    'variable': value_col
                })
                if 'yearly' in components.columns:
                    results['components']['seasonal'].append({
                        'date': row['ds'].isoformat(),
                        'value': float(row['yearly']),
                        'variable': value_col
                    })
            
            # Calculate metrics on historical data
            historical_forecast = forecast[forecast['ds'].isin(ts_data['ds'])]
            if len(historical_forecast) > 0:
                actual = ts_data['y'].values
                predicted = historical_forecast['yhat'].values[:len(actual)]
                
                mae = np.mean(np.abs(actual - predicted))
                mape = np.mean(np.abs((actual - predicted) / actual)) * 100
                rmse = np.sqrt(np.mean((actual - predicted) ** 2))
                
                results['metrics'] = {
                    'mae': float(mae),
                    'mape': float(mape),
                    'rmse': float(rmse)
                }
            
            # Generate insights
            results['insights'].extend([
                f"Forecasted {future_periods} periods ahead for {value_col}",
                f"Model confidence interval: {config.get('confidenceInterval', 0.8)*100}%",
                f"Historical accuracy - MAE: {results['metrics']['mae']:.2f}, MAPE: {results['metrics']['mape']:.2f}%"
            ])
            
        else:
            # Basic forecasting using linear trend
            if len(ts_data) >= 2:
                # Simple linear extrapolation
                x = np.arange(len(ts_data))
                y = ts_data['y'].values
                
                # Fit linear trend
                coeffs = np.polyfit(x, y, 1)
                trend = np.polyval(coeffs, x)
                
                # Forecast future values
                future_periods = config.get('forecastPeriods', 30)
                future_x = np.arange(len(ts_data), len(ts_data) + future_periods)
                future_y = np.polyval(coeffs, future_x)
                
                # Calculate residuals for confidence intervals
                residuals = y - trend
                std_residual = np.std(residuals)
                
                # Generate future dates
                last_date = ts_data['ds'].iloc[-1]
                freq_map = {'D': 'days', 'W': 'weeks', 'M': 'months'}
                freq = config.get('frequency', 'D')
                
                for i, (x_val, y_val) in enumerate(zip(future_x, future_y)):
                    if freq == 'D':
                        future_date = last_date + timedelta(days=i+1)
                    elif freq == 'W':
                        future_date = last_date + timedelta(weeks=i+1)
                    else:
                        future_date = last_date + timedelta(days=(i+1)*30)  # Approximate monthly
                    
                    results['forecast'].append({
                        'date': future_date.isoformat(),
                        'value': float(y_val),
                        'lower_bound': float(y_val - 1.96 * std_residual),
                        'upper_bound': float(y_val + 1.96 * std_residual),
                        'variable': value_col
                    })
                
                # Basic metrics
                mae = np.mean(np.abs(residuals))
                results['metrics'] = {
                    'mae': float(mae),
                    'mape': float(np.mean(np.abs(residuals / y)) * 100),
                    'rmse': float(np.sqrt(np.mean(residuals ** 2)))
                }
                
                results['insights'].extend([
                    f"Used linear trend forecasting for {value_col}",
                    f"Install Prophet for advanced time series analysis",
                    f"Basic trend shows {'increasing' if coeffs[0] > 0 else 'decreasing'} pattern"
                ])
    
    # Save results
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python script.py input_file output_file")
        sys.exit(1)
    
    analyze_time_series(sys.argv[1], sys.argv[2])
`;

      // Write and execute Python script
      const scriptFile = path.join(tempDir, `${projectId}_timeseries.py`);
      await fs.writeFile(scriptFile, pythonScript);

      await this.executePythonScript(scriptFile, [inputFile, outputFile]);

      // Read results
      const resultData = await fs.readFile(outputFile, 'utf-8');
      const result = JSON.parse(resultData);

      // Cleanup
      await Promise.all([
        fs.unlink(inputFile).catch(() => {}),
        fs.unlink(outputFile).catch(() => {}),
        fs.unlink(scriptFile).catch(() => {})
      ]);

      return result;

    } catch (error) {
      console.error('Time series analysis error:', error);
      throw new Error(`Time series analysis failed: ${error.message}`);
    }
  }

  private executePythonScript(scriptPath: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const process = spawn(this.pythonPath, [scriptPath, ...args]);
      
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Python script failed: ${stderr || stdout}`));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  async detectTimeSeriesColumns(data: any[]): Promise<{
    dateColumns: string[];
    numericColumns: string[];
    suggestions: string[];
  }> {
    if (!data || data.length === 0) {
      return { dateColumns: [], numericColumns: [], suggestions: [] };
    }

    const sample = data[0];
    const dateColumns: string[] = [];
    const numericColumns: string[] = [];
    const suggestions: string[] = [];

    Object.keys(sample).forEach(column => {
      const values = data.slice(0, 10).map(row => row[column]).filter(v => v != null);
      
      if (values.length === 0) return;

      // Check for date columns
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
        /^\d{2}\/\d{2}\/\d{4}/, // MM/DD/YYYY
        /^\d{2}-\d{2}-\d{4}/, // MM-DD-YYYY
        /^\d{4}\/\d{2}\/\d{2}/ // YYYY/MM/DD
      ];

      const hasDatePattern = values.some(value => 
        datePatterns.some(pattern => pattern.test(String(value)))
      );

      if (hasDatePattern || 
          column.toLowerCase().includes('date') || 
          column.toLowerCase().includes('time') ||
          column.toLowerCase().includes('timestamp')) {
        dateColumns.push(column);
      }

      // Check for numeric columns
      const numericValues = values.filter(value => !isNaN(Number(value)));
      if (numericValues.length > values.length * 0.8) {
        numericColumns.push(column);
      }
    });

    // Generate suggestions
    if (dateColumns.length > 0 && numericColumns.length > 0) {
      suggestions.push(`Detected ${dateColumns.length} potential date column(s) and ${numericColumns.length} numeric column(s)`);
      suggestions.push(`Recommended: Use '${dateColumns[0]}' as date column`);
      suggestions.push(`Consider analyzing: ${numericColumns.slice(0, 3).join(', ')}`);
    } else if (dateColumns.length === 0) {
      suggestions.push("No clear date columns detected. Please ensure your data includes a date/time column.");
    } else if (numericColumns.length === 0) {
      suggestions.push("No numeric columns detected for time series analysis.");
    }

    return { dateColumns, numericColumns, suggestions };
  }
}