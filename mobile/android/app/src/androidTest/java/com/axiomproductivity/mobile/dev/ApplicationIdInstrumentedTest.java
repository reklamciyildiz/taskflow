package com.axiomproductivity.mobile.dev;

import static org.junit.Assert.assertEquals;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ApplicationIdInstrumentedTest {
    @Test
    public void applicationIdMatchesDevelopmentIdentity() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.axiomproductivity.mobile.dev", appContext.getPackageName());
    }
}
