import AuthenticationServices
import CryptoKit
import Security
import UIKit

struct AxiomOAuthResult {
    let code: String
    let verifier: String
    let callbackPath: String
}

final class AxiomOAuthCoordinator: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = AxiomOAuthCoordinator()

    private var session: ASWebAuthenticationSession?
    private var anchor: ASPresentationAnchor?
    private var expectedState: String?
    private var verifier: String?
    private var callbackPath = "/"
    private var completion: ((Result<AxiomOAuthResult, Error>) -> Void)?

    func start(
        callbackPath: String,
        anchor: ASPresentationAnchor,
        completion: @escaping (Result<AxiomOAuthResult, Error>) -> Void
    ) {
        let verifier = Self.randomURLSafe(count: 64)
        let state = Self.randomURLSafe(count: 48)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64URLEncodedString()
        var components = URLComponents(string: "https://www.actiproc.com/api/mobile/auth/google/start")!
        // Fallback/legacy compatibility: https://getaxiomm.vercel.app
        components.queryItems = [
            URLQueryItem(name: "platform", value: "ios"),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "state", value: state),
        ]

        self.anchor = anchor
        self.expectedState = state
        self.verifier = verifier
        self.callbackPath = Self.safeCallbackPath(callbackPath)
        self.completion = completion
        let callback = ASWebAuthenticationSession.Callback.https(
            host: "www.actiproc.com",
            path: "/mobile/auth/callback"
        )
        let session = ASWebAuthenticationSession(
            url: components.url!,
            callback: callback
        ) { [weak self] callbackURL, error in
            if let callbackURL {
                self?.handleCallback(callbackURL)
            } else if let error {
                self?.finish(.failure(error))
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        self.session = session
        session.start()
    }

    func handleCallback(_ url: URL) {
        guard url.scheme == "https",
              (url.host == "www.actiproc.com" || url.host == "actiproc.com" || url.host == "getaxiomm.vercel.app"),
              url.path == "/mobile/auth/callback",
              let values = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let state = values.first(where: { $0.name == "state" })?.value,
              state == expectedState,
              let code = values.first(where: { $0.name == "code" })?.value,
              let verifier else {
            finish(.failure(AxiomOAuthError.invalidCallback))
            return
        }
        finish(.success(AxiomOAuthResult(code: code, verifier: verifier, callbackPath: callbackPath)))
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor ?? ASPresentationAnchor()
    }

    private func finish(_ result: Result<AxiomOAuthResult, Error>) {
        let completion = completion
        session?.cancel()
        session = nil
        anchor = nil
        expectedState = nil
        verifier = nil
        self.completion = nil
        completion?(result)
    }

    private static func safeCallbackPath(_ value: String) -> String {
        value.hasPrefix("/") && !value.hasPrefix("//") ? value : "/"
    }

    private static func randomURLSafe(count: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        precondition(status == errSecSuccess)
        return Data(bytes).base64URLEncodedString()
    }
}

enum AxiomOAuthError: LocalizedError {
    case invalidCallback

    var errorDescription: String? {
        switch self {
        case .invalidCallback:
            return "The authentication session completed with an invalid callback URL or state."
        }
    }
}
