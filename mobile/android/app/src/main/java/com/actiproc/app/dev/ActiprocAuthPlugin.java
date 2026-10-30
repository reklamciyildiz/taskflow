package com.actiproc.app.dev;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.util.Base64;
import android.webkit.CookieManager;

import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Secure system-browser Custom Tabs OAuth handoff for Actiproc Capacitor app.
 * Resolves verified browsers, prevents TWA/WebView loopback, and completes
 * web-session cookie installation in the app's WebView.
 */
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
    private static volatile String lastHandledUri = null;

    @Override
    public void load() {
        super.load();
        try {
            CookieManager.getInstance().setAcceptCookie(true);
            if (bridge != null && bridge.getWebView() != null) {
                CookieManager.getInstance().setAcceptThirdPartyCookies(bridge.getWebView(), true);
            }
        } catch (Exception ignored) {
        }
        if (getActivity() != null && getActivity().getIntent() != null) {
            handleAuthUri(getActivity().getIntent().getData());
        }
    }

    @PluginMethod
    public void startGoogleSignIn(PluginCall call) {
        if (bridge == null || getActivity() == null) {
            call.reject("Native Google sign-in is unavailable.");
            return;
        }

        // Capacitor dispatches @PluginMethod on "CapacitorPlugins", not the WebView UI thread.
        bridge.executeOnMainThread(() -> {
            try {
                String currentUrl = bridge.getWebView() == null ? null : bridge.getWebView().getUrl();
                if (!isTrustedWebViewUrl(currentUrl)) {
                    call.reject("Google sign-in is only available from the trusted Actiproc origin.");
                    return;
                }
                String callbackPath = safeCallbackPath(call.getString("callbackUrl"));
                // Keep PKCE/Keystore work on the plugin thread, and UI operations on main.
                bridge.execute(() -> launchGoogleSignIn(call, callbackPath));
            } catch (Exception error) {
                call.reject("Could not verify the Google sign-in origin.", error);
            }
        });
    }

    private void launchGoogleSignIn(PluginCall call, String callbackPath) {
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

            String targetBrowser = getTargetBrowserPackage();
            if (targetBrowser == null) {
                clearPendingAuth();
                call.reject("No compatible system web browser found to perform secure Google sign-in.");
                return;
            }

            // Launch verified system browser as Custom Tab, never TWA or WebView
            CustomTabsIntent customTabs = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build();
            customTabs.intent.setPackage(targetBrowser);
            customTabs.intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            bridge.executeOnMainThread(() -> {
                try {
                    if (getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()) {
                        clearPendingAuth();
                        call.reject("Google sign-in activity is no longer available.");
                        return;
                    }
                    customTabs.launchUrl(getActivity(), authUrl);
                    call.resolve();
                } catch (Exception error) {
                    clearPendingAuth();
                    call.reject("Could not start secure Google sign-in.", error);
                }
            });
        } catch (Exception error) {
            clearPendingAuth();
            call.reject("Could not start secure Google sign-in: " + error.getMessage(), error);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent != null && intent.getData() != null) {
            handleAuthUri(intent.getData());
        }
    }

    public synchronized void handleAuthUri(Uri uri) {
        if (uri == null) return;
        boolean isHttps = "https".equalsIgnoreCase(uri.getScheme())
                && ("www.actiproc.com".equalsIgnoreCase(uri.getHost()) || "actiproc.com".equalsIgnoreCase(uri.getHost()))
                && CALLBACK_PATH.equals(uri.getPath());
        boolean isCustom = "actiproc".equalsIgnoreCase(uri.getScheme())
                && "mobile".equalsIgnoreCase(uri.getHost())
                && "/auth/callback".equals(uri.getPath());
        if (!isHttps && !isCustom) {
            return;
        }

        String uriKey = uri.toString();
        if (uriKey.equals(lastHandledUri)) return;
        lastHandledUri = uriKey;

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
            getActivity().runOnUiThread(() -> {
                bridge.getWebView().postUrl(
                        ORIGIN + SESSION_PATH,
                        body.getBytes(StandardCharsets.UTF_8));
                try {
                    CookieManager.getInstance().flush();
                } catch (Exception ignored) {
                }
            });
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

    private String getTargetBrowserPackage() {
        Context context = getContext();
        if (context == null) return null;
        PackageManager pm = context.getPackageManager();
        Intent genericHttp = new Intent(Intent.ACTION_VIEW, Uri.parse("https://accounts.google.com"));

        // 1. Check default browser
        ResolveInfo defaultInfo = pm.resolveActivity(genericHttp, PackageManager.MATCH_DEFAULT_ONLY);
        if (defaultInfo != null && defaultInfo.activityInfo != null) {
            String pkg = defaultInfo.activityInfo.packageName;
            if (isAllowedBrowserPackage(pkg)) {
                return pkg;
            }
        }

        // 2. Query all browsers; prefer Chrome
        List<ResolveInfo> resolved = pm.queryIntentActivities(genericHttp, PackageManager.MATCH_ALL);
        for (ResolveInfo info : resolved) {
            if (info.activityInfo != null && "com.android.chrome".equals(info.activityInfo.packageName)) {
                return "com.android.chrome";
            }
        }
        for (ResolveInfo info : resolved) {
            if (info.activityInfo != null && isAllowedBrowserPackage(info.activityInfo.packageName)) {
                return info.activityInfo.packageName;
            }
        }
        return null;
    }

    private static boolean isAllowedBrowserPackage(String pkg) {
        if (pkg == null) return false;
        return !"com.actiproc.app".equals(pkg)
                && !"com.actiproc.app.dev".equals(pkg)
                && !"com.axiomproductivity.twa.diagnostic".equals(pkg)
                && !"com.axiomproductivity.mobile.dev".equals(pkg)
                && !"android".equals(pkg);
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
