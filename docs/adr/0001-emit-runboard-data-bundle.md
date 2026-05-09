# Emit a Runboard data bundle, not a rendered report

The Runboard Reporter will emit the Runboard Data Contract as standalone data files, closely following Playwright's HTML Report Data, rather than generating an `index.html` report or embedding the data bundle into a Playwright-style base64 ZIP template. The Runboard owns rendering and historical comparison, while this package owns producing current-run data and Attachment Assets in a form Runboard can ingest directly.
