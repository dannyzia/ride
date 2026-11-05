<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('J');
</script>

<LegalDoc
  eyebrow="Safety standards"
  title="Safety & community standards"
  intro="Draft safety and community standards for customers, partners and merchants. Working draft — not approved, not binding."
  {html}
  docRoute="/safety"
/>
