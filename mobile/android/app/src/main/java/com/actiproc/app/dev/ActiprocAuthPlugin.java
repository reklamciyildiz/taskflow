package com.actiproc.app.dev;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.regex.Pattern;

/** Secure system-browser OAuth handoff for Actiproc Capacitor app. */
@CapacitorPlugin(name = "ActiprocAuth")
public class ActiprocAuthPlugin extends Plugin {
    private static final String ORIGIN = "https://www.actiproc.com";
    private static final String HOST = "www.actiproc.com";
    private static final String CALLBACK_PATH = "/mobile/auth/callback";
    private static final String SESSION_PATH = "/api/mobile/auth/web-session";
    private static final Pattern CODE = Pattern.compile("^[A-Za-z0-9_-]{48,128}$");
    private static final Pattern STATE = Pattern.compile("^[A-Za-z0-9_-]{32,128}$");
    private static final Pattern VERIFIER = Pattern.compile("^[A-Za-z0-9_-]{43,128}$");

    private static final String KEY_VERIFIER = "nativeOauthVerifierV1";
    private static final String KEY_STATE = "nativeOauthStateV1";
    private static final String KEY_CALLBACK = "nativeOauthCallbackPathV1";

    @PluginMethod
    public void startGoogleSignIn(PluginCall call) {
        String currentUrl = bridge.getWebView().getUrl();
        String callbackPath = safeCallbackPath(call.getString("callbackUrl"));
        if (!isTrustedWebViewUrl(currentUrl)) {
            call.reject("Google sign-in is only available from the trusted Actiproc origin.");
            return;
        }
        try {
            String verifier = randomUrlSafe(64);
            String state = randomUrlSafe(48);
            String challenge = base64Url(MessageDigest.getInstance("SHA-256")
                    .digest(verifier.getBytes(StandardCharsets.UTF_8)));
            SecureSessionStore store = new SecureSessionStore(getContext());
            store.set(KEY_VERIFIER, verifier);
            store.set(KEY_STATE, state);
            store.set(KEY_CALLBACK, callbackPath);

            Uri authUrl = Uri.parse(ORIGIN + "/api/mobile/auth/google/start").buildUpon()
                    .appendQueryParameter("platform", "android")
                    .appendQueryParameter("code_challenge", challenge)
                    .appendQueryParameter("state", state)
                    .build();
            Intent browser = new Intent(Intent.ACTION_VIEW, authUrl);
            browser.addCategory(Intent.CATEGORY_BROWSABLE);
            getActivity().startActivity(browser);
            call.resolve();
        } catch (Exception error) {
            clearPendingAuth();
            call.reject("Could not start secure Google sign-in.", error);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        Uri uri = intent.getData();
        if (!"https".equals(uri.getScheme()) || !HOST.equals(uri.getHost()) || !CALLBACK_PATH.equals(uri.getPath())) {
            return;
        }
        try {
            SecureSessionStore store = new SecureSessionStore(getContext());
            String expectedState = store.get(KEY_STATE);
            String verifier = store.get(KEY_VERIFIER);
            String callbackPath = safeCallbackPath(store.get(KEY_CALLBACK));
            String returnedState = uri.getQueryParameter("state");
            String code = uri.getQueryParameter("code");
            String providerError = uri.getQueryParameter("error");

            if (!secureEqual(expectedState, returnedState) || expectedState == null || !STATE.matcher(expectedState).matches()) {
                clearPendingAuth();
                loadSignInError("OAuthState");
                return;
            }
            if (providerError != null || code == null) {
                clearPendingAuth();
                loadSignInError("OAuthCancelled");
                return;
            }
            if (!CODE.matcher(code).matches() || verifier == null || !VERIFIER.matcher(verifier).matches()) {
                clearPendingAuth();
                loadSignInError("OAuthCallback");
                return;
            }

            clearPendingAuth();

            String body = "code=" + encode(code)
                    + "&code_verifier=" + encode(verifier)
                    + "&callback_path=" + encode(callbackPath)
                    + "&platform=android";
            getActivity().runOnUiThread(() -> bridge.getWebView().postUrl(
                    ORIGIN + SESSION_PATH,
                    body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception error) {
            clearPendingAuth();
            loadSignInError("OAuthCallback");
        }
    }

    private void loadSignInError(String code) {
        String url = ORIGIN + "/auth/signin?error=" + Uri.encode(code);
        getActivity().runOnUiThread(() -> bridge.getWebView().loadUrl(url));
    }

    private void clearPendingAuth() {
        SecureSessionStore store = new SecureSessionStore(getContext());
        store.remove(KEY_VERIFIER);
        store.remove(KEY_STATE);
        store.remove(KEY_CALLBACK);
    }

    private static String safeCallbackPath(String value) {
        if (value == null || value.length() > 2048 || !value.startsWith("/") || value.startsWith("//")
                || value.indexOf('\\') >= 0 || value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) return "/";
        return value;
    }

    private static boolean isTrustedWebViewUrl(String value) {
        if (value == null) return false;
        try {
            Uri uri = Uri.parse(value);
            return ("https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPort() == -1)
                    || "capacitor".equals(uri.getScheme())
                    || "http".equals(uri.getScheme()) && "localhost".equals(uri.getHost());
        } catch (Exception ignored) {
            return false;
        }
    }

    private static String randomUrlSafe(int byteCount) {
        byte[] bytes = new byte[byteCount];
        new SecureRandom().nextBytes(bytes);
        return base64Url(bytes);
    }

    private static String base64Url(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static boolean secureEqual(String left, String right) {
        if (left == null || right == null) return false;
        return MessageDigest.isEqual(left.getBytes(StandardCharsets.UTF_8), right.getBytes(StandardCharsets.UTF_8));
    }

    private static String encode(String value) {
        return Uri.encode(value);
    }
}

