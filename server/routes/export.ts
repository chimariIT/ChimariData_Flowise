
import express from 'express';
import { exportService } from '../services/export-service';
import { jsonToCsv } from '../services/csv-export';

const router = express.Router();

router.post('/pdf', async (req, res) => {
  try {
    const analysisResult = req.body as any;
    const pdfBytes = await exportService.generatePdf(analysisResult);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=analysis.pdf');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

router.post('/pptx', async (req, res) => {
  try {
    const analysisResult = req.body as any;
    const buffer = await exportService.generatePptx(analysisResult);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', 'attachment; filename=analysis.pptx');
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error('Error generating PPTX:', error);
    res.status(500).send('Error generating PPTX');
  }
});

export default router;

// Lightweight generic exports for dashboard: JSON and CSV
router.post('/json', async (req, res) => {
  try {
    const payload = req.body ?? {};
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=analysis.json');
    res.send(Buffer.from(JSON.stringify(payload, null, 2)));
  } catch (error) {
    console.error('Error exporting JSON:', error);
    res.status(500).send('Error exporting JSON');
  }
});

router.post('/csv', async (req, res) => {
  try {
    const payload = req.body ?? {};
    const csv = jsonToCsv(payload);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=analysis.csv');
    res.send(Buffer.from(csv, 'utf-8'));
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).send('Error exporting CSV');
  }
});
