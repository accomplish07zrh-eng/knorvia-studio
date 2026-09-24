# Browser connection

The plugin connects the current execution call to Knorvia's browser SDK. The host owns browser sessions and permissions. JavaScript variables do not persist between calls; bootstrap the client each time and reselect the same verified backend.

Discover connections with `await agent.browsers.list()`. Choose an actual ID, `getDefault()`, or `getForUrl(url)`. A tab error does not justify switching browsers. Methods and capability information are available from `await browser.documentation()`.

The SDK supports host-advertised IAB, extension and CDP connections. Playwright is a tab interface, not another browser. Never start an external automation connection to bypass a missing capability. Return failures and missing permissions to the user.
