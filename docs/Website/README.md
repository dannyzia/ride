# Ride Bangladesh — SvelteKit Website

A SvelteKit + Svelte + TypeScript marketing one-pager for Ride, with supporting privacy, account-deletion and support routes.

## Stack

- SvelteKit 3
- Svelte 5
- TypeScript
- Vite 8
- Adapter Auto

## Requirements

- Node.js 22.17+ (use a current supported Node 22 or newer release)
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite, normally `http://localhost:5173`.

## Validate

```bash
npm run check
npm run build
npm run preview
```

## Before public deployment

1. Open `src/lib/site.ts` and replace the website URL, support email, privacy contact and legal entity placeholders.
2. Set the real Play Store URL only after the app listing exists.
3. Complete `/privacy` from the production app's actual data inventory, backend and third-party SDK review. The current page is a draft, marked `noindex`, and is **not** a Play Console-ready privacy policy.
4. Implement and test the account deletion workflow. The website route must send requests to a monitored destination and the app itself must also provide an in-app deletion path if account creation is available.
5. Set `privacyPolicyApproved` and `deletionWorkflowApproved` to `true` only after the respective checks are complete.
6. Replace the illustrative phone mockup with authentic release-build screenshots if you want to present it as evidence of actual app UI.
7. Review all claims against the services actually live in each launch area. Do not assume 64-district coverage or 24/7 ambulance availability.
8. Configure DNS and HTTPS at your chosen hosting provider. This project does not register a domain or create email accounts.

## Routes

- `/` — landing page with EN / বাংলা switch.
- `/privacy` — structured draft privacy policy; not approved for publication yet.
- `/delete-account` — external deletion request page; requires a working monitored email/workflow.
- `/support` — public support contact page.

## Content for AI coding agents

Read `docs/AI_WEBSITE_CONTENT_BRIEF.md` and `content/Ride_ASO_Master_Asset_Package_Bangladesh.md` before modifying design or copy. The copied ASO Markdown is the project's product/content reference. Section 10 contains important factual gates.

## Important Play Console distinction

Google Play requires an app support email in the store contact details. It recommends a website, but the website is not the mandatory contact field. A privacy policy URL is required, and apps that allow account creation must offer an in-app deletion path and a web resource for deletion requests. See the official references in `docs/PLAY_PRELAUNCH_NOTES.md`.
