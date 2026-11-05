<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('C');
</script>

<LegalDoc
  eyebrow="Partner terms"
  title="Driver & service partner terms"
  intro="Draft terms for drivers, couriers and service partners, including call packages, verification and deactivation. Working draft — not approved, not binding."
  {html}
  docRoute="/terms/partners"
/>
