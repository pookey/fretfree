// The remote runner's slower cores set TEST_TIMEOUT_SCALE (as vite.config.ts
// does for testTimeout). Tests that pick their own timeouts scale them too, or
// a fixed limit undercuts the scaled default there.
// Read through globalThis: the app's tsconfig has no Node types.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
const SCALE = Number(env?.TEST_TIMEOUT_SCALE ?? 1) || 1;

export const scaled = (ms: number): number => ms * SCALE;
