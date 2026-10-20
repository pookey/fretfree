import { SIGN_IN } from './config';
import { answerMatches, emailKey, isCodeAnswer, normaliseEmail } from './secrets';
import type { SignInStore } from './store';

/** The parts of the Cognito custom-auth trigger events the handler reads and writes. */
export interface ChallengeResult {
  challengeName: string;
  challengeResult: boolean;
}

export interface TriggerEvent {
  triggerSource: string;
  request: {
    userAttributes?: Record<string, string | undefined>;
    session?: ChallengeResult[];
    challengeAnswer?: string;
    userNotFound?: boolean;
  };
  response: Record<string, unknown>;
}

export interface DefineResponse {
  challengeName?: 'CUSTOM_CHALLENGE';
  issueTokens: boolean;
  failAuthentication: boolean;
}

/**
 * The Define Auth Challenge decision. Sign-in is one custom challenge ("type the
 * code, or follow the link"), retried a few times in one session. Any other flow
 * in the session, such as a password, fails it.
 */
export function defineChallenge(session: ChallengeResult[]): DefineResponse {
  const last = session.at(-1);
  if (session.some((c) => c.challengeName !== 'CUSTOM_CHALLENGE')) {
    return { issueTokens: false, failAuthentication: true };
  }
  if (last?.challengeResult) return { issueTokens: true, failAuthentication: false };
  if (session.length >= SIGN_IN.maxAnswersPerSession) {
    return { issueTokens: false, failAuthentication: true };
  }
  return { challengeName: 'CUSTOM_CHALLENGE', issueTokens: false, failAuthentication: false };
}

export interface TriggerDeps {
  store: SignInStore;
  /** Epoch milliseconds. */
  now(): number;
}

/**
 * The code and link token live in the store, not in the Cognito session, so the
 * link works in a different browser from the one that asked for the email, and
 * the attempt limit holds across sessions: starting a new session doesn't reset it.
 */
export async function verifyAnswer(
  deps: TriggerDeps,
  emailAttr: string | undefined,
  answer: string | undefined,
): Promise<boolean> {
  const email = normaliseEmail(emailAttr);
  if (!email || !answer) return false;
  const key = emailKey(email);
  const now = Math.floor(deps.now() / 1000);
  // A code is guessable, so each code answer is counted first, atomically, and
  // parallel guesses can't exceed the limit. A link token (256 random bits)
  // isn't, so it spends no attempt: wrong codes sent by someone who only knows
  // the address can't stop the link from working.
  const pending = isCodeAnswer(answer)
    ? await deps.store.useAttempt(key, now, SIGN_IN.maxAttempts)
    : await deps.store.get(key);
  if (!pending || pending.expiresAt <= now || !answerMatches(pending, answer)) return false;
  // Single use: only one answer can delete this issue.
  return deps.store.consume(key, pending.salt);
}

export function createTriggerHandler(
  deps: TriggerDeps,
): (event: TriggerEvent) => Promise<TriggerEvent> {
  return async (event) => {
    switch (event.triggerSource) {
      case 'DefineAuthChallenge_Authentication':
        Object.assign(event.response, defineChallenge(event.request.session ?? []));
        break;
      case 'CreateAuthChallenge_Authentication':
        // The email is sent by POST /auth/start, before the session starts.
        event.response.publicChallengeParameters = { method: 'email-code-or-link' };
        event.response.privateChallengeParameters = {};
        event.response.challengeMetadata = 'EMAIL_CODE_OR_LINK';
        break;
      case 'VerifyAuthChallengeResponse_Authentication':
        event.response.answerCorrect = await verifyAnswer(
          deps,
          event.request.userAttributes?.email,
          event.request.challengeAnswer,
        );
        break;
      default:
        throw new Error(`Unexpected trigger ${event.triggerSource}`);
    }
    return event;
  };
}
