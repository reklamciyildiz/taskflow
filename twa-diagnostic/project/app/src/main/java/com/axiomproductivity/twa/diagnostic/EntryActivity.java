package com.axiomproductivity.twa.diagnostic;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class EntryActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        executor.execute(() -> {
            boolean reachable = AxiomReachability.canReachAxiom();
            runOnUiThread(() -> route(reachable));
        });
    }

    private void route(boolean reachable) {
        Intent target = new Intent(getIntent());
        target.setClass(this, reachable ? LauncherActivity.class : OfflineActivity.class);
        startActivity(target);
        finish();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
