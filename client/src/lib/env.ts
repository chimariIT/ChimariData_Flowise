export const env = {
  TEST_MODE: import.meta.env.VITE_TEST_MODE === 'true',
  AUTH_FASTPATH: (import.meta as any).env?.VITE_AUTH_FASTPATH !== 'false',
};
