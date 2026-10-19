// A stand-in so the e2e suite can open the Tools section before any real tool
// ships. Hidden from learners: it lists only when TEST_TOOLS_KEY is set.
export const id = 'test-tool';
export const name = 'Test tool';
export const purpose = 'A stand-in tool for the end-to-end tests.';
export const icon = '✱';
export const order = 999;
export const testOnly = true;
