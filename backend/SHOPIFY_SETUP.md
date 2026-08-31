# CartnCodForm — Store Setup Guide

## Option 1: Theme Editor (Recommended — No Code!)
1. Shopify Admin → Online Store → Themes
2. Current theme → Customize
3. Left sidebar → App Embeds
4. Find "CartnCodForm Push Notifications"
5. Toggle ON ✅
6. Save

## Option 2: Manual Script (Advanced)
Add before </body> in theme.liquid:
<script src="https://cartncodform-backend.onrender.com/cartncodform-push.js"></script>
