import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Filter, RefreshCw } from 'lucide-react';

interface DashboardFilter {
  type: 'date_range' | 'category' | 'numeric_range' | 'search';
  label: string;
  column: string;
  options?: { label: string; value: any }[];
}

interface ResultsDashboardProps {
  projectId: string;
  data: any[];
  visualizations: any[];
  filters: DashboardFilter[];
  onExport: (format: 'pdf' | 'csv' | 'pptx' | 'json') => void;
}

export default function ResultsDashboard({
  projectId,
  data,
  visualizations,
  filters,
  onExport
}: ResultsDashboardProps) {
  const [filteredData, setFilteredData] = useState(data);
  const [activeFilters, setActiveFilters] = useState<Record<string, any>>({});

  useEffect(() => {
    applyFilters();
  }, [activeFilters, data]);

  const applyFilters = () => {
    let filtered = [...data];

    Object.entries(activeFilters).forEach(([column, value]) => {
      if (!value) return;

      filtered = filtered.filter(row => {
        if (typeof value === 'string') {
          return String(row[column]).toLowerCase().includes(value.toLowerCase());
        }
        return row[column] === value;
      });
    });

    setFilteredData(filtered);
  };

  const handleFilterChange = (column: string, value: any) => {
    setActiveFilters(prev => ({
      ...prev,
      [column]: value
    }));
  };

  const clearFilters = () => {
    setActiveFilters({});
  };

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filters
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearFilters}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Clear All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filters.map(filter => (
              <div key={filter.column}>
                <label className="text-sm font-medium text-gray-700 mb-1 block">
                  {filter.label}
                </label>

                {filter.type === 'category' && filter.options && (
                  <Select
                    value={activeFilters[filter.column] || ''}
                    onValueChange={(value) => handleFilterChange(filter.column, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${filter.label}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {filter.options.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {filter.type === 'search' && (
                  <Input
                    type="text"
                    placeholder={`Search...`}
                    value={activeFilters[filter.column] || ''}
                    onChange={(e) => handleFilterChange(filter.column, e.target.value)}
                  />
                )}

                {filter.type === 'numeric_range' && (
                  <Input
                    type="number"
                    placeholder={`Filter ${filter.label}`}
                    value={activeFilters[filter.column] || ''}
                    onChange={(e) => handleFilterChange(filter.column, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Showing {filteredData.length} of {data.length} results
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Results
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onExport('pdf')}>
              📄 Download PDF Report
            </Button>
            <Button variant="outline" onClick={() => onExport('pptx')}>
              📊 Download Presentation
            </Button>
            <Button variant="outline" onClick={() => onExport('csv')}>
              💾 Download CSV Data
            </Button>
            <Button variant="outline" onClick={() => onExport('json')}>
              🔧 Download JSON
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {visualizations.map((viz, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle>{viz.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <img
                src={viz.imageUrl}
                alt={viz.title}
                className="w-full h-auto rounded-lg"
              />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detailed Data</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(filteredData[0] || {}).map(column => (
                    <th
                      key={column}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredData.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((value: any, j) => (
                      <td key={j} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredData.length > 100 && (
            <div className="mt-4 text-sm text-gray-600 text-center">
              Showing first 100 rows. Download CSV for complete data.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
