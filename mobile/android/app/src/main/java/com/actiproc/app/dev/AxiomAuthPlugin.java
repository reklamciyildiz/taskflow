package com.actiproc.app.dev;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Backward-compatibility alias for live web app checking Capacitor.Plugins.AxiomAuth.
 * Delegates startGoogleSignIn to the single canonical ActiprocAuthPlugin without
 * registering duplicate intent or lifecycle handlers.
 */
@CapacitorPlugin(name = "AxiomAuth")
public class AxiomAuthPlugin extends Plugin {
    @PluginMethod
    public void startGoogleSignIn(PluginCall call) {
        Plugin actiprocAuth = bridge.getPlugin("ActiprocAuth") != null
                ? bridge.getPlugin("ActiprocAuth").getInstance()
                : null;
        if (actiprocAuth instanceof ActiprocAuthPlugin) {
            ((ActiprocAuthPlugin) actiprocAuth).startGoogleSignIn(call);
        } else {
            call.reject("ActiprocAuth plugin is not available.");
        }
    }
}
