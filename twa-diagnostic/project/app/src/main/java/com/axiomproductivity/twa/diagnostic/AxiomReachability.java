package com.axiomproductivity.twa.diagnostic;

import java.net.HttpURLConnection;
import java.net.URL;

final class AxiomReachability {
    private static final String PROBE_URL =
            "https://getaxiomm.vercel.app/manifest.webmanifest?native_connectivity=1";

    private AxiomReachability() {}

    static boolean canReachAxiom() {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(PROBE_URL).openConnection();
            connection.setConnectTimeout(4_000);
            connection.setReadTimeout(5_000);
            connection.setUseCaches(false);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Cache-Control", "no-cache");
            int status = connection.getResponseCode();
            return status >= 200 && status < 400;
        } catch (Exception ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
