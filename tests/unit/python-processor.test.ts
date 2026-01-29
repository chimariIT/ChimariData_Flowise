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

  it('throws error when Python analysis fails', async () => {
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

    await expect(
      PythonProcessor.processTrial('trial-fallback', {
        preview,
        schema,
        recordCount: preview.length,
      })
    ).rejects.toThrow('Python analysis failed');

    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

