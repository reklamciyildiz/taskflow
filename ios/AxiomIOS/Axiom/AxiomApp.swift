import SwiftUI

@main
struct AxiomApp: App {
    var body: some Scene {
        WindowGroup {
            ZStack {
                Color(red: 15 / 255, green: 23 / 255, blue: 42 / 255)
                    .ignoresSafeArea()
                AxiomWebContainer()
            }
            .onOpenURL { url in
                AxiomOAuthCoordinator.shared.handleCallback(url)
            }
        }
    }
}
