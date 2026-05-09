# Accept no-op compatibility options with warnings

The Runboard Reporter will accept Playwright HTML reporter options that only apply to rendered or served HTML (`open`, `host`, `port`, and `doNotInlineAssets`) as no-op compatibility options, warning once per supplied option instead of rejecting configuration. This preserves config portability for users moving between Playwright's HTML reporter and the Runboard Reporter, while the warning keeps the reporter boundary clear: this package emits a Runboard Data Bundle and does not render, serve, inline, or open HTML.
