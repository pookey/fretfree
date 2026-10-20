import { createAccountApi, syncApiUrl } from './api';
import { createCognito } from './cognito';
import { createSignIn, type SignIn } from './flow';

let signIn: SignIn | null | undefined;

/** This build's sign-in flow, or null when it has no sync API (accounts are off). */
export function getSignIn(): SignIn | null {
  if (signIn === undefined) {
    const url = syncApiUrl();
    const api = url ? createAccountApi(url) : null;
    signIn =
      api &&
      createSignIn({ api, cognito: async () => createCognito(await api.config()), now: Date.now });
  }
  return signIn;
}
