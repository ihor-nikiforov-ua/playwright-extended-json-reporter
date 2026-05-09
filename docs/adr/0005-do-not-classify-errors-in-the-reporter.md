# Do not classify errors in the reporter

The Runboard Reporter will preserve Playwright's HTML Report Data for all 45 Error Types but will not add `errorType` classification fields. Error Classification is Runboard or analytics behavior, where matching rules can evolve independently from the current-run data producer; the reporter test suite still requires Error Catalog Coverage to prove those shapes survive serialization. The reporter may add Structured Error Evidence as a namespaced Runboard Extension so the Runboard can render and classify errors without relying only on formatted strings.
