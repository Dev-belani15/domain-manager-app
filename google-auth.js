/**
 * Google Identity Services (GIS) Client Integration
 * Official Google OAuth login module for DomainPortal
 */

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '717056458888-ll7u994gjkl0j57t8mn7v774k0sgjls7.apps.googleusercontent.com';

/**
 * Check if Google Identity Services script is loaded
 */
export function isGoogleAvailable() {
  return typeof window !== 'undefined' && Boolean(window.google?.accounts?.oauth2 || window.google?.accounts?.id);
}

/**
 * Trigger Google OAuth popup login
 * Opens Google's official account selector dialog
 */
export function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      return reject(new Error('Google Identity Services script is still loading. Please check your internet connection and try again.'));
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: 'email profile openid',
        prompt: 'select_account',
        callback: (response) => {
          if (response.error) {
            return reject(new Error(response.error_description || response.error));
          }
          if (response.access_token) {
            resolve({ accessToken: response.access_token });
          } else {
            reject(new Error('No access token returned from Google.'));
          }
        },
        error_callback: (error) => {
          reject(new Error(error.message || 'Google Sign-In was cancelled or failed.'));
        }
      });

      tokenClient.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Optional Google One Tap / Credential prompt
 */
export function initGoogleOneTap(onSuccess) {
  if (typeof window === 'undefined' || !window.google?.accounts?.id) return;

  try {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        if (response.credential && onSuccess) {
          onSuccess({ credential: response.credential });
        }
      }
    });

    window.google.accounts.id.prompt();
  } catch (err) {
    console.warn('[Google One Tap]:', err.message);
  }
}
