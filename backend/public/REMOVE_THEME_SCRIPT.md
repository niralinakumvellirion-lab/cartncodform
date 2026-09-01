# Remove from theme.liquid
The manual script in theme.liquid is no longer needed.
App Embed block + App Proxy handles everything automatically.

Remove this from theme.liquid:
<script>
(function(){
  if(window.__ccfLoaded) return;
  ...
})();
</script>
