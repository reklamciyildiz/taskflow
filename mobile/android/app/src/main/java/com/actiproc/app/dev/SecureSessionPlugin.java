package com.actiproc.app.dev;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Set;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final Set<String> ALLOWED_KEYS = Set.of("refreshToken", "deviceId", "oauthVerifier", "oauthState");

    private SecureSessionStore store() { return new SecureSessionStore(getContext()); }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (!isAllowed(key) || value == null) { call.reject("Invalid secure storage key or value"); return; }
        try {
            store().set(key, value);
            call.resolve();
        } catch (Exception error) { call.reject("Secure storage write failed", error); }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (!isAllowed(key)) { call.reject("Invalid secure storage key"); return; }
        JSObject result = new JSObject();
        try {
            String value = store().get(key);
            result.put("value", value == null ? JSObject.NULL : value);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Secure storage read failed", error);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (!isAllowed(key)) { call.reject("Invalid secure storage key"); return; }
        store().remove(key);
        call.resolve();
    }

    private boolean isAllowed(String key) { return key != null && ALLOWED_KEYS.contains(key); }
}

