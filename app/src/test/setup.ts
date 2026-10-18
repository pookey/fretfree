import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// findBy*/waitFor default to 1 s, which live queries miss under heavy load.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());
