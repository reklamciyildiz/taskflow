import Network
import UIKit
import WebKit

final class AxiomWebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let origin = URL(string: "https://getaxiomm.vercel.app")!
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.axiomproductivity.ios.network")
    private var webView: WKWebView!
    private let offlineLabel = UILabel()
    private var wasOffline = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
        configureWebView()
        configureOfflineBanner()
        startNetworkMonitor()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(applicationDidBecomeActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
        loadAxiom()
    }

    deinit {
        monitor.cancel()
        NotificationCenter.default.removeObserver(self)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "axiomAuth")
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "axiomNative")
    }

    private func configureWebView() {
        let controller = WKUserContentController()
        controller.add(self, name: "axiomAuth")
        controller.add(self, name: "axiomNative")
        controller.addUserScript(WKUserScript(
            source: "window.__AXIOM_NATIVE_PLATFORM__ = 'ios';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.userContentController = controller
        configuration.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(refreshPage(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
    }

    private func configureOfflineBanner() {
        offlineLabel.translatesAutoresizingMaskIntoConstraints = false
        offlineLabel.text = "Offline — reconnect to continue"
        offlineLabel.textAlignment = .center
        offlineLabel.textColor = .white
        offlineLabel.backgroundColor = UIColor.systemOrange.withAlphaComponent(0.96)
        offlineLabel.font = .preferredFont(forTextStyle: .footnote)
        offlineLabel.isHidden = true
        offlineLabel.accessibilityIdentifier = "axiom.offline.banner"
        view.addSubview(offlineLabel)
        NSLayoutConstraint.activate([
            offlineLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            offlineLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            offlineLabel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            offlineLabel.heightAnchor.constraint(greaterThanOrEqualToConstant: 32),
        ])
    }

    private func startNetworkMonitor() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                let isOnline = path.status == .satisfied
                self.offlineLabel.isHidden = isOnline
                if isOnline, self.wasOffline {
                    self.notifyWebApp(event: "online")
                    self.notifyWebApp(event: "focus")
                }
                self.wasOffline = !isOnline
            }
        }
        monitor.start(queue: monitorQueue)
    }

    @objc private func applicationDidBecomeActive() {
        notifyWebApp(event: "focus")
        notifyWebApp(event: "online")
    }

    private func notifyWebApp(event: String) {
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('\(event)'));", completionHandler: nil)
    }

    private func loadAxiom() {
        webView.load(URLRequest(url: origin, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30))
    }

    @objc private func refreshPage(_ sender: UIRefreshControl) {
        webView.reload()
        sender.endRefreshing()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let action = body["action"] as? String else { return }
        if message.name == "axiomAuth", action == "googleSignIn" {
            let callbackPath = body["callbackUrl"] as? String ?? "/"
            startGoogleSignIn(callbackPath: callbackPath)
        } else if message.name == "axiomNative", action == "share" {
            let text = body["text"] as? String ?? "Axiom"
            let url = (body["url"] as? String).flatMap(URL.init(string:))
            var items: [Any] = [text]
            if let url { items.append(url) }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = view
            present(sheet, animated: true)
        }
    }

    private func startGoogleSignIn(callbackPath: String) {
        guard let window = view.window else { return }
        AxiomOAuthCoordinator.shared.start(callbackPath: callbackPath, anchor: window) { [weak self] result in
            DispatchQueue.main.async {
                switch result {
                case .success(let authorization): self?.installWebSession(authorization)
                case .failure(let error): self?.showError("Google sign-in failed: \(error.localizedDescription)")
                }
            }
        }
    }

    private func installWebSession(_ authorization: AxiomOAuthResult) {
        let endpoint = origin.appendingPathComponent("api/mobile/auth/ios/web-session")
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var form = URLComponents()
        form.queryItems = [
            URLQueryItem(name: "code", value: authorization.code),
            URLQueryItem(name: "code_verifier", value: authorization.verifier),
            URLQueryItem(name: "callback_path", value: authorization.callbackPath),
        ]
        request.httpBody = form.percentEncodedQuery?.data(using: .utf8)
        webView.load(request)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if let scheme = url.scheme?.lowercased(), scheme != "http", scheme != "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        if let host = url.host, host != origin.host, navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
        if url.host == origin.host {
            webView.load(navigationAction.request)
        } else {
            UIApplication.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
    }

    private func showError(_ message: String) {
        let alert = UIAlertController(title: "Axiom", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            self?.webView.reload()
        })
        present(alert, animated: true)
    }
}
