import SwiftUI
import WebKit

private struct WebsiteWebView: UIViewRepresentable {
    let url: URL
    @Binding var instance: WKWebView?

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var requestedURL: URL?

        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                webView.load(URLRequest(url: url))
            }
            return nil
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.scrollView.keyboardDismissMode = .interactive
        context.coordinator.requestedURL = url
        view.load(URLRequest(url: url))
        DispatchQueue.main.async { instance = view }
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        guard context.coordinator.requestedURL != url else { return }
        context.coordinator.requestedURL = url
        view.load(URLRequest(url: url))
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading()
        view.navigationDelegate = nil
        view.uiDelegate = nil
    }
}

struct ContentView: View {
    private let communityURL = URL(string: "https://space-42d87.web.app/")!
    @State private var webView: WKWebView?

    var body: some View {
        VStack(spacing: 0) {
            VStack(spacing: 10) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("AIAS BASRA")
                            .font(.caption.weight(.black))
                            .tracking(1.4)
                            .foregroundStyle(Color(red: 0.40, green: 0.12, blue: 0.13))
                        Text("Community")
                            .font(.title3.weight(.bold))
                    }
                    Spacer()
                    Button("Reload") { webView?.reload() }
                        .font(.caption.weight(.bold))
                    Button {
                        UIApplication.shared.open(webView?.url ?? communityURL)
                    } label: {
                        Text("Safari ↗").font(.caption.weight(.bold))
                    }
                }
                .padding(.horizontal, 16)

            }
            .padding(.vertical, 9)
            .background(.background)

            Divider()

            WebsiteWebView(url: communityURL, instance: $webView)
        }
        .background(Color(red: 0.96, green: 0.95, blue: 0.93))
    }
}
