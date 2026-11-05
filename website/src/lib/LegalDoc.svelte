<script lang="ts">
  import { site } from '#lib/site';
  import { LEGAL_DOCS } from '#lib/legal';
  import type { Snippet } from 'svelte';

  interface Props {
    eyebrow: string;
    title: string;
    intro: string;
    html: string;
    docRoute: string;
    showIndex?: boolean;
    action?: Snippet;
    after?: Snippet;
  }

  let {
    eyebrow,
    title,
    intro,
    html,
    docRoute,
    showIndex = false,
    action,
    after
  }: Props = $props();
</script>

<svelte:head>
  <title>{title} — Ride</title>
  <meta name="description" content={intro} />
  <meta name="robots" content={site.privacyPolicyApproved ? "index,follow" : "noindex,nofollow"} />
</svelte:head>

<div class="legal-shell">
  <header class="legal-top"><a class="brand" href="/"><img class="brand-mark-img" src="/logo.png" alt="" width="38" height="38" /><span class="brand-name">Ride<span class="brand-period">.</span></span></a><a class="text-link" href="/">Back to website ↗</a></header>
  <main class="legal-main">
    <div class="eyebrow"><span class="eyebrow-dot"></span>{eyebrow}</div>
    <h1>{title}</h1>
    <p class="legal-intro">{intro}</p>
    {#if !site.privacyPolicyApproved}
      <div class="legal-alert"><strong>Working draft v0.1 — not approved, not binding.</strong> This page renders the internal legal working draft dated 5&nbsp;November&nbsp;2026. Every <span class="draft-ph">[BRACKETED]</span> item is an unresolved placeholder. Do not rely on this text until the placeholders are completed and Bangladesh-qualified counsel approves the final version.</div>
    {/if}
    {#if action}{@render action()}{/if}
    <div class="legal-md">{@html html}</div>
    {#if after}{@render after()}{/if}
    {#if showIndex}
      <section class="legal-block">
        <h2>All legal drafts</h2>
        <p>Every document in the review pack. All are working drafts — none is binding until approved.</p>
        <div class="doc-index">
          {#each LEGAL_DOCS as d}
            <a href={d.route} class:active={d.route === docRoute}><b>{d.title}</b><small>{d.eyebrow}</small></a>
          {/each}
        </div>
      </section>
    {/if}
  </main>
  <p class="legal-prelaunch">Pre-launch preview — {site.legalEntity} · Powered by {site.poweredBy} · {site.businessAddress}</p>
  <footer class="legal-footer"><span>© {new Date().getFullYear()} Ride</span><span><a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/delete-account">Delete account</a> · <a href="/support">Support</a></span></footer>
</div>
