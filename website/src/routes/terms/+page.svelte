<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('A');
</script>

<LegalDoc
  eyebrow="General terms of use"
  title="Terms of use"
  intro="The general terms for using the Ride website, app and platform services. Working draft — not approved, not binding."
  {html}
  docRoute="/terms"
  showIndex
/>
