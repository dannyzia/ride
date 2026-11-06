<script lang="ts">
  import { site } from '#lib/site';
  import { LEGAL_DOCS, getLegalMeta, getLegalMetaBn, renderLegalDoc, renderLegalDocBn } from '#lib/legal';
  import type { Snippet } from 'svelte';

  interface Props {
    letter: string;
    showIndex?: boolean;
    action?: Snippet;
    actionBn?: Snippet;
    after?: Snippet;
    afterBn?: Snippet;
  }

  let {
    letter,
    showIndex = false,
    action,
    after,
    actionBn,
    afterBn
  }: Props = $props();

  const meta = $derived(getLegalMeta(letter));
  const metaBn = $derived(getLegalMetaBn(letter));
  const html = $derived(renderLegalDoc(letter));
  const htmlBn = $derived(renderLegalDocBn(letter));
</script>

<svelte:head>
  <title>{meta.title} — Ride</title>
  <meta name="description" content={meta.intro} />
  <meta name="robots" content={site.privacyPolicyApproved ? 'index,follow' : 'noindex,nofollow'} />
</svelte:head>

<div class="legal-shell">
  <header class="legal-top"><a class="brand" href="/"><img class="brand-mark-img" src="/logo.png" alt="" width="38" height="38" /><span class="brand-name">Ride<span class="brand-period">.</span></span></a><a class="text-link" href="/">Back to website · ওয়েবসাইটে ফিরুন ↗</a></header>
  <main class="legal-main legal-main-wide">
    <div class="eyebrow"><span class="eyebrow-dot"></span>{meta.eyebrow} · {metaBn.eyebrow}</div>
    <h1>{meta.title}</h1>
    <p class="legal-title-bn">{metaBn.title}</p>
    <p class="legal-intro">{meta.intro}</p>
    <p class="legal-intro legal-intro-bn">{metaBn.intro}</p>
    {#if !site.privacyPolicyApproved}
      <div class="legal-alert"><strong>Working draft v0.1 — not approved, not binding.</strong> This page renders the internal legal working draft dated 5&nbsp;November&nbsp;2026. Every <span class="draft-ph">[BRACKETED]</span> item is an unresolved placeholder. Do not rely on this text until the placeholders are completed and Bangladesh-qualified counsel approves the final version.</div>
      <div class="legal-alert"><strong>কার্যকরী খসড়া v0.1 — অনুমোদিত নয়, বাধ্যতামূলক নয়।</strong> এই পেজে ৫&nbsp;নভেম্বর&nbsp;২০২৬ তারিখের অভ্যন্তরীণ আইনি কার্যকরী খসড়া দেখানো হয়েছে। প্রতিটি <span class="draft-ph">[বন্ধনীযুক্ত]</span> বিষয় অমীমাংসিত স্থানধারক। স্থানধারক পূরণ এবং বাংলাদেশ-যোগ্য আইনজীবীর চূড়ান্ত সংস্করণ অনুমোদন না হওয়া পর্যন্ত এই লেখার ওপর নির্ভর করবেন না। বাংলা পাঠ ইংরেজি খসড়ার অপর্যালোচিত কার্যকরী অনুবাদ।</div>
    {/if}
    {#if action}{@render action()}{/if}
    {#if actionBn}{@render actionBn()}{/if}
    <div class="legal-dual">
      <section class="legal-col" lang="en" aria-label="English">
        <p class="legal-col-tag">English</p>
        <div class="legal-md">{@html html}</div>
      </section>
      <section class="legal-col" lang="bn" aria-label="Bangla">
        <p class="legal-col-tag">বাংলা · খসড়া অনুবাদ (অপর্যালোচিত)</p>
        <div class="legal-md">{@html htmlBn}</div>
      </section>
    </div>
    {#if after}{@render after()}{/if}
    {#if afterBn}{@render afterBn()}{/if}
    {#if showIndex}
      <section class="legal-block">
        <h2>All legal drafts · সব আইনি খসড়া</h2>
        <p>Every document in the review pack. All are working drafts — none is binding until approved. · পর্যালোচনা প্যাকে সব নথি। সবই কার্যকরী খসড়া — অনুমোদিত না হওয়া পর্যন্ত কোনোটিই বাধ্যতামূলক নয়।</p>
        <div class="doc-index">
          {#each LEGAL_DOCS as d (d.letter)}
            {@const bn = getLegalMetaBn(d.letter)}
            <a href={d.route} class:active={d.route === meta.route}><b>{d.title}</b><small>{d.eyebrow}</small><span class="doc-index-bn">{bn.title}</span></a>
          {/each}
        </div>
      </section>
    {/if}
  </main>
  <p class="legal-prelaunch">Pre-launch preview — {site.legalEntity} · Powered by {site.poweredBy} · {site.businessAddress}<br /><span lang="bn">প্রি-লঞ্চ প্রিভিউ — {site.legalEntity} · {site.businessAddress}</span></p>
  <footer class="legal-footer"><span>© {new Date().getFullYear()} Ride</span><span><a href="/terms">Terms · শর্তাবলি</a> · <a href="/privacy">Privacy · প্রাইভেসি</a> · <a href="/delete-account">Delete account · অ্যাকাউন্ট মুছুন</a> · <a href="/support">Support · সাপোর্ট</a></span></footer>
</div>
