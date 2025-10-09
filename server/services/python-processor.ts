// Enhanced PythonProcessor service with basic statistical analysis
export const PythonProcessor = {
  processTrial(trialId: string, data: any): any {
    console.log(`Processing trial ${trialId} with enhanced analysis...`);

    try {
      const { preview, schema, recordCount } = data;

      if (!preview || !Array.isArray(preview) || preview.length === 0) {
        return {
          success: false,
          error: "No data provided for analysis"
        };
      }

      // Perform basic statistical analysis
      const analysisResults = this.performBasicAnalysis(preview, schema);

      // Generate basic visualizations metadata
      const visualizations = this.generateVisualizationMetadata(preview, schema);

      return {
        success: true,
        data: {
          summary: `Analyzed ${recordCount} records with ${Object.keys(schema || {}).length} columns`,
          statisticalSummary: analysisResults.summary,
          columnAnalysis: analysisResults.columns,
          dataQuality: analysisResults.quality,
          recommendations: analysisResults.recommendations
        },
        visualizations
      };
    } catch (error) {
      console.error('Python processor error:', error);
      return {
        success: false,
        error: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  },

  performBasicAnalysis(data: any[], schema: any) {
    const columns = Object.keys(schema || {});
    const numericColumns = columns.filter(col =>
      schema[col]?.type === 'number' || schema[col]?.type === 'integer'
    );
    const stringColumns = columns.filter(col =>
      schema[col]?.type === 'string' || schema[col]?.type === 'text'
    );

    const columnAnalysis: any = {};
    const quality: any = { missingValues: 0, duplicates: 0, totalRows: data.length };

    // Analyze each column
    columns.forEach(col => {
      const values = data.map(row => row[col]).filter(v => v !== null && v !== undefined && v !== '');
      const nonNullCount = values.length;
      const missingCount = data.length - nonNullCount;

      quality.missingValues += missingCount;

      if (numericColumns.includes(col)) {
        const numericValues = values.map(Number).filter(n => !isNaN(n));
        if (numericValues.length > 0) {
          const sorted = numericValues.sort((a, b) => a - b);
          const sum = numericValues.reduce((a, b) => a + b, 0);
          const mean = sum / numericValues.length;

          columnAnalysis[col] = {
            type: 'numeric',
            count: numericValues.length,
            missing: missingCount,
            min: sorted[0],
            max: sorted[sorted.length - 1],
            mean: Math.round(mean * 100) / 100,
            median: sorted[Math.floor(sorted.length / 2)]
          };
        }
      } else {
        const uniqueValues = [...new Set(values)];
        columnAnalysis[col] = {
          type: 'categorical',
          count: values.length,
          missing: missingCount,
          unique: uniqueValues.length,
          topValues: this.getTopValues(values)
        };
      }
    });

    return {
      summary: {
        totalRows: data.length,
        totalColumns: columns.length,
        numericColumns: numericColumns.length,
        categoricalColumns: stringColumns.length,
        completeness: Math.round((1 - quality.missingValues / (data.length * columns.length)) * 100)
      },
      columns: columnAnalysis,
      quality,
      recommendations: this.generateRecommendations(columnAnalysis, quality)
    };
  },

  getTopValues(values: any[]): Array<{value: any, count: number}> {
    const counts = values.reduce((acc: Record<string, number>, val: any) => {
      const key = String(val);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts)
      .sort((a: [string, number], b: [string, number]) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value, count }));
  },

  generateRecommendations(columnAnalysis: any, quality: any): string[] {
    const recommendations = [];

    if (quality.missingValues > 0) {
      recommendations.push(`Handle ${quality.missingValues} missing values across your dataset`);
    }

    const numericCols = Object.keys(columnAnalysis).filter(col =>
      columnAnalysis[col].type === 'numeric'
    );

    if (numericCols.length > 1) {
      recommendations.push("Consider correlation analysis between numeric variables");
    }

    if (quality.completeness < 90) {
      recommendations.push("Data quality could be improved - consider data cleaning");
    }

    recommendations.push("Explore data distributions and outliers for deeper insights");

    return recommendations;
  },

  generateVisualizationMetadata(data: any[], schema: any) {
    const columns = Object.keys(schema || {});
    const numericColumns = columns.filter(col =>
      schema[col]?.type === 'number' || schema[col]?.type === 'integer'
    );

    const visualizations = [];

    // Suggest histogram for first numeric column
    if (numericColumns.length > 0) {
      visualizations.push({
        type: 'histogram',
        title: `Distribution of ${numericColumns[0]}`,
        column: numericColumns[0],
        description: `Shows the frequency distribution of values in ${numericColumns[0]}`
      });
    }

    // Suggest scatter plot if multiple numeric columns
    if (numericColumns.length > 1) {
      visualizations.push({
        type: 'scatter',
        title: `${numericColumns[0]} vs ${numericColumns[1]}`,
        xColumn: numericColumns[0],
        yColumn: numericColumns[1],
        description: `Relationship between ${numericColumns[0]} and ${numericColumns[1]}`
      });
    }

    // Suggest bar chart for categorical columns
    const categoricalCols = columns.filter(col =>
      schema[col]?.type === 'string' &&
      new Set(data.map(row => row[col])).size < 20 // Not too many unique values
    );

    if (categoricalCols.length > 0) {
      visualizations.push({
        type: 'bar',
        title: `Count by ${categoricalCols[0]}`,
        column: categoricalCols[0],
        description: `Frequency of different values in ${categoricalCols[0]}`
      });
    }

    return visualizations;
  }
};
