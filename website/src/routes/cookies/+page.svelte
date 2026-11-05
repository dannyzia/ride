<script lang="ts">
  import LegalDoc from '#lib/LegalDoc.svelte';
  import { renderLegalDoc } from '#lib/legal';

  const html = renderLegalDoc('M');
</script>

<LegalDoc
  eyebrow="Website transparency"
  title="Cookie notice"
  intro="Draft website cookie notice. Working draft — completion requires a production cookie inventory."
  {html}
  docRoute="/cookies"
/>
