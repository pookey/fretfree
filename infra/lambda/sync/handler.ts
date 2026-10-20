import { sdkCall } from '../shared/aws';
import { createSyncHandler } from './api';
import { createDeleteUser } from './users';

// The sync API Lambda (`POST /sync/push`, `GET /sync/pull`, `DELETE /account`):
// the handlers in api.ts wired to the runtime's AWS SDK. The stack
// (lib/sync-stack.ts) sets TABLE_NAME, SEQ_INDEX and USER_POOL_ID.
const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

export const handler = createSyncHandler({
  table: {
    call: sdkCall('dynamodb', 'DynamoDB'),
    tableName: env('TABLE_NAME'),
    seqIndex: env('SEQ_INDEX'),
  },
  deleteUser: createDeleteUser(
    sdkCall('cognito-identity-provider', 'CognitoIdentityProvider'),
    env('USER_POOL_ID'),
  ),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
});
