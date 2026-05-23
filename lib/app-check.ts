import { getApp } from 'firebase/app';
import { getToken, initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

export async function getAppCheckToken(): Promise<string> {
  const app = getApp();
  const appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY!),
    isTokenAutoRefreshEnabled: true,
  });
  const { token } = await getToken(appCheck);
  return token;
}
