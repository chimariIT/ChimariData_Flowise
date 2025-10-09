import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Polyfill createObjectURL for libraries (e.g., plotly) that expect it
if (!global.URL.createObjectURL) {
	// @ts-ignore
	global.URL.createObjectURL = vi.fn();
}

// Mock canvas getContext to avoid jsdom errors
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(HTMLCanvasElement as any).prototype.getContext = vi.fn();

