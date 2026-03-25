# Terms of Service

Last updated: 2026-03-25

## 1. Acceptance

By using Review Insights ("the Action") you agree to these Terms of Service. If you do not agree, do not use the Action.

## 2. Description

The Action is a free, open-source GitHub Action that analyzes pull request review activity and generates visual reports. Its source code is available under the [MIT License](LICENSE).

## 3. License

Use of the source code is governed by the MIT License included in this repository. These Terms supplement—but do not replace—the MIT License by covering operational aspects that a software license does not address.

## 4. Data Processing

The Action processes data retrieved from the GitHub API during workflow execution. By using the Action you acknowledge that:

- It fetches pull request metadata, review data, and GitHub usernames from the repositories you specify.
- You are responsible for ensuring you have the necessary rights to access the repository data being analyzed.
- All processing takes place within the GitHub Actions runner. No data is transmitted to external services.

For full details, see the [Privacy Policy](PRIVACY.md).

## 5. Accuracy Disclaimer

Statistical outputs—including Z-scores, Gini coefficients, bias detection flags, and merge correlations—are provided for **informational purposes only**. The Action makes no guarantee as to the accuracy, completeness, or suitability of its results for any particular purpose. You should not base employment, performance-evaluation, or other consequential decisions solely on its output.

## 6. No Warranty

THE ACTION IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. See the MIT License for the complete warranty disclaimer.

## 7. Limitation of Liability

IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM THE USE OF THE ACTION OR ITS OUTPUTS, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE.

## 8. Support

The Action is maintained on a best-effort basis. There is no guaranteed response time, service-level agreement (SLA), or obligation to provide support. Bug reports and feature requests can be filed through GitHub Issues.

## 9. Token and Security

- You are responsible for managing the permissions and scope of any GitHub token you supply to the Action.
- The Action masks the token to prevent log exposure, but it cannot guarantee security beyond the measures described in [SECURITY.md](SECURITY.md).

## 10. Modifications

These Terms may be updated at any time. Changes will be reflected in this file with an updated date. Continued use of the Action after a change constitutes acceptance of the revised Terms.

## 11. Governing Law

These Terms are governed by the MIT License's jurisdictional provisions. For matters the MIT License does not address, the laws of the copyright holder's jurisdiction apply.

## 12. Contact

For questions about these Terms, please open an issue in this repository.
