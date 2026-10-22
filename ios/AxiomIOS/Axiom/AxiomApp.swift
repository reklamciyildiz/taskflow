import SwiftUI

@main
struct AxiomApp: App {
    var body: some Scene {
        WindowGroup {
            AxiomWebContainer()
                .ignoresSafeArea(.keyboard)
                .onOpenURL { url in
                    AxiomOAuthCoordinator.shared.handleCallback(url)
                }
        }
    }
}
