# Ride domain and support email setup

This repository does not register a domain or create mailboxes. Those are separate services that must be configured by the owner.

## 1. Choose the public domain

Use a domain that clearly belongs to the Ride brand and that the company can keep long term. Confirm trademark/domain availability before purchase. Do not use a domain connected to a different business or project.

After purchasing it:

- Point DNS to the selected host.
- Enable HTTPS and automatic certificate renewal.
- Set `siteUrl` in `src/lib/site.ts` to the canonical HTTPS URL (choose either `www` or apex and redirect the other).
- Check the site from mobile networks and without being logged in.

## 2. Create and operate the support mailbox

Create a mailbox on the Ride domain with a clear address such as `support@your-real-domain`. The example is a naming pattern, not an actual mailbox.

Before publishing it:

- Confirm inbound mail works from Gmail and non-Gmail addresses.
- Confirm staff can reply and that replies arrive in the sender's inbox.
- Set up SPF, DKIM and DMARC records according to the mail provider's exact instructions.
- Test spam placement, bounces, forwarding, access control and recovery.
- Assign an owner and coverage hours. A public support inbox must be monitored, not merely created.
- Create an internal procedure for urgent safety complaints, payment disputes, driver/merchant issues and data-deletion requests.

Set `supportEmail` in `src/lib/site.ts` to the live mailbox. Set `privacyEmail` to a dedicated monitored privacy mailbox or to the same inbox only if the team has a documented process to route privacy requests.

## 3. Test the contact pathways

- Click every support link on `/`, `/support`, `/privacy` and `/delete-account`.
- Send test messages from at least two external email providers.
- Confirm a team member can acknowledge and action a deletion request.
- Do not ask users to send passwords, OTP codes, full card numbers or identity documents over ordinary email.

## 4. Play Console

Use the monitored support email in Play Console's app contact details. The website is a recommended additional contact channel. Enter the completed privacy-policy URL in the privacy policy field. If users can create Ride accounts, enter the working `/delete-account` URL in the account-deletion web resource field and provide the corresponding in-app deletion path.

A website and an email address do not, by themselves, establish policy compliance. The privacy notice must match actual code, backend and SDK behavior; account deletion must actually process requests.
