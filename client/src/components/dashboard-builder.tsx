import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Save, LayoutDashboard, Move, Trash2, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import VisualizationWorkshop from "./visualization-workshop";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import {
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid
} from "recharts";

// Color palette for charts
const CHART_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

// Interactive chart renderer component for dashboard fallback
function InteractiveChart({ chartType, chartData, xAxis, yAxis, title }: {
    chartType: string;
    chartData: any;
    xAxis?: string;
    yAxis?: string;
    title?: string;
}) {
    // Handle different data formats from visualization-workshop
    const data = chartData?.datasets?.[0]?.data?.map((value: number, index: number) => ({
        name: chartData.labels?.[index] || `Item ${index + 1}`,
        value: value,
        [yAxis || 'value']: value
    })) || chartData?.data || [];

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-64 flex items-center justify-center text-gray-400">
                No data available
            </div>
        );
    }

    const renderChart = () => {
        switch (chartType?.toLowerCase()) {
            case 'pie':
            case 'doughnut':
                return (
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            innerRadius={chartType === 'doughnut' ? 40 : 0}
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        >
                            {data.map((_: any, index: number) => (
                                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                );
            case 'line':
                return (
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="value" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                );
            case 'bar':
            default:
                return (
                    <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                );
        }
    };

    return (
        <ResponsiveContainer width="100%" height={256}>
            {renderChart()}
        </ResponsiveContainer>
    );
}

interface DashboardItem {
    id: string;
    type: string;
    title: string;
    config: any;
    imageData?: string;
}

interface DashboardBuilderProps {
    project: any;
    onSave?: (dashboard: any) => void;
}

export default function DashboardBuilder({ project, onSave }: DashboardBuilderProps) {
    const { toast } = useToast();
    const [items, setItems] = useState<DashboardItem[]>([]);
    const [isAddingChart, setIsAddingChart] = useState(false);
    const [dashboardTitle, setDashboardTitle] = useState("New Dashboard");
    const [draggedItem, setDraggedItem] = useState<number | null>(null);

    const handleAddChart = (chartConfig: any, imageData?: string) => {
        const newItem: DashboardItem = {
            id: `chart-${Date.now()}`,
            type: chartConfig.chartType || "bar",
            title: chartConfig.title || "Untitled Chart",
            config: chartConfig,
            imageData: imageData
        };
        setItems([...items, newItem]);
        setIsAddingChart(false);
        toast({
            title: "Chart Added",
            description: "Chart added to dashboard successfully."
        });
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...items];
        newItems.splice(index, 1);
        setItems(newItems);
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedItem(index);
        e.dataTransfer.effectAllowed = "move";
        // Set transparent drag image or custom one if needed
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedItem === null || draggedItem === index) return;

        const newItems = [...items];
        const item = newItems[draggedItem];
        newItems.splice(draggedItem, 1);
        newItems.splice(index, 0, item);

        setItems(newItems);
        setDraggedItem(index);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    const handleSaveDashboard = async () => {
        if (!items.length) {
            toast({
                title: "Empty Dashboard",
                description: "Please add at least one chart before saving.",
                variant: "destructive"
            });
            return;
        }

        try {
            const dashboardConfig = {
                title: dashboardTitle,
                items: items.map(item => ({
                    id: item.id,
                    type: item.type,
                    title: item.title,
                    config: item.config
                })),
                layout: "grid", // Default layout
                createdAt: new Date().toISOString()
            };

            await apiClient.post(`/api/projects/${project.id}/artifacts`, {
                type: 'dashboard',
                name: dashboardTitle,
                content: dashboardConfig
            });

            toast({
                title: "Dashboard Saved",
                description: "Your dashboard has been saved successfully."
            });
            if (onSave) onSave(dashboardConfig);
        } catch (error) {
            console.error("Error saving dashboard:", error);
            toast({
                title: "Save Failed",
                description: "Could not save dashboard. Please try again.",
                variant: "destructive"
            });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <LayoutDashboard className="w-6 h-6 text-purple-600" />
                    <input
                        type="text"
                        value={dashboardTitle}
                        onChange={(e) => setDashboardTitle(e.target.value)}
                        className="text-2xl font-bold bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-purple-500 rounded px-2"
                    />
                </div>
                <div className="flex gap-2">
                    <Dialog open={isAddingChart} onOpenChange={setIsAddingChart}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="w-4 h-4 mr-2" />
                                Add Chart
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-6xl h-[90vh] overflow-y-auto">
                            <DialogTitle className="sr-only">Add New Chart</DialogTitle>
                            <VisualizationWorkshop
                                project={project}
                                onClose={() => setIsAddingChart(false)}
                                // @ts-ignore - Assuming we add this prop to VisualizationWorkshop
                                onSave={(config, imageData) => handleAddChart(config, imageData)}
                            />
                        </DialogContent>
                    </Dialog>
                    <Button variant="outline" onClick={handleSaveDashboard}>
                        <Save className="w-4 h-4 mr-2" />
                        Save Dashboard
                    </Button>
                </div>
            </div >

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[400px] p-4 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                {items.length === 0 ? (
                    <div className="col-span-full flex flex-col items-center justify-center text-gray-400 py-20">
                        <LayoutDashboard className="w-16 h-16 mb-4 opacity-50" />
                        <p className="text-lg font-medium">Your dashboard is empty</p>
                        <p className="text-sm">Click "Add Chart" to start building</p>
                    </div>
                ) : (
                    items.map((item, index) => (
                        <Card
                            key={item.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={(e) => handleDragOver(e, index)}
                            onDragEnd={handleDragEnd}
                            className={`cursor-move transition-all ${draggedItem === index ? 'opacity-50 scale-95' : 'hover:shadow-md'}`}
                        >
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <div className="flex items-center gap-2">
                                    <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                                    <CardTitle className="text-base font-medium">
                                        {item.title}
                                    </CardTitle>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleRemoveItem(index)}
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </CardHeader>
                            <CardContent>
                                {item.imageData ? (
                                    <img
                                        src={item.imageData.startsWith('data:')
                                            ? item.imageData
                                            : `data:image/png;base64,${item.imageData}`}
                                        alt={item.title}
                                        className="w-full h-64 object-contain"
                                    />
                                ) : item.config?.chartData ? (
                                    // Interactive chart fallback when imageData is missing
                                    <InteractiveChart
                                        chartType={item.config?.chartType || item.type}
                                        chartData={item.config?.chartData}
                                        xAxis={item.config?.xAxis}
                                        yAxis={item.config?.yAxis}
                                        title={item.title}
                                    />
                                ) : (
                                    <div className="w-full h-64 bg-gray-100 flex flex-col items-center justify-center text-gray-400">
                                        <div className="text-2xl mb-2">📈</div>
                                        <div>Chart Preview</div>
                                        <div className="text-sm">{item.config?.chartType || item.type}</div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))
                )}
            </div>
        </div >
    );
}
