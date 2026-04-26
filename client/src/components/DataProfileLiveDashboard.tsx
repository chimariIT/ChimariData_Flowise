import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Filter, Database } from "lucide-react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type AggregationMode = "avg" | "sum" | "min" | "max" | "count";

interface DataProfileLiveDashboardProps {
  analysisResults: any;
  journeyProgress: any;
  datasets?: any[];
  isPreview?: boolean;
}

interface AggregateBucket {
  key: string;
  label: string;
  value: number;
  count: number;
}

function asRows(input: any): Record<string, any>[] {
  if (!Array.isArray(input)) return [];
  return input.filter((row) => row && typeof row === "object");
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const stripped = value.replace(/,/g, "").trim();
    const parsed = Number(stripped);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.abs(value) >= 1000 ? value.toLocaleString() : value.toFixed(2).replace(/\.00$/, "");
}

export default function DataProfileLiveDashboard({
  analysisResults,
  journeyProgress,
  datasets = [],
  isPreview = false
}: DataProfileLiveDashboardProps) {
  const baseRows = useMemo(() => {
    const candidates: any[] = [
      journeyProgress?.joinedData?.transformedData,
      journeyProgress?.joinedData?.preview,
      analysisResults?.dataProfile?.rows,
      analysisResults?.datasetPreview,
      analysisResults?.summary?.dataPreview,
    ];

    for (const dataset of datasets) {
      candidates.push(
        dataset?.ingestionMetadata?.transformedData,
        dataset?.ingestion_metadata?.transformedData,
        dataset?.metadata?.transformedData,
        dataset?.data_metadata?.transformedData,
        dataset?.preview,
        dataset?.data
      );
    }

    for (const candidate of candidates) {
      const rows = asRows(candidate);
      if (rows.length > 0) {
        return rows.slice(0, isPreview ? 250 : 2000);
      }
    }
    return [] as Record<string, any>[];
  }, [analysisResults, datasets, journeyProgress, isPreview]);

  const allColumns = useMemo(() => {
    if (baseRows.length === 0) return [] as string[];
    const columnSet = new Set<string>();
    baseRows.slice(0, 100).forEach((row) => {
      Object.keys(row).forEach((key) => columnSet.add(key));
    });
    return Array.from(columnSet);
  }, [baseRows]);

  const { metricColumns, dimensionColumns } = useMemo(() => {
    const numeric: string[] = [];
    const dimensions: string[] = [];

    allColumns.forEach((column) => {
      const sample = baseRows.slice(0, 300).map((row) => row[column]);
      const nonNull = sample.filter((value) => value !== null && value !== undefined && value !== "");
      if (nonNull.length === 0) return;

      const numericCount = nonNull.reduce((count, value) => count + (toNumber(value) !== null ? 1 : 0), 0);
      const numericRatio = numericCount / nonNull.length;

      if (numericRatio >= 0.8) {
        numeric.push(column);
      } else {
        dimensions.push(column);
      }
    });

    if (dimensions.length === 0) {
      const fallback = allColumns.filter((column) => !numeric.includes(column));
      dimensions.push(...fallback);
    }

    return { metricColumns: numeric, dimensionColumns: dimensions };
  }, [allColumns, baseRows]);

  const [metricColumn, setMetricColumn] = useState<string>("");
  const [groupByColumn, setGroupByColumn] = useState<string>("");
  const [aggregation, setAggregation] = useState<AggregationMode>("avg");
  const [filterColumn, setFilterColumn] = useState<string>("__none__");
  const [filterValue, setFilterValue] = useState<string>("__all__");
  const [secondaryFilterColumn, setSecondaryFilterColumn] = useState<string>("__none__");
  const [secondaryFilterValue, setSecondaryFilterValue] = useState<string>("__all__");

  useEffect(() => {
    if (!metricColumn && metricColumns.length > 0) {
      setMetricColumn(metricColumns[0]);
    }
  }, [metricColumn, metricColumns]);

  useEffect(() => {
    if (!groupByColumn && dimensionColumns.length > 0) {
      setGroupByColumn(dimensionColumns[0]);
    }
  }, [dimensionColumns, groupByColumn]);

  useEffect(() => {
    if (filterColumn === "__none__") {
      setFilterValue("__all__");
    }
    if (filterColumn !== "__none__" && secondaryFilterColumn === filterColumn) {
      setSecondaryFilterColumn("__none__");
      setSecondaryFilterValue("__all__");
    }
  }, [filterColumn, secondaryFilterColumn]);

  useEffect(() => {
    if (secondaryFilterColumn === "__none__") {
      setSecondaryFilterValue("__all__");
    }
  }, [secondaryFilterColumn]);

  const filterValues = useMemo(() => {
    if (filterColumn === "__none__" || !filterColumn) return [] as string[];
    const values = new Set<string>();
    baseRows.forEach((row) => {
      const raw = row[filterColumn];
      const label = raw === null || raw === undefined || raw === "" ? "Unknown" : String(raw);
      values.add(label);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b)).slice(0, 200);
  }, [baseRows, filterColumn]);

  const secondaryFilterValues = useMemo(() => {
    if (secondaryFilterColumn === "__none__" || !secondaryFilterColumn) return [] as string[];
    const values = new Set<string>();
    baseRows.forEach((row) => {
      const raw = row[secondaryFilterColumn];
      const label = raw === null || raw === undefined || raw === "" ? "Unknown" : String(raw);
      values.add(label);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b)).slice(0, 200);
  }, [baseRows, secondaryFilterColumn]);

  const filteredRows = useMemo(() => {
    return baseRows.filter((row) => {
      if (filterColumn !== "__none__" && filterValue !== "__all__") {
        const primaryRaw = row[filterColumn];
        const primaryLabel = primaryRaw === null || primaryRaw === undefined || primaryRaw === "" ? "Unknown" : String(primaryRaw);
        if (primaryLabel !== filterValue) {
          return false;
        }
      }

      if (secondaryFilterColumn !== "__none__" && secondaryFilterValue !== "__all__") {
        const secondaryRaw = row[secondaryFilterColumn];
        const secondaryLabel = secondaryRaw === null || secondaryRaw === undefined || secondaryRaw === "" ? "Unknown" : String(secondaryRaw);
        if (secondaryLabel !== secondaryFilterValue) {
          return false;
        }
      }

      return true;
    });
  }, [baseRows, filterColumn, filterValue, secondaryFilterColumn, secondaryFilterValue]);

  const grouped = useMemo(() => {
    if (!groupByColumn || filteredRows.length === 0) return [] as AggregateBucket[];
    const buckets = new Map<string, { label: string; count: number; sum: number; min: number; max: number; numericCount: number }>();

    filteredRows.forEach((row) => {
      const rawGroup = row[groupByColumn];
      const groupLabel = rawGroup === null || rawGroup === undefined || rawGroup === "" ? "Unknown" : String(rawGroup);
      const entry = buckets.get(groupLabel) || { label: groupLabel, count: 0, sum: 0, min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY, numericCount: 0 };
      entry.count += 1;

      const maybeNumeric = metricColumn ? toNumber(row[metricColumn]) : null;
      if (maybeNumeric !== null) {
        entry.sum += maybeNumeric;
        entry.numericCount += 1;
        entry.min = Math.min(entry.min, maybeNumeric);
        entry.max = Math.max(entry.max, maybeNumeric);
      }
      buckets.set(groupLabel, entry);
    });

    const toValue = (entry: { count: number; sum: number; min: number; max: number; numericCount: number }) => {
      if (aggregation === "count") return entry.count;
      if (entry.numericCount === 0) return 0;
      if (aggregation === "sum") return entry.sum;
      if (aggregation === "min") return Number.isFinite(entry.min) ? entry.min : 0;
      if (aggregation === "max") return Number.isFinite(entry.max) ? entry.max : 0;
      return entry.sum / entry.numericCount;
    };

    return Array.from(buckets.entries())
      .map(([key, entry]) => ({
        key,
        label: key,
        value: Number(toValue(entry).toFixed(4)),
        count: entry.count
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20);
  }, [aggregation, filteredRows, groupByColumn, metricColumn]);

  const noData = baseRows.length === 0 || dimensionColumns.length === 0 || (aggregation !== "count" && metricColumns.length === 0);

  const metricLabel = aggregation === "count" ? "Record count" : metricColumn;

  return (
    <div className="space-y-4" data-testid="data-profile-live-dashboard">
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            Live Data Profile
          </CardTitle>
          <CardDescription>
            Explore metric and dimension interactions using filters and aggregation controls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {noData ? (
            <p className="text-sm text-gray-600">
              We don't have enough row-level data yet to build an interactive profile. Complete execution or upload data preview to unlock this view.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
                <div>
                  <LabelText text="Metric" />
                  <Select value={metricColumn} onValueChange={setMetricColumn} disabled={aggregation === "count"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose metric" />
                    </SelectTrigger>
                    <SelectContent>
                      {metricColumns.map((column) => (
                        <SelectItem key={column} value={column}>{column}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <LabelText text="Aggregation" />
                  <Select value={aggregation} onValueChange={(value) => setAggregation(value as AggregationMode)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Aggregation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avg">Average</SelectItem>
                      <SelectItem value="sum">Sum</SelectItem>
                      <SelectItem value="min">Minimum</SelectItem>
                      <SelectItem value="max">Maximum</SelectItem>
                      <SelectItem value="count">Count</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <LabelText text="Group by" />
                  <Select value={groupByColumn} onValueChange={setGroupByColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose dimension" />
                    </SelectTrigger>
                    <SelectContent>
                      {dimensionColumns.map((column) => (
                        <SelectItem key={column} value={column}>{column}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <LabelText text="Filter dimension" />
                  <Select value={filterColumn} onValueChange={setFilterColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="No filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No filter</SelectItem>
                      {dimensionColumns.map((column) => (
                        <SelectItem key={column} value={column}>{column}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <LabelText text="Filter level" />
                  <Select
                    value={filterValue}
                    onValueChange={setFilterValue}
                    disabled={filterColumn === "__none__"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All levels</SelectItem>
                      {filterValues.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <LabelText text="Filter dimension (2)" />
                  <Select value={secondaryFilterColumn} onValueChange={setSecondaryFilterColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="No filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No filter</SelectItem>
                      {dimensionColumns
                        .filter((column) => column !== filterColumn)
                        .map((column) => (
                          <SelectItem key={column} value={column}>{column}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <LabelText text="Filter level (2)" />
                  <Select
                    value={secondaryFilterValue}
                    onValueChange={setSecondaryFilterValue}
                    disabled={secondaryFilterColumn === "__none__"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All levels" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All levels</SelectItem>
                      {secondaryFilterValues.map((value) => (
                        <SelectItem key={value} value={value}>{value}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary" className="bg-blue-50 text-blue-800">
                  {filteredRows.length.toLocaleString()} records in view
                </Badge>
                <Badge variant="secondary" className="bg-indigo-50 text-indigo-800">
                  {grouped.length} {groupByColumn || "dimension"} levels
                </Badge>
                {aggregation !== "count" && metricColumn && (
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-800">
                    Metric: {metricColumn}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!noData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              {metricLabel} by {groupByColumn}
            </CardTitle>
            <CardDescription>
              Dynamic profile view based on your selected metric, dimensions, and level filters.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {grouped.length === 0 ? (
              <p className="text-sm text-gray-600">No matching rows for this filter selection.</p>
            ) : (
              <>
                <div className="h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={grouped} margin={{ top: 12, right: 12, bottom: 48, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        angle={grouped.length > 5 ? -25 : 0}
                        textAnchor={grouped.length > 5 ? "end" : "middle"}
                        height={grouped.length > 5 ? 64 : 30}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number) => [formatValue(value), metricLabel]}
                        labelFormatter={(label) => `${groupByColumn}: ${label}`}
                      />
                      <Bar dataKey="value" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {grouped.slice(0, 6).map((entry) => (
                    <div key={entry.key} className="rounded-lg border border-gray-200 p-3">
                      <p className="text-xs text-gray-500">{groupByColumn}</p>
                      <p className="font-semibold text-gray-900 truncate">{entry.label}</p>
                      <p className="text-sm text-indigo-700 mt-1">{formatValue(entry.value)} {aggregation.toUpperCase()}</p>
                      <p className="text-xs text-gray-500 mt-1">{entry.count} records</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function LabelText({ text }: { text: string }) {
  return <p className="text-xs font-medium text-gray-600 mb-1">{text}</p>;
}
