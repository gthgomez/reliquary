# Security Policy — Reliquary

## Project status: proprietary, not open source

Reliquary is proprietary software. The source is published for source visibility and transparency only. The repository [LICENSE](LICENSE) is a proprietary license notice; the [README](README.md) adds that GitHub's Terms provide only limited platform rights for accessing and using GitHub repository features, and that outside those rights no general right is granted to copy, modify, distribute, commercialize, or create derivative products.

Because no permission to use the code has been granted, a defect in it is not a "vulnerability" in the open-source sense. It is a question about unauthorized use of unlicensed software, and that question belongs to the owner of the code, not to a public disclosure process. This file exists so the boundary is stated plainly instead of left to inference.

## What this repository does not offer

- **No security support.** The maintainer does not triage, investigate, or remediate security reports for Reliquary.
- **No coordinated disclosure program.** There is no embargo, no safe harbor, and no private disclosure window.
- **No bug bounty.** No reward is offered.
- **No response-time commitment.** There is no SLA and no support window.
- **No supported versions.** No release is a supported security-fix channel.

## Relationship to the existing security notes

This file is the security *boundary* document. It is intentionally separate from **[docs/SECURITY.md](docs/SECURITY.md)**, which is a repository audit record rather than a disclosure policy.

The two are consistent and complementary. [docs/SECURITY.md](docs/SECURITY.md) records what a scan actually observed: a credential sweep of the current tree and full available history found no active credential (explicitly described as an OBSERVED scan, not a guarantee); `.env*`, key files, logs, build output, and `.grok/` are ignored; `npm run build` does not connect to or mutate a database, with migration explicit in `npm run deploy`; and the preview bridge validates message source, exact allowlisted origin, schema, version, and same-origin path before navigation. It also names a concrete unresolved operational risk: the server middleware accepts forwarded host/proto values for the preview platform, and the deployment/proxy contract must sanitize those headers before they reach the app.

Read both files. Neither promises a fix, a response, or a supported release.

## Asset provenance

[docs/ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md) is a working provenance manifest and explicitly not a legal clearance. It records raw asset masters removed from the public repository and purged from history — roughly 29 MB, now held in private storage and regenerated from private source art — because serving them publicly undermined both the license and the manifest itself. It also records unresolved entries flagged rather than deleted.

A provenance question is usually a **rights** question before it is a security question. Report suspected unlicensed third-party assets to the repository owner rather than to any external project.

## Reporting a genuine concern

If you believe you have found a genuine security concern, the honest position is that the maintainer has not accepted a support obligation, so there is no guaranteed response. If you choose to raise it anyway:

- Prefer GitHub's private vulnerability reporting for this repository (the **Security** tab → **Report a vulnerability**), if it is available to you.
- Otherwise contact the repository owner through their public profile at <https://github.com/gthgomez>.
- Treat any newly discovered credential as compromised: it should be removed from the tree, rotated at the provider, and reviewed across the full history before any public push. Do not paste the credential value into a report.
- You receive no service commitment, no bounty, and no assurance of a fix.

## Visibility is not permission

The repository being public creates no support obligation. Publishing source does not grant a license, does not create a support contract, and does not make the maintainer a vendor to you. Opening an issue or submitting a pull request grants you no rights and creates no partnership; contributions are not accepted for reuse, and no license is granted over anything you send here.
