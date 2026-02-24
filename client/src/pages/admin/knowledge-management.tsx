/**
 * Admin Knowledge Base Management
 *
 * 6 sub-tabs: Overview, Nodes, Edges, Enrichment Review, Pattern Review, Feedback
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Brain, Network, GitBranch, Star, MessageSquare, BarChart3,
  Plus, Edit, Trash2, CheckCircle, XCircle, RefreshCw, Search,
  Loader2, Eye, ChevronLeft, ChevronRight
} from "lucide-react";

const NODE_TYPES = ["industry", "regulation", "template", "analysis_type", "question_pattern", "column_pattern"];
const NODE_TYPE_COLORS: Record<string, string> = {
  industry: "bg-blue-100 text-blue-800",
  regulation: "bg-orange-100 text-orange-800",
  template: "bg-green-100 text-green-800",
  analysis_type: "bg-purple-100 text-purple-800",
  question_pattern: "bg-yellow-100 text-yellow-800",
  column_pattern: "bg-gray-100 text-gray-800",
};

// ============================================================================
// OVERVIEW SECTION
// ============================================================================

function OverviewSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/knowledge/stats"],
    queryFn: () => apiClient.get("/api/admin/knowledge/stats"),
  });

  const seedMutation = useMutation({
    mutationFn: (force: boolean) => apiClient.post("/api/admin/knowledge/seed", { force }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] });
      toast({ title: "Knowledge graph seeded", description: `${result.data?.nodes || 0} nodes, ${result.data?.edges || 0} edges` });
      setShowSeedConfirm(false);
    },
    onError: (err: any) => toast({ title: "Seed failed", description: err.message, variant: "destructive" }),
  });

  const stats = (data as any)?.data;

  if (isLoading) return <div className="flex items-center gap-2 p-4"><Loader2 className="w-4 h-4 animate-spin" />Loading stats...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.totalNodes || 0}</div>
            <div className="text-xs text-muted-foreground">Total Nodes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats?.totalEdges || 0}</div>
            <div className="text-xs text-muted-foreground">Total Edges</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{stats?.pendingPatterns || 0}</div>
            <div className="text-xs text-muted-foreground">Pending Patterns</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-amber-600">{stats?.unprocessedFeedback || 0}</div>
            <div className="text-xs text-muted-foreground">Unprocessed Feedback</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Nodes by Type</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {NODE_TYPES.map(t => (
                <Badge key={t} className={NODE_TYPE_COLORS[t] || ""}>
                  {t}: {stats?.nodesByType?.[t] || 0}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Edges by Relationship</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats?.edgesByRelationship || {}).map(([rel, cnt]) => (
                <Badge key={rel} variant="outline">{rel}: {cnt as number}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => seedMutation.mutate(false)} disabled={seedMutation.isPending}>
          <RefreshCw className="w-3 h-3 mr-1" />Seed (safe)
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setShowSeedConfirm(true)} disabled={seedMutation.isPending}>
          <RefreshCw className="w-3 h-3 mr-1" />Force Re-seed
        </Button>
      </div>

      <Dialog open={showSeedConfirm} onOpenChange={setShowSeedConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force Re-seed Knowledge Graph?</DialogTitle>
            <DialogDescription>This will delete ALL existing nodes and edges, then re-seed from static data. Enrichment-created entries will be lost.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSeedConfirm(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => seedMutation.mutate(true)} disabled={seedMutation.isPending}>
              {seedMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}Confirm Force Re-seed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// NODES SECTION
// ============================================================================

function NodesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editNode, setEditNode] = useState<any>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewNode, setViewNode] = useState<any>(null);
  const [scoreNode, setScoreNode] = useState<any>(null);
  const [formData, setFormData] = useState({ type: "industry", label: "", summary: "", attributes: "{}" });
  const [scoreData, setScoreData] = useState({ score: 50, notes: "" });

  const params = new URLSearchParams({ page: String(page), limit: "25" });
  if (typeFilter !== "all") params.set("type", typeFilter);
  if (search.trim()) params.set("search", search.trim());

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/knowledge/nodes", typeFilter, search, page],
    queryFn: () => apiClient.get(`/api/admin/knowledge/nodes?${params.toString()}`),
  });

  const { data: nodeDetail } = useQuery({
    queryKey: ["/api/admin/knowledge/nodes", viewNode?.id],
    queryFn: () => apiClient.get(`/api/admin/knowledge/nodes/${viewNode.id}`),
    enabled: !!viewNode,
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiClient.post("/api/admin/knowledge/nodes", body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); setCreateOpen(false); toast({ title: "Node created" }); },
    onError: (err: any) => toast({ title: "Create failed", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => apiClient.put(`/api/admin/knowledge/nodes/${id}`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); setEditNode(null); toast({ title: "Node updated" }); },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/admin/knowledge/nodes/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); toast({ title: "Node deleted" }); },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const scoreMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => apiClient.put(`/api/admin/knowledge/nodes/${id}/score`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); setScoreNode(null); toast({ title: "Node scored" }); },
    onError: (err: any) => toast({ title: "Score failed", description: err.message, variant: "destructive" }),
  });

  const result = (data as any)?.data;
  const nodes = result?.nodes || [];
  const totalPages = result?.totalPages || 1;

  const openCreate = () => { setFormData({ type: "industry", label: "", summary: "", attributes: "{}" }); setCreateOpen(true); };
  const openEdit = (node: any) => { setFormData({ type: node.type, label: node.label, summary: node.summary || "", attributes: JSON.stringify(node.attributes || {}, null, 2) }); setEditNode(node); };

  const handleSave = () => {
    let attrs: any;
    try { attrs = JSON.parse(formData.attributes); } catch { toast({ title: "Invalid JSON in attributes", variant: "destructive" }); return; }
    if (editNode) {
      updateMutation.mutate({ id: editNode.id, body: { label: formData.label, summary: formData.summary, attributes: attrs } });
    } else {
      createMutation.mutate({ type: formData.type, label: formData.label, summary: formData.summary, attributes: attrs });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {NODE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search nodes..." className="pl-8" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-3 h-3 mr-1" />Add Node</Button>
      </div>

      {isLoading ? <div className="flex items-center gap-2 p-4"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead><TableHead>Label</TableHead><TableHead>Summary</TableHead><TableHead>Score</TableHead><TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodes.map((n: any) => (
              <TableRow key={n.id}>
                <TableCell><Badge className={NODE_TYPE_COLORS[n.type] || ""}>{n.type}</Badge></TableCell>
                <TableCell className="font-medium">{n.label}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{n.summary || "-"}</TableCell>
                <TableCell>{(n.attributes as any)?.adminScore != null ? <Badge variant="outline">{(n.attributes as any).adminScore}/100</Badge> : "-"}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewNode(n)}><Eye className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(n)}><Edit className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setScoreNode(n)}><Star className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm(`Delete node "${n.label}"?`)) deleteMutation.mutate(n.id); }}><Trash2 className="w-3 h-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {nodes.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No nodes found</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Page {page} of {totalPages} ({result?.total || 0} total)</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-3 h-3" /></Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="w-3 h-3" /></Button>
        </div>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={createOpen || !!editNode} onOpenChange={() => { setCreateOpen(false); setEditNode(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editNode ? "Edit Node" : "Create Node"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!editNode && (
              <Select value={formData.type} onValueChange={v => setFormData({ ...formData, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{NODE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Input placeholder="Label" value={formData.label} onChange={e => setFormData({ ...formData, label: e.target.value })} />
            <Input placeholder="Summary" value={formData.summary} onChange={e => setFormData({ ...formData, summary: e.target.value })} />
            <Textarea placeholder="Attributes (JSON)" value={formData.attributes} onChange={e => setFormData({ ...formData, attributes: e.target.value })} rows={6} className="font-mono text-xs" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setEditNode(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={!!viewNode} onOpenChange={() => setViewNode(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{viewNode?.label}</DialogTitle><DialogDescription>Type: {viewNode?.type}</DialogDescription></DialogHeader>
          <div className="space-y-3 max-h-96 overflow-auto">
            <div><strong className="text-xs">Summary:</strong> <span className="text-sm">{viewNode?.summary || "None"}</span></div>
            <div><strong className="text-xs">Attributes:</strong><pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto max-h-40">{JSON.stringify(viewNode?.attributes || {}, null, 2)}</pre></div>
            {(nodeDetail as any)?.data && (
              <>
                <div><strong className="text-xs">Outgoing Edges ({(nodeDetail as any).data.outgoingEdges?.length || 0}):</strong>
                  <div className="space-y-1 mt-1">{((nodeDetail as any).data.outgoingEdges || []).map((e: any) => (
                    <div key={e.id} className="text-xs flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px]">{e.relationship}</Badge>
                      <span>→ {e.targetLabel} ({e.targetType})</span>
                      <span className="text-muted-foreground">w:{e.weight?.toFixed(2)}</span>
                    </div>
                  ))}</div>
                </div>
                <div><strong className="text-xs">Incoming Edges ({(nodeDetail as any).data.incomingEdges?.length || 0}):</strong>
                  <div className="space-y-1 mt-1">{((nodeDetail as any).data.incomingEdges || []).map((e: any) => (
                    <div key={e.id} className="text-xs flex items-center gap-1">
                      <span>{e.sourceLabel} ({e.sourceType})</span>
                      <Badge variant="outline" className="text-[10px]">{e.relationship}</Badge>
                      <span>→</span>
                      <span className="text-muted-foreground">w:{e.weight?.toFixed(2)}</span>
                    </div>
                  ))}</div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Score Dialog */}
      <Dialog open={!!scoreNode} onOpenChange={() => setScoreNode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Score: {scoreNode?.label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium">Score (0-100)</label>
              <Input type="number" min={0} max={100} value={scoreData.score} onChange={e => setScoreData({ ...scoreData, score: parseInt(e.target.value) || 0 })} /></div>
            <div><label className="text-xs font-medium">Notes</label>
              <Textarea value={scoreData.notes} onChange={e => setScoreData({ ...scoreData, notes: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoreNode(null)}>Cancel</Button>
            <Button onClick={() => scoreMutation.mutate({ id: scoreNode.id, body: scoreData })}>Save Score</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// EDGES SECTION
// ============================================================================

function EdgesSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [relFilter, setRelFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editEdge, setEditEdge] = useState<any>(null);
  const [edgeForm, setEdgeForm] = useState({ weight: "1", attributes: "{}" });

  const params = new URLSearchParams({ page: String(page), limit: "25" });
  if (relFilter !== "all") params.set("relationship", relFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/knowledge/edges", relFilter, page],
    queryFn: () => apiClient.get(`/api/admin/knowledge/edges?${params.toString()}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => apiClient.put(`/api/admin/knowledge/edges/${id}`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); setEditEdge(null); toast({ title: "Edge updated" }); },
    onError: (err: any) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/api/admin/knowledge/edges/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); toast({ title: "Edge deleted" }); },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const result = (data as any)?.data;
  const edges = result?.edges || [];
  const totalPages = result?.totalPages || 1;
  const relationships = [...new Set(edges.map((e: any) => e.relationship))];

  const openEdit = (edge: any) => {
    setEdgeForm({ weight: String(edge.weight ?? 1), attributes: JSON.stringify(edge.attributes || {}, null, 2) });
    setEditEdge(edge);
  };

  const handleSave = () => {
    let attrs: any;
    try { attrs = JSON.parse(edgeForm.attributes); } catch { toast({ title: "Invalid JSON", variant: "destructive" }); return; }
    updateMutation.mutate({ id: editEdge.id, body: { weight: parseFloat(edgeForm.weight) || 1, attributes: attrs } });
  };

  return (
    <div className="space-y-3">
      <Select value={relFilter} onValueChange={v => { setRelFilter(v); setPage(1); }}>
        <SelectTrigger className="w-56"><SelectValue placeholder="Filter by relationship" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Relationships</SelectItem>
          {["HAS_TEMPLATE", "REQUIRES_COMPLIANCE", "EFFECTIVE_ANALYSIS", "ANSWERED_BY", "HAS_COLUMN_PATTERN"].map(r => (
            <SelectItem key={r} value={r}>{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? <div className="flex items-center gap-2 p-4"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead><TableHead>Relationship</TableHead><TableHead>Target</TableHead><TableHead>Weight</TableHead><TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {edges.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs">{e.sourceLabel} <Badge variant="outline" className="text-[10px] ml-1">{e.sourceType}</Badge></TableCell>
                <TableCell><Badge>{e.relationship}</Badge></TableCell>
                <TableCell className="text-xs">{e.targetLabel} <Badge variant="outline" className="text-[10px] ml-1">{e.targetType}</Badge></TableCell>
                <TableCell>{e.weight?.toFixed(2)}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(e)}><Edit className="w-3 h-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("Delete this edge?")) deleteMutation.mutate(e.id); }}><Trash2 className="w-3 h-3" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {edges.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No edges found</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-3 h-3" /></Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="w-3 h-3" /></Button>
        </div>
      </div>

      <Dialog open={!!editEdge} onOpenChange={() => setEditEdge(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Edge</DialogTitle><DialogDescription>{editEdge?.sourceLabel} → {editEdge?.targetLabel}</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium">Weight</label>
              <Input type="number" step="0.01" value={edgeForm.weight} onChange={e => setEdgeForm({ ...edgeForm, weight: e.target.value })} /></div>
            <div><label className="text-xs font-medium">Attributes (JSON)</label>
              <Textarea value={edgeForm.attributes} onChange={e => setEdgeForm({ ...edgeForm, attributes: e.target.value })} rows={6} className="font-mono text-xs" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEdge(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// ENRICHMENT REVIEW SECTION
// ============================================================================

function EnrichmentSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [view, setView] = useState<"history" | "pending">("pending");
  const [page, setPage] = useState(1);
  const [reviewNode, setReviewNode] = useState<any>(null);
  const [reviewScore, setReviewScore] = useState(50);

  const historyQuery = useQuery({
    queryKey: ["/api/admin/knowledge/review/enrichment/history", page],
    queryFn: () => apiClient.get(`/api/admin/knowledge/review/enrichment/history?page=${page}&limit=25`),
    enabled: view === "history",
  });

  const pendingQuery = useQuery({
    queryKey: ["/api/admin/knowledge/review/enrichment/pending", page],
    queryFn: () => apiClient.get(`/api/admin/knowledge/review/enrichment/pending?page=${page}&limit=25`),
    enabled: view === "pending",
  });

  const reviewMutation = useMutation({
    mutationFn: ({ nodeId, body }: { nodeId: string; body: any }) => apiClient.post(`/api/admin/knowledge/review/enrichment/review/${nodeId}`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); setReviewNode(null); toast({ title: "Review submitted" }); },
    onError: (err: any) => toast({ title: "Review failed", description: err.message, variant: "destructive" }),
  });

  const historyData = (historyQuery.data as any)?.data;
  const pendingData = (pendingQuery.data as any)?.data;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button size="sm" variant={view === "pending" ? "default" : "outline"} onClick={() => { setView("pending"); setPage(1); }}>
          Pending Review ({pendingData?.total || "..."})
        </Button>
        <Button size="sm" variant={view === "history" ? "default" : "outline"} onClick={() => { setView("history"); setPage(1); }}>
          Enrichment History
        </Button>
      </div>

      {view === "pending" && (
        pendingQuery.isLoading ? <div className="p-4"><Loader2 className="w-4 h-4 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Label</TableHead><TableHead>Created</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {(pendingData?.nodes || []).map((n: any) => (
                <TableRow key={n.id}>
                  <TableCell><Badge className={NODE_TYPE_COLORS[n.type] || ""}>{n.type}</Badge></TableCell>
                  <TableCell className="font-medium">{n.label}</TableCell>
                  <TableCell className="text-xs">{n.createdAt ? new Date(n.createdAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setReviewNode(n); setReviewScore(50); }}>
                      <CheckCircle className="w-3 h-3 mr-1" />Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => {
                      if (confirm(`Reject and delete "${n.label}"?`)) reviewMutation.mutate({ nodeId: n.id, body: { action: "reject" } });
                    }}>
                      <XCircle className="w-3 h-3 mr-1" />Reject
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(pendingData?.nodes || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No pending nodes</TableCell></TableRow>}
            </TableBody>
          </Table>
        )
      )}

      {view === "history" && (
        historyQuery.isLoading ? <div className="p-4"><Loader2 className="w-4 h-4 animate-spin" /></div> : (
          <Table>
            <TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Industry</TableHead><TableHead>Profile Updates</TableHead><TableHead>KB Updates</TableHead><TableHead>Processed</TableHead></TableRow></TableHeader>
            <TableBody>
              {(historyData?.history || []).map((h: any) => (
                <TableRow key={h.projectId}>
                  <TableCell className="font-medium text-xs">{h.projectName}</TableCell>
                  <TableCell><Badge variant="outline">{h.industry}</Badge></TableCell>
                  <TableCell>{h.userProfileUpdates}</TableCell>
                  <TableCell>{h.knowledgeGraphUpdates}</TableCell>
                  <TableCell className="text-xs">{h.processedAt ? new Date(h.processedAt).toLocaleString() : "-"}</TableCell>
                </TableRow>
              ))}
              {(historyData?.history || []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No enrichment history</TableCell></TableRow>}
            </TableBody>
          </Table>
        )
      )}

      {/* P2-2 FIX: Pagination controls for enrichment section */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-muted-foreground">
          Page {page} {view === "pending" ? `of ${Math.ceil((pendingData?.total || 0) / 25) || 1}` : ""}
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs"
            disabled={view === "pending" ? (pendingData?.nodes || []).length < 25 : (historyData?.history || []).length < 25}
            onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={!!reviewNode} onOpenChange={() => setReviewNode(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Approve: {reviewNode?.label}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium">Quality Score (0-100)</label>
              <Input type="number" min={0} max={100} value={reviewScore} onChange={e => setReviewScore(parseInt(e.target.value) || 0)} /></div>
            <pre className="text-xs bg-muted p-2 rounded max-h-32 overflow-auto">{JSON.stringify(reviewNode?.attributes || {}, null, 2)}</pre>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewNode(null)}>Cancel</Button>
            <Button onClick={() => reviewMutation.mutate({ nodeId: reviewNode.id, body: { action: "approve", score: reviewScore } })}>Approve</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// PATTERNS SECTION
// ============================================================================

function PatternsSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/knowledge/review/patterns", statusFilter, page],
    queryFn: () => apiClient.get(`/api/admin/knowledge/review/patterns?status=${statusFilter}&page=${page}&limit=25`),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => apiClient.post(`/api/admin/knowledge/review/patterns/${id}/review`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); toast({ title: "Pattern reviewed" }); },
    onError: (err: any) => toast({ title: "Review failed", description: err.message, variant: "destructive" }),
  });

  const result = (data as any)?.data;
  const patterns = result?.patterns || [];
  const totalPages = result?.totalPages || 1;

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = { pending_review: "bg-amber-100 text-amber-800", approved: "bg-green-100 text-green-800", rejected: "bg-red-100 text-red-800", ready: "bg-blue-100 text-blue-800" };
    return <Badge className={colors[status] || ""}>{status}</Badge>;
  };

  return (
    <div className="space-y-3">
      <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="pending_review">Pending Review</SelectItem>
          <SelectItem value="approved">Approved</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
          <SelectItem value="ready">Ready</SelectItem>
        </SelectContent>
      </Select>

      {isLoading ? <div className="p-4"><Loader2 className="w-4 h-4 animate-spin" /></div> : (
        <Table>
          <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Industry</TableHead><TableHead>Goal</TableHead><TableHead>Confidence</TableHead><TableHead>Status</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {patterns.map((p: any) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium text-xs">{p.name}</TableCell>
                <TableCell><Badge variant="outline">{p.industry || "general"}</Badge></TableCell>
                <TableCell className="text-xs max-w-32 truncate">{p.goal || "-"}</TableCell>
                <TableCell>{p.confidence != null ? `${Math.round(p.confidence)}%` : "-"}</TableCell>
                <TableCell>{statusBadge(p.status)}</TableCell>
                <TableCell className="flex gap-1">
                  {p.status === "pending_review" && (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => reviewMutation.mutate({ id: p.id, body: { action: "approve" } })}>
                        <CheckCircle className="w-3 h-3 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => reviewMutation.mutate({ id: p.id, body: { action: "reject" } })}>
                        <XCircle className="w-3 h-3 mr-1" />Reject
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {patterns.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No patterns found</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-3 h-3" /></Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="w-3 h-3" /></Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// FEEDBACK SECTION
// ============================================================================

function FeedbackSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [processedFilter, setProcessedFilter] = useState("false");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [viewFeedback, setViewFeedback] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/knowledge/review/feedback", processedFilter, page],
    queryFn: () => apiClient.get(`/api/admin/knowledge/review/feedback?processed=${processedFilter}&page=${page}&limit=25`),
  });

  const processMutation = useMutation({
    mutationFn: (id: string) => apiClient.post(`/api/admin/knowledge/review/feedback/${id}/process`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); toast({ title: "Feedback processed" }); },
    onError: (err: any) => toast({ title: "Process failed", description: err.message, variant: "destructive" }),
  });

  const batchMutation = useMutation({
    mutationFn: (ids: string[]) => apiClient.post("/api/admin/knowledge/review/feedback/batch-process", { ids }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/knowledge"] }); setSelectedIds(new Set()); toast({ title: "Batch processed" }); },
    onError: (err: any) => toast({ title: "Batch failed", description: err.message, variant: "destructive" }),
  });

  const result = (data as any)?.data;
  const feedback = result?.feedback || [];
  const totalPages = result?.totalPages || 1;

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <Select value={processedFilter} onValueChange={v => { setProcessedFilter(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Unprocessed</SelectItem>
            <SelectItem value="true">Processed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        {selectedIds.size > 0 && (
          <Button size="sm" onClick={() => batchMutation.mutate(Array.from(selectedIds))} disabled={batchMutation.isPending}>
            <CheckCircle className="w-3 h-3 mr-1" />Mark {selectedIds.size} as Processed
          </Button>
        )}
      </div>

      {isLoading ? <div className="p-4"><Loader2 className="w-4 h-4 animate-spin" /></div> : (
        <Table>
          <TableHeader><TableRow><TableHead className="w-8"></TableHead><TableHead>Template</TableHead><TableHead>Rating</TableHead><TableHead>Industry Acc.</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {feedback.map((f: any) => (
              <TableRow key={f.id}>
                <TableCell>
                  {!f.processed && (
                    <input type="checkbox" checked={selectedIds.has(f.id)} onChange={() => toggleSelect(f.id)} className="rounded" />
                  )}
                </TableCell>
                <TableCell className="text-xs font-mono">{f.templateId?.slice(0, 12) || "-"}</TableCell>
                <TableCell><Badge variant="outline">{f.rating}/5</Badge></TableCell>
                <TableCell><Badge variant="outline">{f.industryAccuracy}/5</Badge></TableCell>
                <TableCell>{f.processed ? <Badge className="bg-green-100 text-green-800">Processed</Badge> : <Badge className="bg-amber-100 text-amber-800">Pending</Badge>}</TableCell>
                <TableCell className="text-xs">{f.createdAt ? new Date(f.createdAt).toLocaleDateString() : "-"}</TableCell>
                <TableCell className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewFeedback(f)}><Eye className="w-3 h-3" /></Button>
                  {!f.processed && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => processMutation.mutate(f.id)}><CheckCircle className="w-3 h-3" /></Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {feedback.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No feedback found</TableCell></TableRow>}
          </TableBody>
        </Table>
      )}

      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="w-3 h-3" /></Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="w-3 h-3" /></Button>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!viewFeedback} onOpenChange={() => setViewFeedback(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Feedback Detail</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div><strong>Template ID:</strong> {viewFeedback?.templateId}</div>
            <div><strong>User ID:</strong> {viewFeedback?.userId}</div>
            <div><strong>Rating:</strong> {viewFeedback?.rating}/5</div>
            <div><strong>Industry Accuracy:</strong> {viewFeedback?.industryAccuracy}/5</div>
            <div><strong>Missing Metrics:</strong><pre className="text-xs bg-muted p-2 rounded mt-1">{JSON.stringify(viewFeedback?.missingMetrics || [], null, 2)}</pre></div>
            <div><strong>Irrelevant Sections:</strong><pre className="text-xs bg-muted p-2 rounded mt-1">{JSON.stringify(viewFeedback?.irrelevantSections || [], null, 2)}</pre></div>
            <div><strong>Comments:</strong> {viewFeedback?.additionalComments || "None"}</div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function KnowledgeManagement() {
  const [activeSubTab, setActiveSubTab] = useState("overview");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="w-5 h-5" />
          Knowledge Base Management
        </CardTitle>
        <CardDescription>Manage knowledge graph nodes, edges, enrichment review, analysis patterns, and template feedback</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList className="flex flex-wrap gap-1 mb-4">
            <TabsTrigger value="overview" className="text-xs"><BarChart3 className="w-3 h-3 mr-1" />Overview</TabsTrigger>
            <TabsTrigger value="nodes" className="text-xs"><Brain className="w-3 h-3 mr-1" />Nodes</TabsTrigger>
            <TabsTrigger value="edges" className="text-xs"><GitBranch className="w-3 h-3 mr-1" />Edges</TabsTrigger>
            <TabsTrigger value="enrichment" className="text-xs"><RefreshCw className="w-3 h-3 mr-1" />Enrichment</TabsTrigger>
            <TabsTrigger value="patterns" className="text-xs"><Network className="w-3 h-3 mr-1" />Patterns</TabsTrigger>
            <TabsTrigger value="feedback" className="text-xs"><MessageSquare className="w-3 h-3 mr-1" />Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewSection /></TabsContent>
          <TabsContent value="nodes"><NodesSection /></TabsContent>
          <TabsContent value="edges"><EdgesSection /></TabsContent>
          <TabsContent value="enrichment"><EnrichmentSection /></TabsContent>
          <TabsContent value="patterns"><PatternsSection /></TabsContent>
          <TabsContent value="feedback"><FeedbackSection /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
