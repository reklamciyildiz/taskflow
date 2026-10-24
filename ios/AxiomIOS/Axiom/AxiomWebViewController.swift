import Network
import UIKit
import WebKit

final class AxiomWebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private let origin = URL(string: "https://getaxiomm.vercel.app")!
    private let monitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.axiomproductivity.ios.network")
    private var webView: WKWebView!
    private let offlineLabel = UILabel()
    private let connectivityView = UIView()
    private let connectivityStatusLabel = UILabel()
    private let retryButton = UIButton(type: .system)
    private var wasOffline = false
    private var isNetworkAvailable = true
    private var lastFailedRequest: URLRequest?

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
        configureWebView()
        configureOfflineBanner()
        configureConnectivityView()
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
        webView.isOpaque = false
        webView.backgroundColor = view.backgroundColor
        webView.scrollView.backgroundColor = view.backgroundColor
        webView.scrollView.contentInsetAdjustmentBehavior = .automatic
        webView.scrollView.bounces = false
        webView.scrollView.alwaysBounceVertical = false
        webView.scrollView.alwaysBounceHorizontal = false
        webView.scrollView.directionalLockEnabled = true
        webView.scrollView.keyboardDismissMode = .interactive
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

    private func configureConnectivityView() {
        connectivityView.translatesAutoresizingMaskIntoConstraints = false
        connectivityView.backgroundColor = UIColor(red: 15 / 255, green: 23 / 255, blue: 42 / 255, alpha: 1)
        connectivityView.isHidden = true
        connectivityView.accessibilityIdentifier = "axiom.connectivity.error"

        let card = UIView()
        card.translatesAutoresizingMaskIntoConstraints = false
        card.backgroundColor = UIColor(red: 22 / 255, green: 34 / 255, blue: 53 / 255, alpha: 1)
        card.layer.cornerRadius = 24
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor(red: 42 / 255, green: 58 / 255, blue: 81 / 255, alpha: 1).cgColor

        let brandLabel = UILabel()
        brandLabel.text = "✦  Axiom"
        brandLabel.textColor = UIColor(red: 96 / 255, green: 165 / 255, blue: 250 / 255, alpha: 1)
        brandLabel.font = .preferredFont(forTextStyle: .headline)

        let titleLabel = UILabel()
        titleLabel.text = "We can’t reach Axiom"
        titleLabel.textColor = .white
        titleLabel.font = .preferredFont(forTextStyle: .largeTitle)
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.numberOfLines = 0

        let detailLabel = UILabel()
        detailLabel.text = "Your connection or Axiom may be temporarily unavailable. Your account and saved work are unchanged."
        detailLabel.textColor = UIColor(red: 168 / 255, green: 181 / 255, blue: 199 / 255, alpha: 1)
        detailLabel.font = .preferredFont(forTextStyle: .body)
        detailLabel.adjustsFontForContentSizeCategory = true
        detailLabel.numberOfLines = 0

        connectivityStatusLabel.text = "Reconnect, then try again."
        connectivityStatusLabel.textColor = UIColor(red: 168 / 255, green: 181 / 255, blue: 199 / 255, alpha: 1)
        connectivityStatusLabel.font = .preferredFont(forTextStyle: .footnote)
        connectivityStatusLabel.adjustsFontForContentSizeCategory = true
        connectivityStatusLabel.numberOfLines = 0
        connectivityStatusLabel.accessibilityIdentifier = "axiom.connectivity.status"

        retryButton.setTitle("Try again", for: .normal)
        retryButton.setTitleColor(UIColor(red: 7 / 255, green: 17 / 255, blue: 31 / 255, alpha: 1), for: .normal)
        retryButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
        retryButton.backgroundColor = UIColor(red: 96 / 255, green: 165 / 255, blue: 250 / 255, alpha: 1)
        retryButton.layer.cornerRadius = 14
        retryButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 50).isActive = true
        retryButton.addTarget(self, action: #selector(retryConnectivity), for: .touchUpInside)
        retryButton.accessibilityIdentifier = "axiom.connectivity.retry"

        let stack = UIStackView(arrangedSubviews: [brandLabel, titleLabel, detailLabel, connectivityStatusLabel, retryButton])
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.axis = .vertical
        stack.spacing = 16
        stack.setCustomSpacing(28, after: brandLabel)
        stack.setCustomSpacing(10, after: titleLabel)
        stack.setCustomSpacing(18, after: detailLabel)
        stack.setCustomSpacing(18, after: connectivityStatusLabel)
        card.addSubview(stack)
        connectivityView.addSubview(card)
        view.addSubview(connectivityView)

        NSLayoutConstraint.activate([
            connectivityView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            connectivityView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            connectivityView.topAnchor.constraint(equalTo: view.topAnchor),
            connectivityView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            card.leadingAnchor.constraint(equalTo: connectivityView.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            card.trailingAnchor.constraint(equalTo: connectivityView.safeAreaLayoutGuide.trailingAnchor, constant: -24),
            card.centerYAnchor.constraint(equalTo: connectivityView.safeAreaLayoutGuide.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 28),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -28),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 28),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -28),
        ])
    }

    private func startNetworkMonitor() {
        monitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                guard let self else { return }
                let isOnline = path.status == .satisfied
                self.isNetworkAvailable = isOnline
                self.offlineLabel.isHidden = isOnline
                if isOnline, self.wasOffline {
                    self.notifyWebApp(event: "online")
                    self.notifyWebApp(event: "focus")
                    if !self.connectivityView.isHidden {
                        self.connectivityStatusLabel.text = "A connection is available. Try again when you’re ready."
                    }
                } else if !isOnline, !self.connectivityView.isHidden {
                    self.connectivityStatusLabel.text = "Your device appears to be offline."
                }
                self.wasOffline = !isOnline
            }
        }
        monitor.start(queue: monitorQueue)
    }

    @objc private func applicationDidBecomeActive() {
        notifyWebApp(event: "focus")
        if isNetworkAvailable {
            notifyWebApp(event: "online")
        }
    }

    private func notifyWebApp(event: String) {
        webView?.evaluateJavaScript("window.dispatchEvent(new Event('\(event)'));", completionHandler: nil)
    }

    private func loadAxiom() {
        let request = URLRequest(url: origin, cachePolicy: .useProtocolCachePolicy, timeoutInterval: 30)
        lastFailedRequest = request
        webView.load(request)
    }

    @objc private func retryConnectivity() {
        retryButton.isEnabled = false
        connectivityStatusLabel.text = "Checking the connection…"
        let request = lastFailedRequest
            ?? webView.url.map { URLRequest(url: $0, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 30) }
            ?? URLRequest(url: origin, cachePolicy: .reloadRevalidatingCacheData, timeoutInterval: 30)
        webView.load(request)
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
        lastFailedRequest = nil
        connectivityView.isHidden = true
        retryButton.isEnabled = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(error, request: webView.url.map { URLRequest(url: $0) })
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(error, request: webView.url.map { URLRequest(url: $0) })
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        lastFailedRequest = webView.url.map { URLRequest(url: $0) }
        showConnectivityError(message: "Axiom needs to reload after being paused by iOS.")
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        if navigationResponse.isForMainFrame,
           let response = navigationResponse.response as? HTTPURLResponse,
           (500...599).contains(response.statusCode) {
            lastFailedRequest = response.url.map { URLRequest(url: $0) }
            showConnectivityError(message: "Axiom is temporarily unavailable. Try again shortly.")
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    private func handleNavigationFailure(_ error: Error, request: URLRequest?) {
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled { return }
        guard isConnectivityFailure(nsError) else {
            showError("Axiom could not open this page: \(nsError.localizedDescription)")
            return
        }
        let failingURL = nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL
        lastFailedRequest = failingURL.map { URLRequest(url: $0) } ?? request ?? lastFailedRequest
        let message = isNetworkAvailable
            ? "Axiom could not be reached. The server or connection may be temporarily unavailable."
            : "Your device appears to be offline. Reconnect, then try again."
        showConnectivityError(message: message)
    }

    private func isConnectivityFailure(_ error: NSError) -> Bool {
        guard error.domain == NSURLErrorDomain else { return false }
        return [
            NSURLErrorTimedOut,
            NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost,
            NSURLErrorNetworkConnectionLost,
            NSURLErrorDNSLookupFailed,
            NSURLErrorNotConnectedToInternet,
            NSURLErrorInternationalRoamingOff,
            NSURLErrorCallIsActive,
            NSURLErrorDataNotAllowed,
            NSURLErrorResourceUnavailable,
        ].contains(error.code)
    }

    private func showConnectivityError(message: String) {
        connectivityStatusLabel.text = message
        retryButton.isEnabled = true
        connectivityView.isHidden = false
        view.bringSubviewToFront(connectivityView)
        UIAccessibility.post(notification: .screenChanged, argument: connectivityStatusLabel)
    }

    private func showError(_ message: String) {
        let alert = UIAlertController(title: "Axiom", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak self] _ in
            self?.webView.reload()
        })
        present(alert, animated: true)
    }
}
