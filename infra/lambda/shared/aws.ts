import { createRequire } from 'node:module';

/**
 * Calls one AWS API operation with a plain input object, e.g.
 * `call('UpdateItem', { TableName, ... })`. Handlers depend on this, not on the
 * SDK, so tests pass a fake and the repo needs no SDK dependency.
 */
export type AwsCall = (operation: string, input: Record<string, unknown>) => Promise<unknown>;

interface SdkModule {
  [name: string]: new (input: unknown) => { send(command: unknown): Promise<unknown> };
}

// The Lambda Node.js runtime ships AWS SDK v3 on its module path; the bundle
// marks @aws-sdk/* external and loads it at run time.
const load = createRequire(import.meta.url) as (id: string) => SdkModule;

/**
 * An AwsCall backed by the runtime's SDK client. `client` is the package suffix
 * and class prefix, e.g. ('dynamodb', 'DynamoDB') → @aws-sdk/client-dynamodb.
 */
export function sdkCall(pkg: string, client: string, region?: string): AwsCall {
  const sdk = load(`@aws-sdk/client-${pkg}`);
  const Client = sdk[`${client}Client`]!;
  const instance = new Client(region ? { region } : {});
  return async (operation, input) => {
    const Command = sdk[`${operation}Command`];
    if (!Command) throw new Error(`@aws-sdk/client-${pkg} has no ${operation}Command`);
    return instance.send(new Command(input));
  };
}

/** The SDK names its errors; handlers branch on a few of them. */
export const errorName = (error: unknown): string =>
  error instanceof Error ? error.name : String(error);
