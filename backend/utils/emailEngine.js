// backend/utils/emailEngine.js
// Dependency-free email layout engine — ES5 style so the file can be copied
// verbatim into the browser in Phase E3.  No require/import inside.
//
// Ported from .shopify/design/email-studio-prototype.html <script id="core">
// Production changes over the prototype:
//   - Image URLs: http:// upgraded to https://, data: / other schemes dropped.
//   - CTA button omitted when ctaUrl is missing or not https/mailto.
//   - Coupon layout: offer fills whole ticket when there is no CTA.
//   - Unsubscribe href: design.unsubscribeUrl, default mailto:unsubscribe@shopireachboost.com.
//   - Logo: showLogo + https logoUrl shows <img>, else store name text.
//   - Placeholder box only when design.placeholder === true.
//   - body is plain text: escaped then newlines -> <br>. Callers must NOT pre-HTML.
//   - All dynamic strings escaped.

// ── colour helpers (ported verbatim from prototype) ──────────────────────────

function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function hex2rgb(h){h=String(h).replace('#','');if(h.length===3)h=h.split('').map(function(c){return c+c;}).join('');var n=parseInt(h,16);return [(n>>16)&255,(n>>8)&255,n&255];}
function rgb2hex(r,g,b){return '#'+[r,g,b].map(function(v){return Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0');}).join('');}
function mix(a,b,t){var x=hex2rgb(a),y=hex2rgb(b);return rgb2hex(x[0]+(y[0]-x[0])*t,x[1]+(y[1]-x[1])*t,x[2]+(y[2]-x[2])*t);}
function lum(h){var a=hex2rgb(h).map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];}
function cr(a,b){var x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
function soften(ink,bg,minC){var t=[0.4,0.3,0.2,0.1,0];for(var i=0;i<t.length;i++){var col=mix(ink,bg,t[i]);if(cr(col,bg)>=minC)return col;}return ink;}
function onColour(bg){return cr('#ffffff',bg)>=cr('#1a1a1a',bg)?'#ffffff':'#1a1a1a';}
function rgba(h,a){var x=hex2rgb(h);return 'rgba('+x[0]+','+x[1]+','+x[2]+','+a+')';}

// ── font registry ─────────────────────────────────────────────────────────────
// g:'safe' renders everywhere; g:'rich' shows in Apple Mail, fallback in others.
// hw=heading weight, ls=letter-spacing, sz=body size, sc=headline scale,
// lh=headline line-height, head=heading-only face.
// gf = Google Fonts family string for rich fonts (used in renderEmailDocument).

var FONTS={
  arial:     {n:'Modern sans',     g:'safe',st:"'Helvetica Neue',Helvetica,Arial,sans-serif",hw:800,ls:'-.02em',sz:15},
  georgia:   {n:'Classic serif',   g:'safe',st:"Georgia,'Times New Roman',serif",hw:700,ls:'-.01em',sz:15},
  trebuchet: {n:'Friendly',        g:'safe',st:"'Trebuchet MS','Lucida Grande',Verdana,sans-serif",hw:800,ls:'-.01em',sz:15},
  verdana:   {n:'Wide and clear',  g:'safe',st:"Verdana,Geneva,sans-serif",hw:700,ls:'-.02em',sz:14,sc:.92},
  tahoma:    {n:'Compact',         g:'safe',st:"Tahoma,Geneva,sans-serif",hw:700,ls:'-.01em',sz:15},
  times:     {n:'Newsroom',        g:'safe',st:"'Times New Roman',Times,serif",hw:700,ls:'-.01em',sz:16,sc:1.08},
  palatino:  {n:'Bookish',         g:'safe',st:"'Palatino Linotype','Book Antiqua',Palatino,serif",hw:700,ls:'-.01em',sz:15},
  courier:   {n:'Typewriter',      g:'safe',st:"'Courier New',Courier,monospace",hw:700,ls:'-.03em',sz:14,sc:.88},
  impact:    {n:'Tall and loud',   g:'safe',st:"Impact,'Arial Narrow Bold',Haettenschweiler,sans-serif",hw:400,ls:'.01em',sz:15,sc:1.1,head:true},
  arialblack:{n:'Heavy',           g:'safe',st:"'Arial Black','Arial Bold',Gadget,sans-serif",hw:900,ls:'-.02em',sz:15,sc:.92,head:true},
  playfair:  {n:'Playfair Display',g:'rich',gf:'Playfair+Display:wght@400;800',st:"'Playfair Display',Georgia,serif",hw:800,ls:'-.01em',sz:15},
  cormorant: {n:'Cormorant Garamond',g:'rich',gf:'Cormorant+Garamond:wght@400;700',st:"'Cormorant Garamond',Garamond,Georgia,serif",hw:700,ls:'-.01em',sz:17,sc:1.18},
  dmserif:   {n:'DM Serif Display',g:'rich',gf:'DM+Serif+Display',st:"'DM Serif Display',Georgia,serif",hw:400,ls:'-.01em',sz:15,head:true},
  abril:     {n:'Abril Fatface',   g:'rich',gf:'Abril+Fatface',st:"'Abril Fatface',Georgia,serif",hw:400,ls:'0',sz:15,sc:.96,head:true},
  lora:      {n:'Lora',            g:'rich',gf:'Lora:wght@400;700',st:"'Lora',Georgia,serif",hw:700,ls:'-.01em',sz:15},
  montserrat:{n:'Montserrat',      g:'rich',gf:'Montserrat:wght@400;800',st:"'Montserrat','Helvetica Neue',Arial,sans-serif",hw:800,ls:'-.02em',sz:14.5,sc:.94},
  poppins:   {n:'Poppins',         g:'rich',gf:'Poppins:wght@400;700',st:"'Poppins','Helvetica Neue',Arial,sans-serif",hw:700,ls:'-.015em',sz:14.5,sc:.94},
  raleway:   {n:'Raleway',         g:'rich',gf:'Raleway:wght@400;800',st:"'Raleway','Helvetica Neue',Arial,sans-serif",hw:800,ls:'-.01em',sz:15},
  josefin:   {n:'Josefin Sans',    g:'rich',gf:'Josefin+Sans:wght@400;700',st:"'Josefin Sans','Trebuchet MS',sans-serif",hw:700,ls:'0',sz:16,sc:1.06},
  nunito:    {n:'Nunito',          g:'rich',gf:'Nunito:wght@400;800',st:"'Nunito','Trebuchet MS',sans-serif",hw:800,ls:'-.01em',sz:15.5},
  oswald:    {n:'Oswald',          g:'rich',gf:'Oswald:wght@400;600',st:"'Oswald','Arial Narrow',Impact,sans-serif",hw:600,ls:'.01em',sz:15,sc:1.1,head:true},
  bebas:     {n:'Bebas Neue',      g:'rich',gf:'Bebas+Neue',st:"'Bebas Neue',Impact,'Arial Narrow',sans-serif",hw:400,ls:'.03em',sz:15,sc:1.22,head:true},
  pacifico:  {n:'Pacifico',        g:'rich',gf:'Pacifico',st:"'Pacifico','Brush Script MT',cursive",hw:400,ls:'0',sz:15,sc:.9,lh:1.3,head:true},
  dancing:   {n:'Dancing Script',  g:'rich',gf:'Dancing+Script:wght@400;700',st:"'Dancing Script','Brush Script MT',cursive",hw:700,ls:'0',sz:15,sc:1.2,lh:1.2,head:true}
};

var FONT_ORDER=['arial','georgia','trebuchet','verdana','tahoma','times','palatino','courier','impact','arialblack','playfair','cormorant','dmserif','abril','lora','montserrat','poppins','raleway','josefin','nunito','oswald','bebas','pacifico','dancing'];

// ── layout registry ───────────────────────────────────────────────────────────

var LAYOUT_INFO=[
  {k:'hero',      n:'Hero',        d:'Big photo first',          w:1200,h:800},
  {k:'poster',    n:'Poster',      d:'Giant offer',              w:1200,h:800},
  {k:'spotlight', n:'Spotlight',   d:'Dark and premium',         w:1200,h:1200},
  {k:'split',     n:'Split screen',d:'Photo and colour halves',  w:1000,h:1250},
  {k:'gallery',   n:'Gallery',     d:'Framed print',             w:1200,h:1200},
  {k:'coupon',    n:'Coupon',      d:'Offer ticket',             w:1200,h:800},
  {k:'magazine',  n:'Magazine',    d:'Editorial, left aligned',  w:1200,h:800},
  {k:'float',     n:'Float',       d:'Photo over colour',        w:1000,h:1000},
  {k:'cards',     n:'Cards',       d:'Stacked cards',            w:1200,h:800},
  {k:'pop',       n:'Pop',         d:'Bold and playful',         w:1200,h:1200},
  {k:'letter',    n:'Letter',      d:'Quiet and personal',       w:1200,h:800}
];

function layoutInfo(k){for(var i=0;i<LAYOUT_INFO.length;i++)if(LAYOUT_INFO[i].k===k)return LAYOUT_INFO[i];return LAYOUT_INFO[0];}

function bgDefaults(L,c){
  if(L==='spotlight')return {page:mix(c,'#000000',0.95),card:mix(c,'#000000',0.86)};
  if(L==='gallery')return {page:'#ece4d6',card:'#faf6f0'};
  if(L==='cards')return {page:mix(c,'#ffffff',0.88),card:'#ffffff'};
  if(L==='pop')return {page:mix(c,'#ffffff',0.78),card:'#ffffff'};
  if(L==='letter')return {page:'#f4f1ec',card:'#ffffff'};
  return {page:'#f2f2f4',card:'#ffffff'};
}

// ── presets ───────────────────────────────────────────────────────────────────

var PRESETS={
  festive:{name:'Festive',layout:'poster',color:'#c2185b',hFont:'montserrat',bFont:'arial',radius:'round',
    subject:'Dance in colours: 15% off for 3 days',eyebrow:'Navratri Special',headline:'Dance in colours this Navratri',offer:'15% OFF',
    body:'Nine nights, nine colours, and a collection made to move with you.\n\nThis week only, take 15% off our festive edit. Your perfect chaniya choli is one tap away.',
    cta:'Shop the festive edit',note:'Offer valid for 3 days only'},
  sale:{name:'Flash sale',layout:'pop',color:'#e11d48',hFont:'bebas',bFont:'arial',radius:'sharp',
    subject:'24 hours only: 30% off the bestsellers',eyebrow:'24-hour flash sale',headline:'Everything you have been eyeing, now less.',offer:'30% OFF',
    body:'Our biggest sale of the season starts now. Fresh arrivals, bestsellers and last-chance picks are all marked down for the next 24 hours.',
    cta:'Grab the deals',note:'Ends tonight at midnight'},
  elegant:{name:'Elegant',layout:'spotlight',color:'#0f766e',hFont:'playfair',bFont:'lora',radius:'round',
    subject:'The autumn collection has arrived',eyebrow:'The Autumn Collection',headline:'Crafted slowly. Worn forever.',offer:'Free gift wrap',
    body:'Each piece is woven by hand and finished with care. Explore the new collection and find something made to be kept.',
    cta:'Explore the collection',note:'Limited pieces available'},
  fresh:{name:'Fresh',layout:'split',color:'#4f46e5',hFont:'poppins',bFont:'nunito',radius:'round',
    subject:'We saved something for you',eyebrow:'Just for you',headline:'Your next favourite is waiting',offer:'10% OFF',
    body:'We noticed you looking, so here is a little something to make it easier. Come back and treat yourself.',
    cta:'Take me there',note:'Your code applies automatically'},
  classic:{name:'Classic',layout:'gallery',color:'#9a3412',hFont:'cormorant',bFont:'georgia',radius:'sharp',
    subject:'A quiet note from our studio',eyebrow:'New season',headline:'Made by hand, kept for years',offer:'Free shipping',
    body:'Every piece is made in small batches by the people who care most about it. Come and see what is new this season.',
    cta:'View the collection',note:'Small batches, limited stock'}
};

// ── theme computation ─────────────────────────────────────────────────────────
// Extracted from build() so callers can inspect colours without rendering HTML.

function themeFor(design){
  var c=design.color||'#4f46e5',L=design.layout||'hero';
  var def=bgDefaults(L,c);
  var pageBg=design.pageBg||def.page,cardBg=design.cardBg||def.card;
  var dark=cr('#ffffff',cardBg)>cr('#1a1a1a',cardBg);
  var ink=dark?'#ffffff':'#1a1a1a',sub=soften(ink,cardBg,7),mut=soften(ink,cardBg,4.5);
  var tint=mix(cardBg,c,dark?0.16:0.07),soft=mix(cardBg,c,dark?0.28:0.16),mid=mix(cardBg,c,0.45);
  var need=dark?4.5:3,ex=dark?'#ffffff':'#000000',acc=ink;
  var cands=[c,mix(c,ex,0.35),mix(c,ex,0.55),mix(c,ex,0.75),ink];
  for(var ai=0;ai<cands.length;ai++){if(cr(cands[ai],cardBg)>=need&&cr(cands[ai],tint)>=need){acc=cands[ai];break;}}
  var onC=onColour(c),onA=onColour(acc);
  var deep=ink,dc=dark?[mix(acc,'#ffffff',0.35),mix(acc,'#ffffff',0.6),'#ffffff']:[mix(c,'#000000',0.4),mix(c,'#000000',0.6),mix(c,'#000000',0.8),'#000000'];
  for(var di=0;di<dc.length;di++){if(cr(dc[di],cardBg)>=4.5&&cr(dc[di],tint)>=4.5&&cr(dc[di],soft)>=4.5){deep=dc[di];break;}}
  var hair=dark?'rgba(255,255,255,.16)':'rgba(0,0,0,.09)';
  var footBg=dark?mix(cardBg,'#000000',0.3):mix(cardBg,'#000000',0.035);
  return {dark:dark,ink:ink,sub:sub,mut:mut,acc:acc,onC:onC,onA:onA,tint:tint,soft:soft,mid:mid,deep:deep,hair:hair,footBg:footBg,pageBg:pageBg,cardBg:cardBg};
}

// ── layout builder ─────────────────────────────────────────────────────────────
// Returns {css, body} — a fragment (no DOCTYPE).  Production differences are
// marked with "// PROD:" comments.

function build(s){
  var theme=themeFor(s);
  var dark=theme.dark,ink=theme.ink,sub=theme.sub,mut=theme.mut,acc=theme.acc,onC=theme.onC,onA=theme.onA;
  var tint=theme.tint,soft=theme.soft,mid=theme.mid,deep=theme.deep,hair=theme.hair,footBg=theme.footBg;
  var pageBg=theme.pageBg,cardBg=theme.cardBg;
  var c=s.color||'#4f46e5',L=s.layout||'hero';
  var pageDark=cr('#ffffff',pageBg)>cr('#1a1a1a',pageBg);

  // PROD: sanitise image URL — upgrade http, drop data:/javascript:/other.
  var rawImg=s.image;
  var img=null;
  if(rawImg){
    var rs=String(rawImg);
    if(rs.indexOf('http://')===0)img='https://'+rs.slice(7);
    else if(rs.indexOf('https://')===0)img=rs;
    // data:, javascript:, relative, etc. → null
  }
  // PROD: placeholder box only when design.placeholder === true (never sent).
  var hasPhoto=!!(img||(s.placeholder===true));

  // PROD: validate CTA URL (https:// or mailto: only).
  var safeCtaUrl=null;
  if(s.ctaUrl){var cu=String(s.ctaUrl);if(/^https:\/\//i.test(cu)||/^mailto:/i.test(cu))safeCtaUrl=cu;}
  // PROD: unsubscribe URL default.
  var unsubUrl=esc(s.unsubscribeUrl||'mailto:unsubscribe@shopireachboost.com');

  // PROD: logo — show only when showLogo is true AND logoUrl is https.
  var safeLogoUrl=null;
  if(s.showLogo&&s.logoUrl&&/^https:\/\//i.test(String(s.logoUrl)))safeLogoUrl=String(s.logoUrl);

  var FH=FONTS[s.hFont]||FONTS.arial,FB=FONTS[s.bFont]||FONTS.arial;
  var R=s.radius==='round'?16:0,BR=s.radius==='round'?10:0;
  var store=esc(s.store),eb=esc(s.eyebrow),head=esc(s.headline),offer=esc(s.offer),note=esc(s.note);
  // PROD: CTA must have both a valid URL and a non-empty label.
  var cta=esc(s.cta);
  var hasCta=!!(safeCtaUrl&&cta);
  // PROD: body is plain text — escape it, then convert newlines to <br>.
  var body=esc(s.body).replace(/\r?\n/g,'<br>');

  var ratio=(s.imgW&&s.imgH)?s.imgH/s.imgW:null;
  var info=layoutInfo(L),phRatio=info.h/info.w;

  // Photo sizing: never cropped; pick largest that fits while keeping shape.
  function fit(maxW,maxH){var r=ratio||phRatio;var w=Math.min(maxW,Math.round(maxH/r));return {w:w,h:Math.round(w*r)};}
  function hs(px){return Math.round(px*(FH.sc||1));}
  function HF(px,x){return 'font:'+FH.hw+' '+hs(px)+'px/'+(FH.lh||1.15)+' '+FH.st+';letter-spacing:'+FH.ls+';'+(x||'');}
  function BF(w,px,lh){return 'font:'+w+' '+px+'px/'+(lh||1.5)+' '+FB.st+';';}

  // PROD: placeholder only when design.placeholder === true.
  function PH(b){
    var small=b.w<320;
    var ic='<svg width="'+(small?26:34)+'" height="'+(small?26:34)+'" viewBox="0 0 24 24" fill="none" stroke="'+acc+'" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 8px;opacity:.85"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="1.8"/><path d="m21 15-4.5-4.5L8 19"/></svg>';
    return '<div style="width:100%;aspect-ratio:'+b.w+'/'+b.h+';background:'+tint+';border:2px dashed '+mid+';display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-sizing:border-box;padding:10px">'+ic
      +'<div style="'+BF(700,small?12:13,1.3)+'color:'+deep+'">Your offer photo appears here</div>'
      +'<div style="'+BF(700,small?12:14,1.3)+'color:'+acc+';margin-top:6px">Recommended '+info.w+' \xd7 '+info.h+' px</div>'
      +'<div style="'+BF(400,small?11:12,1.4)+'color:'+deep+';opacity:.75;margin-top:4px">Any shape fits. Never cropped.<br>Preview only, not sent.</div></div>';
  }
  // PROD: img always has width + height attributes and style height:auto.
  // The outer div uses max-width (fluid), never a fixed-width div inside a table cell.
  function PIC(b,left){
    var inner=img?'<img src="'+esc(img)+'" width="'+b.w+'" height="'+b.h+'" alt="" style="display:block;width:100%;height:auto;border:0">':PH(b);
    return '<div style="max-width:'+b.w+'px;margin:'+(left?'0':'0 auto')+'">'+inner+'</div>';
  }
  function MAT(b,pad,x){pad=pad||8;return '<div style="width:100%;max-width:'+(b.w+pad*2)+'px;margin:0 auto;box-sizing:border-box;background:#fff;padding:'+pad+'px;border-radius:'+(BR+2)+'px;box-shadow:0 10px 28px rgba(0,0,0,.14);'+(x||'')+'">'+PIC(b)+'</div>';}
  function WIDE(){
    var b=fit(600,520);
    if(b.w>=600)return '<tr><td style="padding:0;line-height:0">'+PIC(b)+'</td></tr>';
    return '<tr><td align="center" bgcolor="'+tint+'" style="background:'+tint+';padding:28px 20px;line-height:0">'+MAT(b,8)+'</td></tr>';
  }
  function P(t,x){return '<p style="margin:0 0 14px;'+BF(400,FB.sz,1.65)+'color:'+sub+';'+(x||'')+'">'+t+'</p>';}
  // PROD: hasCta check; href = safeCtaUrl (not "#").
  function BTN(bg,fg,t,left,full){
    if(!hasCta)return '';
    return '<table role="presentation" class="btn" cellpadding="0" cellspacing="0" '+(full?'width="100%" ':'')+'style="margin:'+(left?'0':'0 auto')+(full?';width:100%':'')+'"><tr><td align="center" bgcolor="'+bg+'" style="background:'+bg+';border-radius:'+BR+'px"><a href="'+esc(safeCtaUrl)+'" style="display:'+(full?'block':'inline-block')+';padding:'+(full?'15px 14px':'16px 40px')+';'+BF(700,full?14:15,full?1.2:1)+'color:'+fg+';text-decoration:none;letter-spacing:.03em">'+t+'</a></td></tr></table>';
  }
  function BTNO(col,t,left){
    if(!hasCta)return '';
    return '<table role="presentation" class="btn" cellpadding="0" cellspacing="0" style="margin:'+(left?'0':'0 auto')+'"><tr><td align="center" style="border:2px solid '+col+';border-radius:'+BR+'px"><a href="'+esc(safeCtaUrl)+'" style="display:inline-block;padding:14px 34px;'+BF(700,13,1)+'color:'+col+';text-decoration:none;letter-spacing:.14em;text-transform:uppercase">'+t+'</a></td></tr></table>';
  }
  // PROD: unsubscribe href = unsubUrl (not "#").
  function FOOT(bg,inkc,mutc){bg=bg||footBg;inkc=inkc||ink;mutc=mutc||mut;return '<tr><td align="center" bgcolor="'+bg+'" style="background:'+bg+';padding:24px 32px;border-top:1px solid '+hair+'"><p style="margin:0 0 6px;'+BF(700,13,1.3)+'color:'+inkc+'">'+store+'</p><p style="margin:0 0 8px;'+BF(400,11.5,1.5)+'color:'+mutc+'">You received this email because you subscribed to updates from '+store+'.</p><a href="'+unsubUrl+'" style="'+BF(400,11.5,1.3)+'color:'+mutc+';text-decoration:underline">Unsubscribe</a></td></tr>';}
  function NOTE(col){return note?'<tr><td class="px" align="center" style="padding:2px 40px 34px"><span style="'+BF(400,12.5,1.4)+'color:'+(col||mut)+'">'+note+'</span></td></tr>':'<tr><td style="height:28px;font-size:0;line-height:0">&nbsp;</td></tr>';}
  function RULE(col){return '<div style="height:1px;background:'+col+';font-size:0;line-height:0">&nbsp;</div>';}
  var dash='<span style="display:inline-block;width:20px;height:2px;background:'+acc+';vertical-align:middle;margin:0 10px"></span>';

  // PROD: logo helper — shows <img> when showLogo+logoUrl valid, else returns textInner.
  // Logo img: max-height 36px, alt = store name, always has width+height attributes.
  function LOGO(textInner){
    if(safeLogoUrl)return '<img src="'+esc(safeLogoUrl)+'" alt="'+store+'" width="180" height="36" style="display:block;max-height:36px;height:auto;border:0;">';
    return textInner;
  }

  var rows='',wrapBg=cardBg,wrapR=R,wrapX='',extraCss='';

  if(L==='hero'){
    rows+='<tr><td align="center" bgcolor="'+c+'" style="background:'+c+';padding:18px 28px">'
      +LOGO('<span style="'+BF(800,14,1.2)+'color:'+onC+';letter-spacing:.22em;text-transform:uppercase">'+store+'</span>')+'</td></tr>';
    if(hasPhoto)rows+=WIDE();
    if(eb)rows+='<tr><td align="center" bgcolor="'+tint+'" style="background:'+tint+';padding:13px 24px;border-bottom:1px solid '+soft+'"><span style="'+BF(800,12,1.2)+'color:'+deep+';letter-spacing:.16em;text-transform:uppercase">'+dash+eb+dash+'</span></td></tr>';
    rows+='<tr><td class="px" align="center" style="padding:36px 40px 8px"><h1 class="h1" style="margin:0 0 6px;'+HF(32,'color:'+ink)+'">'+head+'</h1>'+(offer?'<div class="bigH" style="margin:16px 0 4px;'+HF(56,'color:'+acc+';line-height:1')+'">'+offer+'</div>':'')+'</td></tr>';
    rows+='<tr><td class="px" align="center" style="padding:8px 40px 4px">'+P(body,'text-align:center')+'</td></tr>';
    if(hasCta)rows+='<tr><td class="px" align="center" style="padding:10px 40px 16px">'+BTN(acc,onA,cta)+'</td></tr>';
    rows+=NOTE()+FOOT();
  }
  else if(L==='poster'){
    var size=offer.length<=7?88:(offer.length<=12?60:44),cls=offer.length<=7?'bigA':(offer.length<=12?'bigB':'bigC');
    rows+='<tr><td class="px" align="center" bgcolor="'+c+'" style="background:'+c+';padding:30px 36px 38px">'
      +'<div style="'+BF(800,12,1.2)+'color:'+onC+';letter-spacing:.24em;text-transform:uppercase;margin-bottom:18px">'
      +LOGO(store)+'</div>'
      +(eb?'<div style="display:inline-block;border:1.5px solid '+onC+';color:'+onC+';padding:7px 16px;border-radius:'+(s.radius==='round'?999:0)+'px;'+BF(800,11.5,1)+'letter-spacing:.16em;text-transform:uppercase;margin-bottom:20px">'+eb+'</div>':'')
      +(offer?'<div class="'+cls+'" style="'+HF(size,'color:'+onC+';line-height:.95;letter-spacing:-.03em;margin:4px 0 14px')+'">'+offer+'</div>':'')
      +'<h1 class="h1" style="margin:0 0 24px;font:'+(FH.hw>600?600:FH.hw)+' '+hs(22)+'px/1.3 '+FH.st+';color:'+onC+'">'+head+'</h1>'
      +BTN(onC,c,cta)+'</td></tr>';
    if(hasPhoto)rows+=WIDE();
    rows+='<tr><td class="px" align="center" style="padding:30px 40px 6px">'+P(body,'text-align:center')+'</td></tr>';
    rows+=NOTE()+FOOT();
  }
  else if(L==='spotlight'){
    var sb=fit(420,440),frameBg=dark?mix(cardBg,'#000000',0.35):tint,offS=offer.length<=7?64:(offer.length<=12?48:38);
    rows+='<tr><td class="px" align="center" style="padding:34px 40px 0">'
      +'<div style="'+BF(700,12,1.2)+'color:'+(dark?mix(acc,'#ffffff',0.45):deep)+';letter-spacing:.32em;text-transform:uppercase">'
      +LOGO(store)+'</div>'
      +(eb?'<div style="display:inline-block;margin-top:18px;border:1px solid '+acc+';color:'+acc+';padding:7px 16px;border-radius:'+(s.radius==='round'?999:0)+'px;'+BF(800,11,1)+'letter-spacing:.18em;text-transform:uppercase">'+eb+'</div>':'')+'</td></tr>';
    rows+='<tr><td class="px" align="center" style="padding:22px 44px 0"><h1 class="h1" style="margin:0;'+HF(34,'color:'+ink)+'">'+head+'</h1></td></tr>';
    if(hasPhoto)rows+='<tr><td class="px" align="center" style="padding:28px 40px 0"><div style="width:100%;max-width:'+(sb.w+22)+'px;margin:0 auto;box-sizing:border-box;padding:10px;background:'+frameBg+';border:2px solid '+acc+';border-radius:'+(BR+4)+'px;box-shadow:0 0 48px '+rgba(acc,0.32)+'">'+PIC(sb)+'</div></td></tr>';
    rows+='<tr><td class="px" align="center" style="padding:26px 40px 0">'+(offer?'<div class="bigS" style="'+HF(offS,'color:'+acc+';line-height:1;margin:0 0 14px')+'">'+offer+'</div>':'')+P(body,'text-align:center;margin-bottom:6px')+'</td></tr>';
    if(hasCta)rows+='<tr><td class="px" align="center" style="padding:14px 40px 18px">'+BTN(acc,onA,cta)+'</td></tr>';
    rows+=NOTE()+FOOT();
  }
  else if(L==='split'){
    var pb=fit(260,420);
    var cap=(eb&&hasPhoto)?'<div style="padding-top:14px;'+BF(800,11,1.2)+'color:'+deep+';letter-spacing:.18em;text-transform:uppercase;text-align:center">'+eb+'</div>':'';
    var left=hasPhoto?'<td class="col" width="320" valign="middle" align="center" bgcolor="'+tint+'" style="width:320px;background:'+tint+';padding:30px 20px">'+MAT(pb,10)+cap+'</td>':'';
    var right='<td class="col" '+(hasPhoto?'width="280" ':'')+'valign="middle" bgcolor="'+c+'" style="'+(hasPhoto?'width:280px;':'')+'background:'+c+';padding:34px 30px">'
      +'<div style="'+BF(800,11,1.2)+'color:'+onC+';opacity:.85;letter-spacing:.22em;text-transform:uppercase;margin-bottom:16px">'+store+'</div>'
      +(offer?'<div class="bigW" style="'+HF(46,'color:'+onC+';line-height:1;letter-spacing:-.03em;margin:0 0 12px')+'">'+offer+'</div>':'')
      +'<h1 class="h1" style="margin:0 0 22px;font:'+(FH.hw>600?600:FH.hw)+' '+hs(21)+'px/1.25 '+FH.st+';color:'+onC+'">'+head+'</h1>'
      +BTN(onC,c,cta,true,true)+'</td>';
    rows+='<tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'+left+right+'</tr></table></td></tr>';
    rows+='<tr><td class="px" align="center" style="padding:30px 40px 6px">'+P(body,'text-align:center')+'</td></tr>';
    rows+=NOTE()+FOOT();
  }
  else if(L==='gallery'){
    var gb=fit(440,460);
    rows+='<tr><td class="px" align="center" style="padding:34px 40px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="34%" valign="middle">'+RULE(hair)+'</td>'
      +'<td class="nw" align="center" style="white-space:nowrap;padding:0 14px;'+BF(400,12,1.2)+'color:'+mut+';letter-spacing:.32em;text-transform:uppercase">'
      +LOGO(store)+'</td>'
      +'<td width="34%" valign="middle">'+RULE(hair)+'</td></tr></table></td></tr>';
    rows+='<tr><td class="px" align="center" style="padding:26px 48px 0">'+(eb?'<div style="font:italic 400 17px '+FH.st+';color:'+acc+';margin-bottom:10px">'+eb+'</div>':'')+'<h1 class="h1" style="margin:0;'+HF(36,'color:'+ink)+'">'+head+'</h1></td></tr>';
    if(hasPhoto)rows+='<tr><td class="px" align="center" style="padding:28px 48px 0">'+MAT(gb,14,'border:1px solid '+hair)
      +'<div style="width:100%;max-width:'+(gb.w+28)+'px;margin:12px auto 0;box-sizing:border-box;border-top:1px solid '+hair+';padding-top:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="left" style="'+BF(700,11,1.2)+'color:'+mut+';letter-spacing:.16em;text-transform:uppercase">'+(eb||store)+'</td><td align="right" style="'+HF(18,'color:'+acc)+'">'+offer+'</td></tr></table></div></td></tr>';
    rows+='<tr><td class="px" align="center" style="padding:26px 52px 4px">'+P(body,'text-align:center;font-size:'+(FB.sz+1)+'px;line-height:1.8')+'</td></tr>';
    if(hasCta)rows+='<tr><td class="px" align="center" style="padding:6px 48px 18px">'+BTNO(acc,cta)+'</td></tr>';
    rows+=NOTE()+FOOT();
  }
  else if(L==='coupon'){
    rows+='<tr><td class="px" bgcolor="'+c+'" style="background:'+c+';padding:15px 28px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
      +'<td style="'+BF(800,13,1.2)+'color:'+onC+';letter-spacing:.2em;text-transform:uppercase">'
      +LOGO(store)+'</td>'
      +'<td align="right" style="'+BF(700,11,1.2)+'color:'+onC+';letter-spacing:.14em;text-transform:uppercase">'+eb+'</td></tr></table></td></tr>';
    if(hasPhoto)rows+=WIDE();
    rows+='<tr><td class="px" align="center" style="padding:30px 44px 0"><h1 class="h1" style="margin:0 0 12px;'+HF(28,'color:'+ink)+'">'+head+'</h1>'+P(body,'text-align:center;margin-bottom:6px')+'</td></tr>';
    var offerCol=(offer?'<div style="'+BF(800,10.5,1.2)+'color:'+deep+';letter-spacing:.22em;text-transform:uppercase;margin-bottom:6px">Your offer</div><div class="bigW" style="'+HF(46,'color:'+acc+';line-height:1;letter-spacing:-.03em')+'">'+offer+'</div>':'');
    // PROD: when no CTA, offer fills the whole ticket (no second column).
    var ticket;
    if(hasCta){
      ticket='<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        +'<td class="tk" valign="middle" align="center" style="padding:20px 24px">'+offerCol+'</td>'
        +'<td class="tk tk2" width="210" valign="middle" align="center" style="width:210px;padding:20px 24px;border-left:2px dashed '+acc+'">'+BTN(acc,onA,cta,false,true)+'</td></tr></table>';
      extraCss='.tk{display:block!important;width:100%!important;box-sizing:border-box}.tk2{border-left:0!important;border-top:2px dashed '+acc+'!important}';
    }else{
      ticket='<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
        +'<td class="tk" valign="middle" align="center" style="padding:20px 24px;width:100%">'+offerCol+'</td></tr></table>';
    }
    rows+='<tr><td class="px" style="padding:22px 40px 6px"><div style="border:2px dashed '+acc+';border-radius:'+(BR+6)+'px;background:'+tint+'">'+ticket+'</div></td></tr>';
    rows+=NOTE()+FOOT();
  }
  else if(L==='magazine'){
    var mb=fit(520,460);
    rows+='<tr><td class="px" style="padding:30px 40px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>'
      +'<td style="'+HF(24,'color:'+ink+';text-transform:uppercase;letter-spacing:.02em')+'">'
      +LOGO(store)+'</td>'
      +'<td align="right" style="'+BF(800,11,1.2)+'color:'+acc+';letter-spacing:.18em;text-transform:uppercase">'+eb+'</td></tr></table>'
      +'<div style="height:3px;background:'+ink+';margin-top:14px;font-size:0;line-height:0">&nbsp;</div>'
      +'<div style="height:1px;background:'+ink+';margin-top:3px;font-size:0;line-height:0">&nbsp;</div></td></tr>';
    rows+='<tr><td class="px" style="padding:26px 40px 0"><h1 class="h1" style="margin:0 0 14px;'+HF(42,'color:'+ink+';line-height:1.04;letter-spacing:-.03em')+'">'+head+'</h1>'+P(body,'font-size:'+(FB.sz+1)+'px;margin-bottom:0')+'</td></tr>';
    if(hasPhoto)rows+='<tr><td class="px" style="padding:24px 40px 0">'+PIC(mb,true)+'<div style="padding-top:8px;'+BF(400,12,1.4)+'font-style:italic;color:'+mut+'">'+(eb||store)+'</div></td></tr>';
    if(offer)rows+='<tr><td class="px" style="padding:22px 40px 0"><div style="border-left:4px solid '+acc+';padding:2px 0 2px 16px"><div class="bigM" style="'+HF(36,'color:'+acc+';line-height:1.05')+'">'+offer+'</div>'+(note?'<div style="margin-top:6px;'+BF(400,12.5,1.4)+'color:'+mut+'">'+note+'</div>':'')+'</div></td></tr>';
    else if(note)rows+='<tr><td class="px" style="padding:16px 40px 0"><span style="'+BF(400,12.5,1.4)+'color:'+mut+'">'+note+'</span></td></tr>';
    if(hasCta)rows+='<tr><td class="px" style="padding:24px 40px 34px">'+BTN(acc,onA,cta,true)+'</td></tr>';
    rows+=FOOT();
  }
  else if(L==='float'){
    var fb=fit(440,400);
    rows+='<tr><td class="px" align="center" bgcolor="'+c+'" style="background:'+c+';padding:34px 40px 24px">'
      +'<div style="'+BF(800,12,1.2)+'color:'+onC+';letter-spacing:.26em;text-transform:uppercase;margin-bottom:16px">'+store+'</div>'
      +(eb?'<div style="display:inline-block;border:1.5px solid '+onC+';color:'+onC+';padding:6px 14px;border-radius:'+(s.radius==='round'?999:0)+'px;'+BF(800,11,1)+'letter-spacing:.16em;text-transform:uppercase;margin-bottom:16px">'+eb+'</div>':'')
      +'<h1 class="h1" style="margin:0;'+HF(32,'color:'+onC)+'">'+head+'</h1></td></tr>';
    if(hasPhoto)rows+='<tr><td class="px" align="center" bgcolor="'+c+'" style="background:'+c+';background-image:linear-gradient(180deg,'+c+' 0%,'+c+' 50%,'+cardBg+' 50%,'+cardBg+' 100%);padding:0 40px">'+MAT(fb,10)+'</td></tr>';
    rows+='<tr><td class="px" align="center" style="padding:28px 40px 0">'+(offer?'<div class="bigH" style="'+HF(52,'color:'+acc+';line-height:1;margin:0 0 14px')+'">'+offer+'</div>':'')+P(body,'text-align:center;margin-bottom:6px')+'</td></tr>';
    if(hasCta)rows+='<tr><td class="px" align="center" style="padding:14px 40px 16px">'+BTN(acc,onA,cta)+'</td></tr>';
    rows+=NOTE()+FOOT();
  }
  else if(L==='cards'){
    var kb2=fit(520,440),pageMut=soften(pageDark?'#ffffff':'#1a1a1a',pageBg,4.5);
    wrapBg='transparent';wrapR=0;
    var CARD=function(bg,inner,pad){return '<tr><td style="padding:0 0 12px"><div style="background:'+bg+';border-radius:'+R+'px;padding:'+pad+'">'+inner+'</div></td></tr>';};
    rows+=CARD(c,'<div style="text-align:center"><div style="'+BF(800,12,1.2)+'color:'+onC+';letter-spacing:.24em;text-transform:uppercase;margin-bottom:14px">'+store+'</div>'
      +(eb?'<div style="display:inline-block;border:1.5px solid '+onC+';color:'+onC+';padding:6px 14px;border-radius:'+(s.radius==='round'?999:0)+'px;'+BF(800,11,1)+'letter-spacing:.16em;text-transform:uppercase;margin-bottom:14px">'+eb+'</div>':'')
      +'<h1 class="h1" style="margin:0;'+HF(30,'color:'+onC)+'">'+head+'</h1>'
      +(offer?'<div class="bigH" style="'+HF(52,'color:'+onC+';line-height:1;margin:14px 0 0')+'">'+offer+'</div>':'')+'</div>','32px 28px');
    if(hasPhoto)rows+=CARD(cardBg,PIC(kb2),'14px');
    rows+=CARD(cardBg,'<div style="text-align:center">'+P(body,'text-align:center')+BTN(acc,onA,cta)+(note?'<div style="margin-top:14px;'+BF(400,12.5,1.4)+'color:'+mut+'">'+note+'</div>':'')+'</div>','28px 28px 30px');
    // PROD: unsubscribe href = unsubUrl (not "#").
    rows+='<tr><td align="center" style="padding:6px 20px 10px"><p style="margin:0 0 6px;'+BF(700,12.5,1.3)+'color:'+pageMut+'">'+store+'</p><a href="'+unsubUrl+'" style="'+BF(400,11.5,1.3)+'color:'+pageMut+';text-decoration:underline">Unsubscribe</a></td></tr>';
  }
  else if(L==='pop'){
    var edge=dark?'#ffffff':'#111111',pp=fit(480,440);
    wrapX='border:3px solid '+edge+';box-shadow:8px 8px 0 '+edge+';';wrapR=BR;
    var lab=(eb||'Special offer'),tick=store+' \xa0•\xa0 '+lab+' \xa0•\xa0 '+store+' \xa0•\xa0 '+lab;
    rows+='<tr><td align="center" bgcolor="'+edge+'" style="background:'+edge+';padding:10px 16px"><div class="tick" style="'+BF(800,11,1.2)+'color:'+cardBg+';letter-spacing:.2em;text-transform:uppercase;white-space:nowrap;overflow:hidden">'+tick+'</div></td></tr>';
    rows+='<tr><td class="px" style="padding:30px 36px 0"><h1 class="h1" style="margin:0;'+HF(40,'color:'+ink+';text-transform:uppercase;line-height:1.18')+'"><span style="background:'+acc+';color:'+onA+';padding:2px 10px">'+head+'</span></h1></td></tr>';
    if(hasPhoto)rows+='<tr><td class="px" align="center" style="padding:28px 36px 0"><div style="width:100%;max-width:'+(pp.w+18)+'px;margin:0 auto;box-sizing:border-box;background:#fff;border:3px solid '+edge+';padding:6px;box-shadow:6px 6px 0 '+acc+'">'+PIC(pp)+'</div></td></tr>';
    if(offer)rows+='<tr><td class="px" style="padding:28px 36px 0"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="'+acc+'" style="background:'+acc+';border:3px solid '+edge+';padding:10px 18px;box-shadow:4px 4px 0 '+edge+'"><span class="bigP" style="'+HF(34,'color:'+onA+';text-transform:uppercase;line-height:1')+'">'+offer+'</span></td></tr></table></td></tr>';
    rows+='<tr><td class="px" style="padding:22px 36px 0">'+P(body,'margin-bottom:0')+'</td></tr>';
    if(hasCta)rows+='<tr><td class="px" style="padding:22px 36px 8px"><table role="presentation" class="btn" cellpadding="0" cellspacing="0"><tr><td bgcolor="'+edge+'" style="background:'+edge+';box-shadow:5px 5px 0 '+acc+'"><a href="'+esc(safeCtaUrl)+'" style="display:inline-block;padding:16px 34px;'+BF(800,15,1)+'color:'+cardBg+';text-decoration:none;letter-spacing:.06em;text-transform:uppercase">'+cta+' →</a></td></tr></table></td></tr>';
    rows+=NOTE()+FOOT(cardBg);
  }
  else{ /* letter */
    var lb=fit(480,380);
    rows+='<tr><td class="px" style="padding:36px 48px 0">'
      +LOGO('<span style="'+BF(800,12,1.2)+'color:'+ink+';letter-spacing:.24em;text-transform:uppercase">'+store+'</span>')
      +'<div style="height:2px;width:36px;background:'+acc+';margin-top:12px;font-size:0;line-height:0">&nbsp;</div></td></tr>';
    rows+='<tr><td class="px" style="padding:26px 48px 0"><h1 class="h1" style="margin:0 0 16px;'+HF(28,'color:'+ink)+'">'+head+'</h1>'+P(body,'font-size:'+(FB.sz+1)+'px;line-height:1.75;margin-bottom:0')+'</td></tr>';
    if(hasPhoto)rows+='<tr><td class="px" style="padding:22px 48px 0"><div style="width:100%;max-width:'+(lb.w+14)+'px;box-sizing:border-box;border:1px solid '+hair+';padding:6px;background:#fff">'+PIC(lb,true)+'</div><div style="padding-top:8px;'+BF(400,12,1.4)+'font-style:italic;color:'+mut+'">'+(eb||store)+'</div></td></tr>';
    if(offer)rows+='<tr><td class="px" style="padding:20px 48px 0"><p style="margin:0;font:italic 400 '+hs(22)+'px/1.35 '+FH.st+';color:'+acc+'">— '+offer+(note?'. '+note:'')+'</p></td></tr>';
    else if(note)rows+='<tr><td class="px" style="padding:16px 48px 0"><span style="'+BF(400,12.5,1.4)+'color:'+mut+'">'+note+'</span></td></tr>';
    if(hasCta)rows+='<tr><td class="px" style="padding:22px 48px 0">'+BTNO(acc,cta,true)+'</td></tr>';
    rows+='<tr><td class="px" style="padding:26px 48px 36px"><p style="margin:0;'+BF(400,FB.sz,1.6)+'color:'+sub+'">Warmly,<br><b>'+store+'</b></p></td></tr>';
    rows+=FOOT();
  }

  var css='body{margin:0;padding:0;-webkit-text-size-adjust:100%}table{border-collapse:collapse}img{-ms-interpolation-mode:bicubic}'
   +'@media (max-width:480px){.px{padding-left:22px!important;padding-right:22px!important}.pad{padding:10px 6px!important}.wrap{width:100%!important}'
   +'.h1{font-size:25px!important}.bigA{font-size:62px!important}.bigB{font-size:46px!important}.bigC{font-size:36px!important}.bigH{font-size:44px!important}.bigW{font-size:40px!important}.bigS{font-size:46px!important}.bigM{font-size:30px!important}.bigP{font-size:28px!important}'
   +'.col{display:block!important;width:100%!important}.tick{white-space:normal!important;line-height:1.5!important}.nw{white-space:normal!important}'+extraCss+'.btn{width:100%!important}.btn a{display:block!important;padding:16px 20px!important}}';

  var html='<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="'+pageBg+'" style="background:'+pageBg+'"><tr><td class="pad" align="center" style="padding:24px 12px">'
   +'<table class="wrap" role="presentation" width="600" cellpadding="0" cellspacing="0"'+(wrapBg==='transparent'?'':' bgcolor="'+cardBg+'"')+' style="width:600px;max-width:100%;background:'+wrapBg+';border-radius:'+wrapR+'px;'+(wrapR?'overflow:hidden;':'')+wrapX+'">'+rows+'</table></td></tr></table>';
  return {css:css,body:html};
}

// ── public API ────────────────────────────────────────────────────────────────

// renderEmail(design) → { css, body }
// Renders a fragment (no DOCTYPE) for use in a preview iframe.
function renderEmail(design){
  return build(design);
}

// renderEmailDocument(design, opts) → full HTML string ready to send.
// Adds DOCTYPE, <html lang="en">, <head> with charset/viewport/<title>,
// Google Fonts <link> for rich fonts actually used, <body> with pageBg, and
// a hidden preheader div.
function renderEmailDocument(design, opts){
  var out=build(design);
  var theme=themeFor(design);
  var FH=FONTS[design.hFont]||FONTS.arial,FB=FONTS[design.bFont]||FONTS.arial;

  // Google Fonts only for rich fonts (safe fonts need none).
  var gfParts=[];
  if(FH.g==='rich'&&FH.gf)gfParts.push('family='+FH.gf);
  if(FB.g==='rich'&&FB.gf&&FB.gf!==FH.gf)gfParts.push('family='+FB.gf);
  var fontLink=gfParts.length?'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'+gfParts.join('&')+'&display=swap">\n':'';

  // Preheader: explicit or first ~100 chars of plain body.
  var rawBody=String(design.body||'');
  var preheaderText=design.preheader||rawBody.replace(/<[^>]*>/g,'').slice(0,100).trim();

  return '<!DOCTYPE html>\n'
    +'<html lang="en">\n'
    +'<head>\n'
    +'<meta charset="utf-8">\n'
    +'<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    +'<title>'+esc(design.subject||'')+'</title>\n'
    +fontLink
    +'<style>'+out.css+'</style>\n'
    +'</head>\n'
    +'<body style="margin:0;padding:0;background:'+theme.pageBg+'">\n'
    +(preheaderText?'<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">'+esc(preheaderText)+'</div>\n':'')
    +out.body
    +'\n</body>\n</html>';
}

// ── guarded export ─────────────────────────────────────────────────────────────
if(typeof module!=='undefined'&&module.exports){
  module.exports={
    esc:esc,hex2rgb:hex2rgb,rgb2hex:rgb2hex,mix:mix,lum:lum,cr:cr,
    soften:soften,onColour:onColour,rgba:rgba,
    FONTS:FONTS,FONT_ORDER:FONT_ORDER,LAYOUT_INFO:LAYOUT_INFO,
    layoutInfo:layoutInfo,bgDefaults:bgDefaults,PRESETS:PRESETS,
    themeFor:themeFor,renderEmail:renderEmail,renderEmailDocument:renderEmailDocument
  };
}
