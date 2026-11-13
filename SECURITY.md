# Security

gen2e executes JavaScript that a language model writes, inside the Node process that runs your Playwright tests. The [README](README.md#limits-and-trust) describes the trust model and the checks that apply.

Report a vulnerability through GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). Do not open a public issue. Include the gen2e version, the model and provider, and the smallest page or task that reproduces the problem.

We treat these as vulnerabilities:

- page content that makes gen2e run code outside the `page` API
- a way around the generated-code checks in `run_expression`
- secrets from the environment reaching the model, the cache or telemetry
