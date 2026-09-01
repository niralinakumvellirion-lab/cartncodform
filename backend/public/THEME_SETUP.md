# Add CartnCodForm to Your Shopify Theme

## Step 1: Go to Shopify Admin
cartncod-form.myshopify.com/admin

## Step 2: Edit theme.liquid
Online Store → Themes → Current theme → ••• → Edit code
→ Layout folder → theme.liquid

## Step 3: Find </body> tag
Use Ctrl+F to search for: </body>

## Step 4: Add this code BEFORE </body>
Copy and paste exactly:

<script>
(function() {
  var s = document.createElement('script');
  s.src = 'https://cartncodform-backend.onrender.com/cartncodform-push.js';
  s.async = true;
  document.head.appendChild(s);
})();
</script>

## Step 5: Save
