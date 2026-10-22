# Legacy Capacitor prototype

This directory is no longer part of Axiom's active Android or iOS product
build. Android is delivered from `twa-diagnostic/`, while the minimum iOS shell
lives in `ios/AxiomIOS/` and renders the production PWA.

The prototype remains temporarily in Git so its Android Keystore/session work
can be audited or recovered. Root package scripts and Tailwind scanning no
longer depend on it. Do not extend its Vite UI.

The orphaned `scripts/test-mobile-shared-workspace-contract.mjs` only validates
this archived prototype and is not invoked by the root test/build pipeline. It
can be removed together with this directory in a separately approved cleanup
after the production TWA and iOS shell retention period.
