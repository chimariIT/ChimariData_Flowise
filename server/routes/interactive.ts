import { Router } from 'express';
import { ProjectManagerAgent } from '../services/project-manager-agent';
import { ensureAuthenticated } from './auth';

const router = Router();
const agent = new ProjectManagerAgent();

// Decide if a new project is needed or an existing one can be used
router.post('/decide-project', ensureAuthenticated, async (req, res) => {
    try {
        const { userDescription } = req.body;
        const userId = (req.user as any)?.id;
        if (!userDescription) {
            return res.status(400).json({ error: 'userDescription is required.' });
        }
        const result = await agent.decideProject(userDescription, userId);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Start the interactive session and get initial goals
router.post('/start', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId, userDescription, journeyType } = req.body;
        if (!projectId || !userDescription || !journeyType) {
            return res.status(400).json({ error: 'projectId, userDescription, and journeyType are required.' });
        }
        const result = await agent.startGoalExtraction(projectId, userDescription, journeyType);
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// User confirms the analysis path, and gets a cost estimate
router.post('/confirm-path', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId, selectedPathName, modifications } = req.body;
        if (!projectId || !selectedPathName) {
            return res.status(400).json({ error: 'projectId and selectedPathName are required.' });
        }
        const result = await agent.confirmPathAndEstimateCost(projectId, { selectedPathName, modifications });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// User approves the cost, and the analysis is executed
router.post('/approve-and-execute', ensureAuthenticated, async (req, res) => {
    try {
        const { projectId, approved } = req.body;
        if (!projectId || typeof approved !== 'boolean') {
            return res.status(400).json({ error: 'projectId and a boolean approval are required.' });
        }
        const result = await agent.approveCostAndExecute(projectId, { approved });
        res.json(result);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
