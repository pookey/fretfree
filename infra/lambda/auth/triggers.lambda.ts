import { sdkCall } from '../shared/aws';
import { dynamoStore } from './store';
import { createTriggerHandler } from './triggers';

// The Cognito custom-auth trigger Lambda, wired to the runtime's AWS SDK. It gets
// no user pool ID: the pool names this function, so the reverse would be a cycle.
const table = process.env.SIGN_IN_TABLE;
if (!table) throw new Error('SIGN_IN_TABLE is not set');

export const handler = createTriggerHandler({
  store: dynamoStore(sdkCall('dynamodb', 'DynamoDB'), table),
  now: Date.now,
});
