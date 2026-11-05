<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('G');
</script>

<LegalDoc
  eyebrow="Rentals policy"
  title="Car rental, intercity, truck & shifting"
  intro="Draft policy for car rental, intercity travel, trucks and household shifting. Working draft — not approved, not binding."
  {html}
  docRoute="/policies/rentals"
/>
