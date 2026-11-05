# Google Play pre-launch notes for Ride website

Research date: 5 November 2026.

## What is actually required

- **Support email:** Google's app setup and store-listing guidance requires an app contact email. A website and phone number can be provided as additional contact options; Google recommends a website, but it is not the same as the required support email field.
- **Privacy policy:** Google Play requires a publicly accessible privacy policy linked in Play Console and from within the app. It must describe the actual app and SDK data flows, use a standard webpage (not PDF), and be globally accessible without login or geofencing.
- **Account deletion:** if users can create accounts, provide an in-app account-deletion path and a web resource through which users can request deletion. Deletion must cover associated user data except documented permissible retention. The web page must be discoverable and functional.

## Official references

- Play Console app setup and support email: https://support.google.com/googleplay/android-developer/answer/9859152
- User data / privacy policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Developer Program Policy: https://support.google.com/googleplay/android-developer/answer/18265346

## Ride-specific caution

Ride's source ASO brief lists location, trip, order, payment, identity/verification, merchant and partner workflows. Those are candidates for the data inventory, not a substitute for inspecting the production code and SDKs. Do not publish the current `/privacy` route until the real controller identity, collected data, purposes, recipients, retention and deletion details are completed and reviewed.
