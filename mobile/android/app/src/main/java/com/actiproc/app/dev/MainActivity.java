package com.actiproc.app.dev;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(ActiprocAuthPlugin.class);
        registerPlugin(AxiomAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

