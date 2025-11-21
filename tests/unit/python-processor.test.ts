import { describe, it, expect, vi } from 'vitest';
import { PythonProcessor } from '../../server/services/python-processor';

describe('PythonProcessor', () => {
  it('returns an error when preview data is missing', async () => {
    const result = await PythonProcessor.processTrial('trial-empty', {
      preview: [],
      schema: {},
      recordCount: 0,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/No data provided/i);
  });

  it('falls back to enhanced analysis when the Python script fails', async () => {
    const preview = [
      { score: 88, label: 'A' },
      { score: 73, label: 'B' },
    ];

    const schema = {
      score: { type: 'number' },
      label: { type: 'string' },
    };

    const spy = vi
      .spyOn(PythonProcessor as any, 'executeRealPythonAnalysis')
      .mockResolvedValue({ success: false, error: 'Python not available' });

    const result = await PythonProcessor.processTrial('trial-fallback', {
      preview,
      schema,
      recordCount: preview.length,
    });

    expect(spy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.data.summary).toContain('Enhanced JavaScript fallback');
    expect(result.data.recommendations).toBeDefined();

    spy.mockRestore();
  });
});

