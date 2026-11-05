<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('K');
</script>

<LegalDoc
  eyebrow="Legal & data transparency"
  title="Privacy notice"
  intro="Draft privacy notice describing what Ride may process and why. Working draft — completion requires the production data inventory and counsel review."
  {html}
  docRoute="/privacy"
/>
