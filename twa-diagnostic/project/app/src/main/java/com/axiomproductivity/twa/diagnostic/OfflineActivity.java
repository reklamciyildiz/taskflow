package com.axiomproductivity.twa.diagnostic;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class OfflineActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private Button retryButton;
    private TextView statusView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(buildContent());
    }

    private LinearLayout buildContent() {
        int padding = dp(28);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24), padding, dp(24), padding);
        root.setBackgroundColor(Color.rgb(15, 23, 42));

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(padding, padding, padding, padding);
        GradientDrawable cardBackground = new GradientDrawable();
        cardBackground.setColor(Color.rgb(22, 34, 53));
        cardBackground.setCornerRadius(dp(24));
        cardBackground.setStroke(dp(1), Color.rgb(42, 58, 81));
        card.setBackground(cardBackground);
        card.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView brand = text("✦  Axiom", 18, Color.rgb(96, 165, 250));
        brand.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        card.addView(brand);

        TextView title = text("We can’t reach Axiom", 30, Color.rgb(248, 250, 252));
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = paramsWithTop(dp(28));
        card.addView(title, titleParams);

        TextView detail = text(
                "Your connection or Axiom may be temporarily unavailable. Your account and saved work are unchanged.",
                16,
                Color.rgb(168, 181, 199));
        detail.setLineSpacing(0, 1.2f);
        card.addView(detail, paramsWithTop(dp(12)));

        statusView = text("Reconnect, then try again.", 14, Color.rgb(168, 181, 199));
        statusView.setAccessibilityLiveRegion(TextView.ACCESSIBILITY_LIVE_REGION_POLITE);
        card.addView(statusView, paramsWithTop(dp(18)));

        retryButton = new Button(this);
        retryButton.setText("Try again");
        retryButton.setTextSize(16);
        retryButton.setTextColor(Color.rgb(7, 17, 31));
        retryButton.setAllCaps(false);
        retryButton.setMinHeight(dp(50));
        GradientDrawable buttonBackground = new GradientDrawable();
        buttonBackground.setColor(Color.rgb(96, 165, 250));
        buttonBackground.setCornerRadius(dp(14));
        retryButton.setBackground(buttonBackground);
        retryButton.setOnClickListener(view -> retry());
        card.addView(retryButton, paramsWithTop(dp(18)));

        root.addView(card);
        return root;
    }

    private void retry() {
        retryButton.setEnabled(false);
        statusView.setText("Checking the connection…");
        executor.execute(() -> {
            boolean reachable = AxiomReachability.canReachAxiom();
            runOnUiThread(() -> {
                if (reachable) {
                    statusView.setText("Connection restored. Loading Axiom…");
                    Intent intent = new Intent(getIntent());
                    intent.setClass(this, LauncherActivity.class);
                    startActivity(intent);
                    finish();
                } else {
                    statusView.setText("Axiom is still unreachable. Check your connection and try again.");
                    retryButton.setEnabled(true);
                }
            });
        });
    }

    private TextView text(String value, float size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private LinearLayout.LayoutParams paramsWithTop(int top) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.topMargin = top;
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
