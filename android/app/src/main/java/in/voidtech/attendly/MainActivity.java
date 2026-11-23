package in.voidtech.attendly;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    // The same protected staging URL is used until a reviewed public release exists.
    private static final String START_URL =
            "https://attendly-cloudflare-preview.void-tech-shiv.workers.dev/";
    private WebView browser;

    private static boolean inAppHost(String host) {
        if (host == null) return false;
        host = host.toLowerCase(java.util.Locale.ROOT);
        return host.equals("attendly-cloudflare-preview.void-tech-shiv.workers.dev")
                || host.equals("cloudflareaccess.com")
                || host.endsWith(".cloudflareaccess.com");
    }

    private static final String APP_HOST = "attendly-cloudflare-preview.void-tech-shiv.workers.dev";

    private String readAsset(String file) throws IOException {
        try (InputStream stream = getAssets().open(file);
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[4096];
            int n;
            while ((n = stream.read(chunk)) != -1) bytes.write(chunk, 0, n);
            return new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private void installMobileSkin(WebView view, String url) {
        Uri current = Uri.parse(url);
        // Never inject UI JavaScript into the Cloudflare Access identity page.
        if (!"https".equalsIgnoreCase(current.getScheme()) ||
            !APP_HOST.equalsIgnoreCase(current.getHost())) return;
        try {
            String css = readAsset("attendly-theme.css");
            String script = readAsset("attendly-drawer.js");
            view.evaluateJavascript("(function(){if(window.__attendlyMobileStyle)return;" +
                "window.__attendlyMobileStyle=true;var style=document.createElement('style');" +
                "style.textContent=" + JSONObject.quote(css) + ";document.head.appendChild(style);})();", null);
            view.evaluateJavascript(script, null);
        } catch (IOException ignored) {
            // Missing visual assets must not interfere with ERP login or sessions.
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(247, 248, 253));
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        FrameLayout root = new FrameLayout(this);
        browser = new WebView(this);
        root.addView(browser, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return insets;
            });
            root.requestApplyInsets();
        }

        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings options = browser.getSettings();
        options.setJavaScriptEnabled(true);
        options.setDomStorageEnabled(true);
        options.setAllowFileAccess(false);
        options.setAllowContentAccess(false);
        options.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        options.setJavaScriptCanOpenWindowsAutomatically(false);
        options.setSupportMultipleWindows(false);
        if (Build.VERSION.SDK_INT >= 26) options.setSafeBrowsingEnabled(true);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(browser, true);

        browser.setWebChromeClient(new WebChromeClient());
        browser.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                Uri url = request.getUrl();
                if ("https".equalsIgnoreCase(url.getScheme()) && inAppHost(url.getHost())) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, url));
                } catch (ActivityNotFoundException ignored) {
                    // Never load untrusted schemes within the WebView.
                }
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                installMobileSkin(view, url);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }
        });
        if (savedInstanceState == null) {
            browser.loadUrl(START_URL);
        } else {
            browser.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        browser.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (browser == null) {
            super.onBackPressed();
            return;
        }
        browser.evaluateJavascript(
            "(typeof window.__attendlyCloseDrawer==='function' && window.__attendlyCloseDrawer())",
            result -> {
                if ("true".equals(result)) return;
                if (browser != null && browser.canGoBack()) browser.goBack();
                else MainActivity.super.onBackPressed();
            });
    }

    @Override
    protected void onDestroy() {
        if (browser != null) {
            browser.destroy();
            browser = null;
        }
        super.onDestroy();
    }
}
