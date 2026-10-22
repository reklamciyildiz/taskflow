import SwiftUI

struct AxiomWebContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> AxiomWebViewController {
        AxiomWebViewController()
    }

    func updateUIViewController(_ uiViewController: AxiomWebViewController, context: Context) {}
}
