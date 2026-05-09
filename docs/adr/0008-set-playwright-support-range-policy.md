# Set the Playwright support range policy

The first Playwright Support Range for the Runboard Reporter is `@playwright/test >=1.59 <2`; older Playwright `1.40+` error wording research is fixture-design input, not a compatibility promise. We allow normal Playwright minor updates inside the range only as long as Compatibility Fixtures continue to prove HTML Report Data parity, because the reporter intentionally follows Playwright's serialized HTML report shape without claiming untested historical behavior.
