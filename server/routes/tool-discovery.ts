import { Router } from 'express';
import { MCPToolRegistry, ToolDefinition } from '../services/mcp-tool-registry';

const router = Router();

/**
 * GET /tools
 * List all tools, optionally filtered by category
 */
router.get('/', (req, res) => {
    try {
        const category = req.query.category as string;
        let tools: ToolDefinition[];

        if (category) {
            tools = MCPToolRegistry.getToolsByCategory(category);
        } else {
            tools = MCPToolRegistry.getAllTools();
        }

        res.json({
            success: true,
            count: tools.length,
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                category: t.category,
                capabilities: t.capabilities,
                inputTypes: t.inputTypes,
                complexity: t.complexity
            }))
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /tools/search
 * Search tools by semantic intent (description/name keywords)
 */
router.get('/search', (req, res) => {
    try {
        const q = req.query.q as string;
        if (!q) {
            return res.status(400).json({ success: false, error: 'Query parameter "q" (intent) is required' });
        }

        const tools = MCPToolRegistry.findToolsByIntent(q);

        res.json({
            success: true,
            query: q,
            matches: tools.length,
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                capabilities: t.capabilities,
                matchScore: 'N/A' // Placeholder until scoring is improved
            }))
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /tools/capability/:capability
 * Find tools by specific capability
 */
router.get('/capability/:capability', (req, res) => {
    try {
        const capability = req.params.capability;
        const tools = MCPToolRegistry.findToolsByCapability(capability);

        res.json({
            success: true,
            capability,
            count: tools.length,
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                category: t.category
            }))
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /tools/input-type
 * Find tools by supported input type
 */
router.get('/input-type', (req, res) => {
    try {
        const type = req.query.type as string;
        if (!type) {
            return res.status(400).json({ success: false, error: 'Query parameter "type" is required' });
        }

        const tools = MCPToolRegistry.findToolsByInputType(type);

        res.json({
            success: true,
            inputType: type,
            count: tools.length,
            tools: tools.map(t => ({
                name: t.name,
                description: t.description,
                capabilities: t.capabilities
            }))
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * POST /tools/validate
 * Validate if an agent/user can access a tool
 */
router.post('/validate', (req, res) => {
    try {
        const { toolName, userId, projectTier } = req.body;

        if (!toolName || !userId) {
            return res.status(400).json({ success: false, error: 'toolName and userId are required' });
        }

        const canAccess = MCPToolRegistry.validateToolAccess(toolName, { userId, tier: projectTier });

        res.json({
            success: true,
            accessGranted: canAccess,
            tool: toolName,
            userId
        });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
