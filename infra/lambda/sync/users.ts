import { errorName, type AwsCall } from '../shared/aws';

/**
 * Deletes the Cognito user whose `sub` the token carried. The pool's username
 * is the email, but AdminDeleteUser also takes the sub. A user who is already
 * gone counts as deleted, so a retried `DELETE /account` gets past this step.
 */
export function createDeleteUser(
  cognito: AwsCall,
  userPoolId: string,
): (sub: string) => Promise<void> {
  return async (sub) => {
    try {
      await cognito('AdminDeleteUser', { UserPoolId: userPoolId, Username: sub });
    } catch (error) {
      if (errorName(error) !== 'UserNotFoundException') throw error;
    }
  };
}
