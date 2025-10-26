import { Router } from 'express';
import { PerformanceMonitor } from '../utils/performance-monitor';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

// Get performance statistics
router.get('/performance-stats', authenticateAdmin, async (req, res) => {
  try {
    const performanceMonitor = PerformanceMonitor.getInstance();
    const stats = performanceMonitor.getAllStats();
    
    res.json(stats);
  } catch (error) {
    console.error('Failed to get performance stats:', error);
    res.status(500).json({ error: 'Failed to get performance statistics' });
  }
});

// Get performance report
router.get('/performance-report', authenticateAdmin, async (req, res) => {
  try {
    const performanceMonitor = PerformanceMonitor.getInstance();
    const report = performanceMonitor.generateReport();
    
    res.setHeader('Content-Type', 'text/plain');
    res.send(report);
  } catch (error) {
    console.error('Failed to generate performance report:', error);
    res.status(500).json({ error: 'Failed to generate performance report' });
  }
});

// Export performance metrics
router.get('/performance-export', authenticateAdmin, async (req, res) => {
  try {
    const performanceMonitor = PerformanceMonitor.getInstance();
    const metrics = performanceMonitor.exportMetrics();
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=performance-metrics.json');
    res.json(metrics);
  } catch (error) {
    console.error('Failed to export performance metrics:', error);
    res.status(500).json({ error: 'Failed to export performance metrics' });
  }
});

// Clear performance metrics
router.post('/performance-clear', authenticateAdmin, async (req, res) => {
  try {
    const performanceMonitor = PerformanceMonitor.getInstance();
    performanceMonitor.clearMetrics();
    
    console.info('Performance metrics cleared by admin');
    res.json({ message: 'Performance metrics cleared successfully' });
  } catch (error) {
    console.error('Failed to clear performance metrics:', error);
    res.status(500).json({ error: 'Failed to clear performance metrics' });
  }
});

// Update performance thresholds
router.post('/performance-thresholds', authenticateAdmin, async (req, res) => {
  try {
    const { operation, threshold } = req.body;
    
    if (!operation || typeof threshold !== 'number' || threshold <= 0) {
      return res.status(400).json({ 
        error: 'Invalid operation or threshold. Threshold must be a positive number.' 
      });
    }
    
    const performanceMonitor = PerformanceMonitor.getInstance();
    performanceMonitor.setThreshold(operation, threshold);
    
    console.info(`Performance threshold updated for ${operation}: ${threshold}ms`);
    res.json({ message: 'Threshold updated successfully' });
  } catch (error) {
    console.error('Failed to update performance threshold:', error);
    res.status(500).json({ error: 'Failed to update performance threshold' });
  }
});

// Get current thresholds
router.get('/performance-thresholds', authenticateAdmin, async (req, res) => {
  try {
    const performanceMonitor = PerformanceMonitor.getInstance();
    const thresholds = performanceMonitor.getThresholds();
    
    res.json(thresholds);
  } catch (error) {
    console.error('Failed to get performance thresholds:', error);
    res.status(500).json({ error: 'Failed to get performance thresholds' });
  }
});

// Get recent metrics
router.get('/performance-recent', authenticateAdmin, async (req, res) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 5;
    const performanceMonitor = PerformanceMonitor.getInstance();
    const recentMetrics = performanceMonitor.getRecentMetrics(minutes);
    
    res.json(recentMetrics);
  } catch (error) {
    console.error('Failed to get recent performance metrics:', error);
    res.status(500).json({ error: 'Failed to get recent performance metrics' });
  }
});

export default router;
