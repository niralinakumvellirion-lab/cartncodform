import { useState, useMemo } from "react";
import {
  Home, Users, Radio, MessageSquare, BarChart3, Package, Settings as SettingsIcon,
  Sparkles, Bell, Mail, Check, ChevronRight, ArrowLeft, Eye, ShoppingCart,
  Search, Clock, TrendingUp, TrendingDown, Zap, Phone, MapPin, Send, X, Info,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/* ---------- Polaris-flavoured tokens ---------- */
const T = {
  pageBg: "#F1F1F1",
  card: "#FFFFFF",
  border: "#E3E3E3",
  text: "#303030",
  sub: "#616161",
  faint: "#8A8A8A",
  primary: "#303030",
  magicBg: "#F3F0FF",
  magicBorder: "#D9CFFF",
  magicText: "#4A2FBF",
  successBg: "#CDFEE1", successText: "#0C5132",
  warnBg: "#FFEBCD", warnText: "#5E4200",
  critBg: "#FED1D7", critText: "#8E1F0B",
  infoBg: "#E0F0FF", infoText: "#00527C",
  neutralBg: "#EBEBEB", neutralText: "#4A4A4A",
  font: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

/* ---------- Sample data: a Surat saree store ---------- */
const PRODUCTS = [
  { id: "p1", name: "Banarasi Silk Saree — Maroon Zari", price: 2899, coll: "Silk", views: 412, uniq: 288, dwell: 58, scroll: 47, cartRate: 0.11, exit: "Price block", stock: 6 },
  { id: "p2", name: "Kanjivaram Pure Silk — Peacock Blue", price: 4499, coll: "Silk", views: 305, uniq: 214, dwell: 71, scroll: 62, cartRate: 0.09, exit: "Size chart", stock: 2 },
  { id: "p3", name: "Bandhani Georgette — Sunset Orange", price: 1299, coll: "Festive", views: 288, uniq: 231, dwell: 34, scroll: 78, cartRate: 0.19, exit: "Reviews", stock: 14 },
  { id: "p4", name: "Patola Double Ikat — Emerald", price: 6999, coll: "Silk", views: 190, uniq: 141, dwell: 84, scroll: 41, cartRate: 0.05, exit: "Price block", stock: 3 },
  { id: "p5", name: "Chanderi Cotton — Ivory & Gold", price: 1799, coll: "Daily", views: 176, uniq: 152, dwell: 29, scroll: 83, cartRate: 0.22, exit: "Added to cart", stock: 21 },
  { id: "p6", name: "Paithani Silk — Magenta", price: 3599, coll: "Festive", views: 154, uniq: 118, dwell: 63, scroll: 55, cartRate: 0.10, exit: "Price block", stock: 0 },
];

const P = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

const SIGNAL_DEFS = [
  { id: "cart_abandon", name: "Cart left behind", desc: "Added to cart, no checkout within 60 min.", urgency: "now", conv: 0.078, base: 9 },
  { id: "checkout_abandon", name: "Checkout left behind", desc: "Reached checkout, no order within 60 min.", urgency: "now", conv: 0.124, base: 4 },
  { id: "browse_abandon", name: "Looked, didn't add", desc: "Viewed a product, nothing added within 30 min.", urgency: "soon", conv: 0.031, base: 7 },
  { id: "high_intent", name: "Keeps coming back", desc: "Same product viewed 3+ times in 7 days, never carted.", urgency: "soon", conv: 0.092, base: 5 },
  { id: "price_hesitation", name: "Stopped at the price", desc: "40s+ on page, scroll stalled around the price, no add to cart.", urgency: "soon", conv: 0.067, base: 6 },
  { id: "price_drop", name: "Price dropped on a saved item", desc: "A product they viewed got cheaper.", urgency: "now", conv: 0.148, base: 3 },
  { id: "back_in_stock", name: "Back in stock", desc: "A product they viewed is available again.", urgency: "now", conv: 0.171, base: 2 },
  { id: "post_purchase_d3", name: "Three days after buying", desc: "Care tips and a thank-you, no selling.", urgency: "later", conv: 0.0, base: 4 },
  { id: "lapsing", name: "Going quiet", desc: "A buyer who hasn't visited in 21 days.", urgency: "later", conv: 0.044, base: 5 },
  { id: "winback", name: "Been a while", desc: "A buyer who hasn't visited in 60 days.", urgency: "later", conv: 0.027, base: 3 },
  { id: "email_capture", name: "Ask for an email", desc: "Push-only visitor at a high-value moment.", urgency: "later", conv: 0.0, base: 6 },
  { id: "cod_to_prepaid", name: "Offer prepaid on COD", desc: "COD order from someone who has paid online before.", urgency: "now", conv: 0.21, base: 2 },
];

const CUSTOMERS = [
  {
    id: "c1", name: "Priya Shah", anon: false, stage: "buyer", push: true, email: "priya.s@gmail.com", phone: "+91 98••• ••412",
    ltv: 4198, orders: 2, lastSeen: "2h ago", lastMsg: "Yesterday, 7:40pm", city: "Ahmedabad",
    interests: [["p1", 0.91], ["p6", 0.62], ["p2", 0.38]],
    hours: [0,0,0,0,0,0,0,1,2,3,2,1,1,1,2,3,4,5,8,9,7,4,2,1],
    signals: [
      { id: "high_intent", strength: 0.86, product: "p1", evidence: ["Viewed 4 times this week", "55s average on page", "Never added to cart"] },
      { id: "price_hesitation", strength: 0.71, product: "p1", evidence: ["Scroll stalled at 47% on 3 visits", "That's the price block"] },
    ],
    journey: [
      { t: "Today 14:02", type: "product_view", p: "p1", meta: "58s · scrolled 46%" },
      { t: "Today 13:59", type: "collection_view", p: null, meta: "Silk sarees" },
      { t: "Yesterday 19:41", type: "push_click", p: "p1", meta: "Opened: 'Still thinking about the Maroon Zari?'" },
      { t: "Yesterday 19:40", type: "push_sent", p: "p1", meta: "Keeps coming back · push" },
      { t: "Mon 21:15", type: "product_view", p: "p1", meta: "62s · scrolled 48%" },
      { t: "Mon 21:12", type: "search", p: null, meta: "'banarasi maroon'" },
      { t: "Sat 18:30", type: "product_view", p: "p6", meta: "31s · scrolled 70%" },
      { t: "12 Jul", type: "order", p: "p3", meta: "COD · ₹1,299 · confirmed" },
      { t: "3 May", type: "order", p: "p5", meta: "Prepaid · ₹1,799" },
    ],
    messages: [
      { t: "Yesterday 19:40", signal: "high_intent", ch: "push", copy: "Still thinking about the Maroon Zari? Only 6 left.", outcome: "clicked" },
      { t: "14 Jul", signal: "post_purchase_d3", ch: "email", copy: "How to store your Bandhani so the colours stay bright", outcome: "opened" },
    ],
  },
  {
    id: "c2", name: "Anonymous shopper", anon: true, stage: "carter", push: true, email: null, phone: null,
    ltv: 0, orders: 0, lastSeen: "41 min ago", lastMsg: "Never", city: "Surat",
    interests: [["p3", 0.88], ["p5", 0.44]],
    hours: [0,0,0,0,0,0,1,2,4,3,2,2,3,2,1,1,2,3,3,4,5,3,1,0],
    signals: [
      { id: "cart_abandon", strength: 0.93, product: "p3", evidence: ["Added Sunset Orange 41 min ago", "Cart ₹1,299", "Left from cart page"] },
      { id: "email_capture", strength: 0.58, product: null, evidence: ["Second visit", "Reachable by push only"] },
    ],
    journey: [
      { t: "Today 13:21", type: "cart_view", p: "p3", meta: "₹1,299 · left here" },
      { t: "Today 13:19", type: "add_to_cart", p: "p3", meta: "Qty 1" },
      { t: "Today 13:14", type: "product_view", p: "p3", meta: "44s · scrolled 81%" },
      { t: "Today 13:12", type: "push_optin", p: null, meta: "Accepted: 'We'll save your cart and remind you'" },
      { t: "Sun 11:05", type: "product_view", p: "p5", meta: "22s · scrolled 60%" },
    ],
    messages: [],
  },
  {
    id: "c3", name: "Meera Kulkarni", anon: false, stage: "repeat", push: false, email: "meera.k@outlook.com", phone: "+91 91••• ••088",
    ltv: 12197, orders: 4, lastSeen: "3 days ago", lastMsg: "6 days ago", city: "Pune",
    interests: [["p2", 0.79], ["p4", 0.64], ["p1", 0.31]],
    hours: [0,0,0,0,0,0,0,0,1,2,3,4,3,2,2,1,1,2,3,4,3,2,1,0],
    signals: [
      { id: "back_in_stock", strength: 0.82, product: "p6", evidence: ["Viewed Paithani Magenta twice in Aug", "Restocked 2h ago"] },
    ],
    journey: [
      { t: "Fri 12:10", type: "product_view", p: "p2", meta: "90s · scrolled 100%" },
      { t: "Fri 12:04", type: "collection_view", p: null, meta: "Silk sarees" },
      { t: "22 Aug", type: "order", p: "p4", meta: "Prepaid · ₹6,999" },
      { t: "9 Aug", type: "product_view", p: "p6", meta: "48s · out of stock" },
      { t: "2 Aug", type: "product_view", p: "p6", meta: "37s · out of stock" },
    ],
    messages: [
      { t: "6 days ago", signal: "post_purchase_d3", ch: "email", copy: "Your Patola arrived — here's how to drape it", outcome: "opened" },
      { t: "18 Aug", signal: "lapsing", ch: "email", copy: "New Kanjivarams just landed, Meera", outcome: "converted", rev: 6999 },
    ],
  },
  {
    id: "c4", name: "Anonymous shopper", anon: true, stage: "browser", push: true, email: null, phone: null,
    ltv: 0, orders: 0, lastSeen: "6h ago", lastMsg: "2 days ago", city: "Mumbai",
    interests: [["p4", 0.72], ["p2", 0.55]],
    hours: [1,0,0,0,0,0,0,0,0,1,1,1,1,1,1,2,2,3,4,6,7,5,3,2],
    signals: [
      { id: "price_hesitation", strength: 0.77, product: "p4", evidence: ["84s on page", "Scroll stopped at 41% twice", "No add to cart"] },
    ],
    journey: [
      { t: "Today 08:12", type: "product_view", p: "p4", meta: "84s · scrolled 41%" },
      { t: "Tue 20:30", type: "product_view", p: "p4", meta: "77s · scrolled 40%" },
      { t: "Tue 20:22", type: "product_view", p: "p2", meta: "35s · scrolled 62%" },
    ],
    messages: [
      { t: "2 days ago", signal: "browse_abandon", ch: "push", copy: "The Emerald Patola is handwoven over 4 months. Take a closer look.", outcome: "delivered" },
    ],
  },
  {
    id: "c5", name: "Rekha Iyer", anon: false, stage: "lapsing", push: true, email: "rekha.iyer@yahoo.in", phone: "+91 99••• ••731",
    ltv: 2899, orders: 1, lastSeen: "24 days ago", lastMsg: "Never", city: "Chennai",
    interests: [["p1", 0.40], ["p6", 0.35]],
    hours: [0,0,0,0,0,0,0,1,2,2,1,1,1,1,1,1,2,2,3,3,2,1,0,0],
    signals: [
      { id: "lapsing", strength: 0.64, product: null, evidence: ["Bought 15 Aug", "No visit since"] },
    ],
    journey: [
      { t: "15 Aug", type: "order", p: "p1", meta: "COD · ₹2,899 · delivered" },
      { t: "15 Aug", type: "add_to_cart", p: "p1", meta: "Qty 1" },
    ],
    messages: [],
  },
  {
    id: "c6", name: "Anonymous shopper", anon: true, stage: "visitor", push: true, email: null, phone: null,
    ltv: 0, orders: 0, lastSeen: "12 min ago", lastMsg: "Never", city: "Rajkot",
    interests: [["p5", 0.51]],
    hours: [0,0,0,0,0,0,0,0,0,1,2,3,3,2,1,1,1,1,1,1,1,0,0,0],
    signals: [],
    journey: [
      { t: "Today 13:50", type: "product_view", p: "p5", meta: "18s · scrolled 55%" },
      { t: "Today 13:49", type: "push_optin", p: null, meta: "Accepted: 'Get alerted if this drops in price'" },
    ],
    messages: [],
  },
];

const COD_ORDERS = [
  { id: "#1091", name: "Priya Shah", phone: "+91 98••• ••412", city: "Ahmedabad", product: "p3", qty: 1, status: "confirmed", when: "12 Jul", prepaidEligible: true },
  { id: "#1104", name: "Rekha Iyer", phone: "+91 99••• ••731", city: "Chennai", product: "p1", qty: 1, status: "delivered", when: "15 Aug", prepaidEligible: false },
  { id: "#1117", name: "Sunita Desai", phone: "+91 97••• ••205", city: "Vadodara", product: "p5", qty: 2, status: "pending", when: "Today 11:20", prepaidEligible: false },
  { id: "#1118", name: "Kavita Rao", phone: "+91 96••• ••914", city: "Bengaluru", product: "p2", qty: 1, status: "pending", when: "Today 09:45", prepaidEligible: true },
];

const WEEK = [
  { d: "Tue", rev: 1299 }, { d: "Wed", rev: 0 }, { d: "Thu", rev: 4198 }, { d: "Fri", rev: 6999 },
  { d: "Sat", rev: 1799 }, { d: "Sun", rev: 2899 }, { d: "Mon", rev: 0 },
];

/* ---------- Small UI atoms ---------- */
function Card({ children, style, pad = true }) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 1px 0 rgba(0,0,0,.04)", padding: pad ? 20 : 0, ...style }}>
      {children}
    </div>
  );
}
function Badge({ tone = "neutral", children }) {
  const m = { success: [T.successBg, T.successText], warning: [T.warnBg, T.warnText], critical: [T.critBg, T.critText], info: [T.infoBg, T.infoText], neutral: [T.neutralBg, T.neutralText], magic: [T.magicBg, T.magicText] };
  const [bg, fg] = m[tone];
  return <span style={{ background: bg, color: fg, fontSize: 12, fontWeight: 500, padding: "2px 8px", borderRadius: 8, whiteSpace: "nowrap", display: "inline-block" }}>{children}</span>;
}
function Btn({ children, primary, onClick, small, disabled, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: primary ? T.primary : "#FFFFFF", color: primary ? "#FFF" : T.text,
      border: `1px solid ${primary ? T.primary : "#BABABA"}`, borderRadius: 8,
      padding: small ? "4px 10px" : "8px 14px", fontSize: small ? 12 : 13, fontWeight: 500, cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.5 : 1, boxShadow: primary ? "none" : "0 1px 0 rgba(0,0,0,.05)", fontFamily: T.font, ...style,
    }}>{children}</button>
  );
}
function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on} style={{ width: 36, height: 20, borderRadius: 10, border: "none", background: on ? T.successText : "#BABABA", position: "relative", cursor: "pointer", padding: 0 }}>
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: 8, background: "#FFF", transition: "left .15s" }} />
    </button>
  );
}
function Stat({ label, value, delta, sub }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: T.sub, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em" }}>{value}</div>
      {(delta !== undefined || sub) && (
        <div style={{ fontSize: 12, color: delta > 0 ? T.successText : delta < 0 ? T.critText : T.sub, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
          {delta > 0 && <TrendingUp size={12} />}{delta < 0 && <TrendingDown size={12} />}
          {delta !== undefined ? `${delta > 0 ? "+" : ""}${delta}% vs last week` : sub}
        </div>
      )}
    </div>
  );
}
const stageTone = { visitor: "neutral", browser: "neutral", carter: "warning", buyer: "success", repeat: "success", lapsing: "critical", lost: "critical" };
const stageLabel = { visitor: "Visitor", browser: "Browsing", carter: "Has a cart", buyer: "Bought once", repeat: "Repeat buyer", lapsing: "Going quiet", lost: "Lost" };
const money = (n) => "₹" + n.toLocaleString("en-IN");

/* ---------- Copy generation (what the AI layer would return) ---------- */
function copyFor(signalId, product, voice) {
  const name = product ? product.name.split(" — ")[0] : "";
  const e = voice.emoji;
  const lib = {
    cart_abandon: { warm: `Your ${name} is waiting${e ? " 🧡" : ""}. We saved it for you.`, direct: `${name} is still in your cart. ${product ? product.stock + " left." : ""}`, playful: `Psst — the ${name} misses you${e ? " 👀" : ""}.` },
    high_intent: { warm: `Still thinking about the ${name}? Only ${product?.stock} left${e ? " ✨" : ""}.`, direct: `${name}: ${product?.stock} left in stock.`, playful: `Fourth look at the ${name}? We think it's a sign${e ? " 😄" : ""}.` },
    price_hesitation: { warm: `The ${name} is handwoven over weeks — here's what goes into the price.`, direct: `Why the ${name} costs what it does.`, playful: `Okay, let's talk about the price of the ${name}${e ? " 💬" : ""}.` },
    price_drop: { warm: `Good news — the ${name} just dropped in price${e ? " 🎉" : ""}.`, direct: `Price drop: ${name}.`, playful: `The ${name} got cheaper. You're welcome${e ? " 😉" : ""}.` },
    back_in_stock: { warm: `It's back — the ${name} is in stock again${e ? " 🧡" : ""}.`, direct: `${name} is back in stock.`, playful: `The ${name} returned. Told you to wait${e ? " ✨" : ""}.` },
    lapsing: { warm: `We've missed you. New silks just arrived.`, direct: `New arrivals in silk this week.`, playful: `It's been a while. The sarees noticed${e ? " 🥺" : ""}.` },
    browse_abandon: { warm: `Take another look at the ${name} whenever you're ready.`, direct: `${name} — still available.`, playful: `You looked. We noticed${e ? " 👀" : ""}. ${name}.` },
    email_capture: { warm: `Want us to save your picks to your email too?`, direct: `Save your cart to email.`, playful: `Let's make this official — share an email?${e ? " 💌" : ""}` },
    post_purchase_d3: { warm: `How to care for your ${name} so it lasts decades.`, direct: `Care guide: ${name}.`, playful: `Your ${name} has arrived. Here's how not to ruin it${e ? " 😅" : ""}.` },
    winback: { warm: `It's been a while — here's what's new.`, direct: `New collection is live.`, playful: `Long time no see${e ? " 👋" : ""}. New stuff inside.` },
    cod_to_prepaid: { warm: `Pay online now and get ₹100 off this order.`, direct: `₹100 off if you pay online.`, playful: `Skip the doorstep fumble — pay online, save ₹100${e ? " 💸" : ""}.` },
    checkout_abandon: { warm: `You were one step away. Your order is saved.`, direct: `Complete your order — it's saved.`, playful: `So close! Your checkout is right where you left it.` },
  };
  const line = lib[signalId]?.[voice.tone] || "";
  if (voice.lang === "hinglish") return line.replace("Still thinking about", "Abhi bhi soch rahe ho").replace("is waiting", "aapka intezaar kar rahi hai").replace("We've missed you", "Aap bahut yaad aaye");
  return line;
}

/* ---------- Screens ---------- */
function Onboarding({ steps, setSteps, onFinish, voice }) {
  const done = steps.filter(Boolean).length;
  const items = [
    { t: "Turn on the storefront block", d: "Adds tracking and the notification prompt to your theme. One click in the theme editor." },
    { t: "Set your voice", d: `Tone, emoji, language. Every message gets written in it. Currently: ${voice.tone}, ${voice.emoji ? "emoji on" : "no emoji"}, ${voice.lang}.` },
    { t: "Choose what to act on", d: "Ten signals are on by default. Turn off any you don't want." },
    { t: "Send yourself a test", d: "A push to this browser so you can see what customers will see." },
  ];
  return (
    <div style={{ maxWidth: 720, margin: "40px auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Welcome to CartnCodForm</h1>
        <p style={{ color: T.sub, margin: "6px 0 0", fontSize: 14, lineHeight: 1.5 }}>Four steps. After this, it runs on its own — you'll open it to see what happened, not to do work.</p>
      </div>
      <Card pad={false}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{done} of 4 done</span>
          <div style={{ width: 160, height: 6, background: T.neutralBg, borderRadius: 3 }}><div style={{ width: `${done * 25}%`, height: 6, background: T.successText, borderRadius: 3, transition: "width .2s" }} /></div>
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 14, padding: "16px 20px", borderBottom: i < 3 ? `1px solid ${T.border}` : "none", alignItems: "flex-start" }}>
            <button onClick={() => setSteps(steps.map((s, j) => (j === i ? !s : s)))} aria-label={steps[i] ? "Mark not done" : "Mark done"} style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${steps[i] ? T.successText : "#BABABA"}`, background: steps[i] ? T.successText : "#FFF", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0, marginTop: 1 }}>
              {steps[i] && <Check size={13} color="#FFF" strokeWidth={3} />}
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: 14, textDecoration: steps[i] ? "line-through" : "none", color: steps[i] ? T.faint : T.text }}>{it.t}</div>
              <div style={{ fontSize: 13, color: T.sub, marginTop: 2, lineHeight: 1.5 }}>{it.d}</div>
            </div>
            {!steps[i] && <Btn small onClick={() => setSteps(steps.map((s, j) => (j === i ? true : s)))}>{i === 3 ? "Send test" : i === 0 ? "Open theme editor" : "Set up"}</Btn>}
          </div>
        ))}
      </Card>
      <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn onClick={onFinish}>Skip for now</Btn>
        <Btn primary disabled={done < 4} onClick={onFinish}>Go to Today</Btn>
      </div>
    </div>
  );
}

function Today({ signalsOn, voice, setView, setCustomer }) {
  const plan = SIGNAL_DEFS.filter((s) => signalsOn[s.id]).map((s) => ({ ...s, count: s.base }));
  const total = plan.reduce((a, b) => a + b.count, 0);
  const narrative = voice.lang === "hinglish"
    ? `Is hafte maine 1,240 customers ko dekha, 86 ko message bheja, aur 11 wapas aaye — ₹14,300 recover hua. ₹3,000 se kam ke silk sarees aapke sabse strong re-engagement product hain. Banarasi collection dekhne walon mein se 40% price section pe ruk jaate hain. Do log jinhone July mein kharida tha, phir se ready lag rahe hain; kal shaam unko reach karunga.`
    : `This week I looked at 1,240 customers, messaged 86, and 11 came back — ₹14,300 recovered. Silk sarees under ₹3,000 are your strongest re-engagement product. 40% of people who open the Banarasi collection stop at the price section. Two customers who bought in July look ready to buy again; I'll reach them tomorrow evening.`;

  return (
    <div>
      <PageHead title="Today" sub="Tuesday, 8 September" />
      <Card style={{ background: T.magicBg, border: `1px solid ${T.magicBorder}`, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Sparkles size={18} color={T.magicText} style={{ flexShrink: 0, marginTop: 3 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: T.magicText, marginBottom: 6 }}>This week, in plain words</div>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: T.text, maxWidth: 640 }}>{narrative}</p>
          </div>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Planned for today</div>
            <span style={{ fontSize: 13, color: T.sub }}>{total} customers, one message each</span>
          </div>
          {plan.length === 0 && <div style={{ color: T.sub, fontSize: 13 }}>Nothing planned — every signal is off. <button onClick={() => setView("signals")} style={{ color: T.magicText, background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: 13, fontFamily: T.font }}>Turn some on.</button></div>}
          {plan.map((s) => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: `1px solid ${T.border}`, fontSize: 13 }}>
              <span>{s.name}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ color: T.faint, fontSize: 12 }}>{s.urgency === "later" && !["email_capture", "post_purchase_d3"].includes(s.id) ? "email" : s.urgency === "later" ? "push" : "push"}</span>
                <span style={{ fontWeight: 500, minWidth: 20, textAlign: "right" }}>{s.count}</span>
              </span>
            </div>
          ))}
        </Card>
        <Card>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Yesterday</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Stat label="Sent" value="48" sub="32 push · 16 email" />
            <Stat label="Opened or clicked" value="19" sub="40% — push 46%, email 28%" />
            <Stat label="Came back and bought" value="3" sub="6.3% of sends" />
            <Stat label="Recovered" value="₹6,999" delta={18} />
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Recovered this week</div>
          <div style={{ fontSize: 13, color: T.sub, marginBottom: 12 }}>₹17,194 from 86 messages. Silk did the heavy lifting.</div>
          <div style={{ height: 160 }}>
            <ResponsiveContainer>
              <BarChart data={WEEK} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="d" tick={{ fontSize: 12, fill: T.sub }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: T.faint }} axisLine={false} tickLine={false} tickFormatter={(v) => (v ? `${v / 1000}k` : "0")} />
                <Tooltip cursor={{ fill: "#F6F6F6" }} formatter={(v) => [money(v), "Recovered"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${T.border}` }} />
                <Bar dataKey="rev" radius={[4, 4, 0, 0]}>
                  {WEEK.map((w, i) => <Cell key={i} fill={w.rev ? T.successText : T.neutralBg} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Worth knowing</div>
          {[
            { i: <TrendingUp size={14} color={T.successText} />, t: "Looked-didn't-add on the Emerald Patola is up 3× this week. 4 of 5 stop at the price." , a: () => setView("insights") },
            { i: <Bell size={14} color={T.magicText} />, t: "Priya Shah has viewed the Maroon Zari 4 times. Reaching her tonight at 7:40, her usual hour.", a: () => { setCustomer("c1"); setView("customers"); } },
            { i: <Package size={14} color={T.warnText} />, t: "Paithani Magenta is back in stock. 6 people were waiting — 4 will hear about it today.", a: () => setView("signals") },
          ].map((x, i) => (
            <button key={i} onClick={x.a} style={{ display: "flex", gap: 10, alignItems: "flex-start", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: i ? `1px solid ${T.border}` : "none", padding: "10px 0", cursor: "pointer", fontFamily: T.font }}>
              <span style={{ marginTop: 2 }}>{x.i}</span>
              <span style={{ fontSize: 13, lineHeight: 1.5, color: T.text }}>{x.t}</span>
              <ChevronRight size={14} color={T.faint} style={{ marginLeft: "auto", flexShrink: 0, marginTop: 3 }} />
            </button>
          ))}
        </Card>
      </div>
    </div>
  );
}

function Customers({ customer, setCustomer, voice }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const list = CUSTOMERS.filter((c) => (stage === "all" || c.stage === stage) && (q === "" || c.name.toLowerCase().includes(q.toLowerCase()) || c.city.toLowerCase().includes(q.toLowerCase())));
  if (customer) return <Profile c={CUSTOMERS.find((x) => x.id === customer)} back={() => setCustomer(null)} voice={voice} />;
  return (
    <div>
      <PageHead title="Customers" sub="1,240 people. 6 shown here as a sample." />
      <Card pad={false}>
        <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} color={T.faint} style={{ position: "absolute", left: 10, top: 9 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or city" style={{ width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 30px", border: `1px solid #BABABA`, borderRadius: 8, fontSize: 13, fontFamily: T.font }} />
          </div>
          {["all", "carter", "buyer", "repeat", "lapsing"].map((s) => (
            <button key={s} onClick={() => setStage(s)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${stage === s ? T.text : T.border}`, background: stage === s ? T.neutralBg : "#FFF", fontSize: 12, cursor: "pointer", fontFamily: T.font }}>{s === "all" ? "Everyone" : stageLabel[s]}</button>
          ))}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ color: T.sub, textAlign: "left" }}>
            {["Customer", "Stage", "Most interested in", "Reach", "Last messaged", "Spent"].map((h) => <th key={h} style={{ padding: "10px 16px", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} onClick={() => setCustomer(c.id)} style={{ cursor: "pointer" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#FAFAFA")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ fontWeight: 500, color: c.anon ? T.sub : T.text }}>{c.name}{c.anon && <span style={{ color: T.faint, fontWeight: 400 }}> · {c.id.replace("c", "#48")}21</span>}</div>
                  <div style={{ fontSize: 12, color: T.faint }}>{c.city} · seen {c.lastSeen}</div>
                </td>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}><Badge tone={stageTone[c.stage]}>{stageLabel[c.stage]}</Badge></td>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, maxWidth: 220 }}>
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{P[c.interests[0][0]].name.split(" — ")[0]}</div>
                  {c.signals[0] && <div style={{ fontSize: 12, color: T.magicText }}>{SIGNAL_DEFS.find((s) => s.id === c.signals[0].id).name}</div>}
                </td>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
                  <span style={{ display: "flex", gap: 6 }}>
                    <Bell size={14} color={c.push ? T.text : "#D0D0D0"} /><Mail size={14} color={c.email ? T.text : "#D0D0D0"} /><Phone size={14} color={c.phone ? T.text : "#D0D0D0"} />
                  </span>
                </td>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, color: c.lastMsg === "Never" ? T.faint : T.text }}>{c.lastMsg}</td>
                <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontWeight: 500 }}>{c.ltv ? money(c.ltv) : <span style={{ color: T.faint }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div style={{ padding: 32, textAlign: "center", color: T.sub, fontSize: 13 }}>No one matches. Try a different stage or clear the search.</div>}
      </Card>
    </div>
  );
}

const journeyIcon = { product_view: Eye, collection_view: Eye, search: Search, add_to_cart: ShoppingCart, cart_view: ShoppingCart, order: Package, push_sent: Send, push_click: Zap, push_optin: Bell };
const journeyLabel = { product_view: "Viewed", collection_view: "Browsed", search: "Searched", add_to_cart: "Added to cart", cart_view: "Opened cart", order: "Ordered", push_sent: "We sent a push", push_click: "Clicked our push", push_optin: "Allowed notifications" };

function Profile({ c, back, voice }) {
  const peak = c.hours.indexOf(Math.max(...c.hours));
  const fmtH = (h) => `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
  return (
    <div>
      <button onClick={back} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.sub, cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 12, fontFamily: T.font }}><ArrowLeft size={14} /> Customers</button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, display: "flex", gap: 10, alignItems: "center" }}>{c.name} <Badge tone={stageTone[c.stage]}>{stageLabel[c.stage]}</Badge></h1>
          <div style={{ fontSize: 13, color: T.sub, marginTop: 4, display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}><MapPin size={12} /> {c.city}</span>
            <span>Seen {c.lastSeen}</span>
            <span>Usually here around {fmtH(peak)}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn>Pause messages</Btn>
          <Btn primary>Send now</Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={{ display: "grid", gap: 16 }}>
          {c.signals.length > 0 ? (
            <Card style={{ background: T.magicBg, border: `1px solid ${T.magicBorder}` }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: T.magicText, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={13} /> What I see right now</div>
              {c.signals.map((s, i) => {
                const def = SIGNAL_DEFS.find((d) => d.id === s.id);
                const prod = s.product ? P[s.product] : null;
                return (
                  <div key={i} style={{ padding: "10px 0", borderTop: i ? `1px solid ${T.magicBorder}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontWeight: 500, fontSize: 14 }}>{def.name}{prod && <span style={{ fontWeight: 400, color: T.sub }}> — {prod.name.split(" — ")[0]}</span>}</div>
                      <span style={{ fontSize: 12, color: T.sub }}>{Math.round(s.strength * 100)}% sure</span>
                    </div>
                    <ul style={{ margin: "6px 0 8px", paddingLeft: 18, fontSize: 13, color: T.sub, lineHeight: 1.6 }}>{s.evidence.map((e, j) => <li key={j}>{e}</li>)}</ul>
                    {i === 0 && (
                      <div style={{ background: "#FFF", border: `1px solid ${T.magicBorder}`, borderRadius: 8, padding: "10px 12px", fontSize: 13 }}>
                        <div style={{ fontSize: 11, color: T.faint, marginBottom: 4 }}>Planned: {c.push ? "push" : "email"} at {fmtH(peak)} today</div>
                        <div style={{ fontWeight: 500 }}>{copyFor(s.id, prod, voice)}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </Card>
          ) : (
            <Card><div style={{ fontSize: 13, color: T.sub }}>Nothing to act on right now. I'll keep watching.</div></Card>
          )}

          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>What they did</div>
            {c.journey.map((j, i) => {
              const Icon = journeyIcon[j.type] || Clock;
              const ours = j.type.startsWith("push_");
              return (
                <div key={i} style={{ display: "flex", gap: 12, padding: "9px 0", borderTop: i ? `1px solid ${T.border}` : "none", alignItems: "flex-start" }}>
                  <div style={{ width: 26, height: 26, borderRadius: 13, background: ours ? T.magicBg : T.neutralBg, display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={13} color={ours ? T.magicText : T.sub} /></div>
                  <div style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{journeyLabel[j.type]}</span>{j.p && <span> {P[j.p].name.split(" — ")[0]}</span>}
                    <div style={{ color: T.sub, fontSize: 12 }}>{j.meta}</div>
                  </div>
                  <div style={{ fontSize: 12, color: T.faint, whiteSpace: "nowrap" }}>{j.t}</div>
                </div>
              );
            })}
          </Card>
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>How to reach them</div>
            {[["Push", c.push, "This browser, Android Chrome"], ["Email", !!c.email, c.email || "Not captured — will ask at the next good moment"], ["Phone", !!c.phone, c.phone || "Not captured"]].map(([k, on, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, padding: "6px 0", fontSize: 13, alignItems: "flex-start" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: on ? T.successText : "#D0D0D0", marginTop: 6, flexShrink: 0 }} />
                <div><div style={{ fontWeight: 500 }}>{k}</div><div style={{ color: T.sub, fontSize: 12 }}>{v}</div></div>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Interested in</div>
            {c.interests.map(([pid, sc]) => (
              <div key={pid} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>{P[pid].name.split(" — ")[0]}</span><span style={{ color: T.sub }}>{money(P[pid].price)}</span></div>
                <div style={{ height: 4, background: T.neutralBg, borderRadius: 2 }}><div style={{ width: `${sc * 100}%`, height: 4, background: T.text, borderRadius: 2 }} /></div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: T.faint, marginTop: 8 }}>Fades a little every day they don't look.</div>
          </Card>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Bought</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Stat label="Orders" value={c.orders} />
              <Stat label="Lifetime" value={c.ltv ? money(c.ltv) : "—"} />
            </div>
          </Card>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Messages sent</div>
            {c.messages.length === 0 && <div style={{ fontSize: 13, color: T.sub }}>None yet.</div>}
            {c.messages.map((m, i) => (
              <div key={i} style={{ padding: "8px 0", borderTop: i ? `1px solid ${T.border}` : "none", fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: T.sub, fontSize: 12 }}>{m.t} · {m.ch}</span>
                  <Badge tone={m.outcome === "converted" ? "success" : m.outcome === "clicked" || m.outcome === "opened" ? "info" : "neutral"}>{m.outcome}{m.rev ? ` · ${money(m.rev)}` : ""}</Badge>
                </div>
                <div>{m.copy}</div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Signals({ signalsOn, setSignalsOn, voice }) {
  const [open, setOpen] = useState(null);
  const groups = [["Right now", "now"], ["Within the hour", "soon"], ["Over the coming days", "later"]];
  return (
    <div>
      <PageHead title="What to act on" sub="Each of these is something I watch for. Turn off anything you don't want customers to hear about. I write the message; you don't need to." />
      {groups.map(([label, key]) => (
        <div key={key} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.sub, marginBottom: 8 }}>{label}</div>
          <Card pad={false}>
            {SIGNAL_DEFS.filter((s) => s.urgency === key).map((s, i, arr) => {
              const sample = PRODUCTS.find((p) => p.id === "p1");
              return (
                <div key={s.id} style={{ borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px" }}>
                    <Toggle on={!!signalsOn[s.id]} onChange={(v) => setSignalsOn({ ...signalsOn, [s.id]: v })} />
                    <button onClick={() => setOpen(open === s.id ? null : s.id)} style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: T.font }}>
                      <div style={{ fontWeight: 500, fontSize: 14, color: signalsOn[s.id] ? T.text : T.faint }}>{s.name}</div>
                      <div style={{ fontSize: 13, color: T.sub }}>{s.desc}</div>
                    </button>
                    <div style={{ textAlign: "right", minWidth: 120 }}>
                      {s.conv > 0 ? <><div style={{ fontWeight: 500, fontSize: 14 }}>{(s.conv * 100).toFixed(1)}%</div><div style={{ fontSize: 12, color: T.faint }}>bought after, your store</div></> : <div style={{ fontSize: 12, color: T.faint }}>Not a selling message</div>}
                    </div>
                    <ChevronRight size={16} color={T.faint} style={{ transform: open === s.id ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
                  </div>
                  {open === s.id && (
                    <div style={{ padding: "0 20px 16px 70px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        <div style={{ fontSize: 12, color: T.faint, marginBottom: 6 }}>Example, in your voice</div>
                        <div style={{ background: T.pageBg, borderRadius: 8, padding: "10px 12px", fontSize: 13, display: "flex", gap: 10 }}>
                          <Bell size={14} style={{ flexShrink: 0, marginTop: 2 }} /><div><div style={{ fontWeight: 500 }}>{copyFor(s.id, sample, voice)}</div><div style={{ color: T.sub, fontSize: 12, marginTop: 2 }}>shreesarees.in</div></div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13 }}>
                        <div style={{ fontSize: 12, color: T.faint, marginBottom: 6 }}>Channel</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {["Let me decide", "Push only", "Email only"].map((o, j) => <span key={o} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${j === 0 ? T.text : T.border}`, background: j === 0 ? T.neutralBg : "#FFF", fontSize: 12 }}>{o}</span>)}
                        </div>
                        <div style={{ fontSize: 12, color: T.sub, marginTop: 10, lineHeight: 1.5 }}>{s.urgency === "later" ? "Not urgent, so email when we have one — it lasts longer. Push if we don't." : "Time matters, so push if the browser is still reachable. Email as backup."}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        </div>
      ))}
    </div>
  );
}

function Messages() {
  const [f, setF] = useState("all");
  const rows = [
    { t: "Today 13:20", who: "Anonymous #4821", signal: "cart_abandon", ch: "push", copy: "Your Bandhani Georgette is waiting. We saved it for you.", out: "scheduled 14:19" },
    { t: "Today 11:32", who: "Kavita Rao", signal: "cod_to_prepaid", ch: "email", copy: "Pay online now and get ₹100 off this order.", out: "delivered" },
    { t: "Today 09:15", who: "Meera Kulkarni", signal: "back_in_stock", ch: "email", copy: "It's back — the Paithani Silk is in stock again.", out: "opened" },
    { t: "Yesterday 19:40", who: "Priya Shah", signal: "high_intent", ch: "push", copy: "Still thinking about the Maroon Zari? Only 6 left.", out: "clicked" },
    { t: "Yesterday 18:05", who: "Anonymous #3310", signal: "price_hesitation", ch: "push", copy: "The Kanjivaram is handwoven over weeks — here's what goes into the price.", out: "converted", rev: 4499 },
    { t: "Yesterday 12:00", who: "Anonymous #2987", signal: "browse_abandon", ch: "push", copy: "Take another look at the Chanderi Cotton whenever you're ready.", out: "delivered" },
    { t: "Sun 20:10", who: "Nisha Patel", signal: "lapsing", ch: "email", copy: "We've missed you. New silks just arrived.", out: "converted", rev: 2899 },
    { t: "Sun 19:30", who: "Anonymous #2201", signal: "cart_abandon", ch: "push", copy: "Your Paithani Silk is waiting. We saved it for you.", out: "skipped — bought first" },
  ];
  const shown = rows.filter((r) => f === "all" || (f === "converted" ? r.out === "converted" : r.ch === f));
  const tone = (o) => o === "converted" ? "success" : o === "clicked" || o === "opened" ? "info" : o.startsWith("skipped") ? "neutral" : o.startsWith("scheduled") ? "warning" : "neutral";
  return (
    <div>
      <PageHead title="Messages" sub="Every message, why it went, and what happened after." />
      <Card pad={false}>
        <div style={{ padding: 12, borderBottom: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
          {[["all", "All"], ["push", "Push"], ["email", "Email"], ["converted", "Led to a sale"]].map(([k, l]) => <button key={k} onClick={() => setF(k)} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${f === k ? T.text : T.border}`, background: f === k ? T.neutralBg : "#FFF", fontSize: 12, cursor: "pointer", fontFamily: T.font }}>{l}</button>)}
        </div>
        {shown.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 140px 1fr 150px", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontSize: 13, alignItems: "center" }}>
            <div style={{ color: T.sub, fontSize: 12 }}>{r.t}</div>
            <div><div style={{ fontWeight: 500 }}>{r.who}</div><div style={{ fontSize: 12, color: T.magicText }}>{SIGNAL_DEFS.find((s) => s.id === r.signal).name}</div></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>{r.ch === "push" ? <Bell size={13} color={T.sub} /> : <Mail size={13} color={T.sub} />}<span>{r.copy}</span></div>
            <div style={{ textAlign: "right" }}><Badge tone={tone(r.out)}>{r.out}{r.rev ? ` · ${money(r.rev)}` : ""}</Badge></div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function Insights() {
  const [sort, setSort] = useState("views");
  const rows = [...PRODUCTS].sort((a, b) => (sort === "views" ? b.views - a.views : sort === "dwell" ? b.dwell - a.dwell : sort === "cart" ? b.cartRate - a.cartRate : a.scroll - b.scroll));
  return (
    <div>
      <PageHead title="What's happening on your store" sub="From how long people stay and how far they scroll. Nothing here needs an email or a login to measure." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <Card><Stat label="Product views this week" value="1,525" delta={12} /></Card>
        <Card><Stat label="Allowed notifications" value="14.2%" sub="of visitors — was 3.1% with the timed popup" /></Card>
        <Card><Stat label="Add-to-cart rate" value="12.8%" delta={-3} /></Card>
        <Card><Stat label="Stop at the price" value="38%" sub="of silk viewers, based on scroll" /></Card>
      </div>
      <Card pad={false}>
        <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Products</span>
          <div style={{ display: "flex", gap: 6, fontSize: 12 }}>
            <span style={{ color: T.faint, alignSelf: "center" }}>Sort by</span>
            {[["views", "Views"], ["dwell", "Time on page"], ["scroll", "Least scrolled"], ["cart", "Cart rate"]].map(([k, l]) => <button key={k} onClick={() => setSort(k)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${sort === k ? T.text : T.border}`, background: sort === k ? T.neutralBg : "#FFF", cursor: "pointer", fontFamily: T.font, fontSize: 12 }}>{l}</button>)}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ color: T.sub, textAlign: "left" }}>{["Product", "Views", "Avg time", "Avg scroll", "Cart rate", "Where they leave", "Stock"].map((h) => <th key={h} style={{ padding: "10px 16px", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}><div style={{ fontWeight: 500 }}>{p.name}</div><div style={{ fontSize: 12, color: T.faint }}>{p.coll} · {money(p.price)}</div></td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>{p.views}<div style={{ fontSize: 12, color: T.faint }}>{p.uniq} people</div></td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>{p.dwell}s</td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 60, height: 4, background: T.neutralBg, borderRadius: 2 }}><div style={{ width: `${p.scroll}%`, height: 4, background: p.scroll < 50 ? T.critText : T.text, borderRadius: 2 }} /></div>{p.scroll}%</div>
              </td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontWeight: 500 }}>{(p.cartRate * 100).toFixed(0)}%</td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}><Badge tone={p.exit === "Price block" ? "critical" : p.exit === "Added to cart" ? "success" : "neutral"}>{p.exit}</Badge></td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, color: p.stock === 0 ? T.critText : p.stock < 5 ? T.warnText : T.text }}>{p.stock === 0 ? "Out" : p.stock}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
      <Card style={{ marginTop: 16, background: T.magicBg, border: `1px solid ${T.magicBorder}` }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Sparkles size={16} color={T.magicText} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>Three of your six sarees lose people at the price block, and they're the three priciest. People spend the longest on those pages — they want them. A "why it costs this" line under the price, or a Pay-in-3 option, is worth testing before a discount.</div>
        </div>
      </Card>
    </div>
  );
}

function COD({ orders, setOrders }) {
  const set = (id, status) => setOrders(orders.map((o) => (o.id === id ? { ...o, status } : o)));
  const pending = orders.filter((o) => o.status === "pending").length;
  return (
    <div>
      <PageHead title="Cash on delivery" sub={`${pending} waiting for your confirmation call.`} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 16 }}>
        <Card><Stat label="COD orders (30d)" value="41" delta={9} /></Card>
        <Card><Stat label="Confirmed" value="88%" sub="36 of 41" /></Card>
        <Card><Stat label="Switched to prepaid" value="7" sub="17% of eligible — ₹700 in discounts" /></Card>
        <Card><Stat label="Returned undelivered" value="3" sub="7% — was 19% before" /></Card>
      </div>
      <Card pad={false}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr style={{ color: T.sub, textAlign: "left" }}>{["Order", "Customer", "Product", "Placed", "Status", ""].map((h, i) => <th key={i} style={{ padding: "10px 16px", fontWeight: 500, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
          <tbody>{orders.map((o) => (
            <tr key={o.id}>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, fontWeight: 500 }}>{o.id}</td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}><div>{o.name}</div><div style={{ fontSize: 12, color: T.faint }}>{o.phone} · {o.city}</div>{o.prepaidEligible && o.status === "pending" && <div style={{ fontSize: 12, color: T.magicText }}>Has paid online before — prepaid offer sent</div>}</td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>{P[o.product].name.split(" — ")[0]} × {o.qty}<div style={{ fontSize: 12, color: T.faint }}>{money(P[o.product].price * o.qty)}</div></td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, color: T.sub }}>{o.when}</td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}><Badge tone={o.status === "pending" ? "warning" : o.status === "cancelled" ? "critical" : "success"}>{o.status}</Badge></td>
              <td style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, textAlign: "right" }}>
                {o.status === "pending" && <span style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Btn small onClick={() => set(o.id, "cancelled")}>Cancel</Btn><Btn small primary onClick={() => set(o.id, "confirmed")}>Confirm</Btn></span>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </div>
  );
}

function Settings({ voice, setVoice, caps, setCaps }) {
  const sample = P.p1;
  return (
    <div>
      <PageHead title="Settings" sub="Two minutes here shapes every message." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Your voice</div>
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 14 }}>I write every message in this voice. Change it and everything changes.</div>
            <Field label="Tone">{["warm", "direct", "playful"].map((t) => <Chip key={t} on={voice.tone === t} onClick={() => setVoice({ ...voice, tone: t })}>{t[0].toUpperCase() + t.slice(1)}</Chip>)}</Field>
            <Field label="Language">{[["en", "English"], ["hinglish", "Hinglish"], ["hi", "Hindi"], ["gu", "Gujarati"]].map(([k, l]) => <Chip key={k} on={voice.lang === k} onClick={() => setVoice({ ...voice, lang: k })}>{l}</Chip>)}</Field>
            <Field label="Emoji"><Toggle on={voice.emoji} onChange={(v) => setVoice({ ...voice, emoji: v })} /><span style={{ fontSize: 13, color: T.sub, marginLeft: 10 }}>{voice.emoji ? "A little" : "None"}</span></Field>
            <Field label="Sign off as"><input defaultValue="Shree Sarees" style={{ padding: "7px 10px", border: "1px solid #BABABA", borderRadius: 8, fontSize: 13, fontFamily: T.font, width: 220 }} /></Field>
          </Card>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>How often</div>
            <div style={{ fontSize: 13, color: T.sub, marginBottom: 14 }}>Most customers hear from you far less than this. These are ceilings, not targets.</div>
            <Field label="Per customer, per day">{[1, 2].map((n) => <Chip key={n} on={caps.day === n} onClick={() => setCaps({ ...caps, day: n })}>{n}</Chip>)}</Field>
            <Field label="Per customer, per week">{[2, 3, 5].map((n) => <Chip key={n} on={caps.week === n} onClick={() => setCaps({ ...caps, week: n })}>{n}</Chip>)}</Field>
            <Field label="Quiet hours"><span style={{ fontSize: 13 }}>10:00 pm – 8:00 am, Asia/Kolkata</span></Field>
            <Field label="Stop pushing after"><span style={{ fontSize: 13 }}>5 unopened in a row <span style={{ color: T.faint }}>— protects the channel from being blocked</span></span></Field>
          </Card>
        </div>
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Preview</div>
            {[["high_intent", "Keeps coming back"], ["cart_abandon", "Cart left behind"], ["price_hesitation", "Stopped at the price"], ["lapsing", "Going quiet"]].map(([id, label]) => (
              <div key={id} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: T.faint, marginBottom: 4 }}>{label}</div>
                <div style={{ background: T.pageBg, borderRadius: 10, padding: "10px 12px", display: "flex", gap: 10, fontSize: 13 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 6, background: "#7A1F2B", flexShrink: 0 }} />
                  <div><div style={{ fontWeight: 500 }}>{copyFor(id, sample, voice)}</div><div style={{ color: T.sub, fontSize: 12, marginTop: 2 }}>shreesarees.in · now</div></div>
                </div>
              </div>
            ))}
          </Card>
          <Card>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>Channels</div>
            {[["Push", true, "Working — 412 reachable browsers"], ["Email", true, "Working — 184 addresses"], ["WhatsApp", false, "Coming later. Connect your existing Business number and keep using your phone."], ["SMS", false, "Coming later"]].map(([k, on, v]) => (
              <div key={k} style={{ display: "flex", gap: 10, padding: "7px 0", fontSize: 13, alignItems: "flex-start", borderTop: k !== "Push" ? `1px solid ${T.border}` : "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: on ? T.successText : "#D0D0D0", marginTop: 6, flexShrink: 0 }} />
                <div><div style={{ fontWeight: 500, color: on ? T.text : T.faint }}>{k}</div><div style={{ color: T.sub, fontSize: 12 }}>{v}</div></div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", alignItems: "center", gap: 12, marginBottom: 12 }}><span style={{ fontSize: 13, color: T.sub }}>{label}</span><div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>{children}</div></div>;
}
function Chip({ on, onClick, children }) {
  return <button onClick={onClick} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${on ? T.text : "#BABABA"}`, background: on ? T.text : "#FFF", color: on ? "#FFF" : T.text, fontSize: 13, cursor: "pointer", fontFamily: T.font }}>{children}</button>;
}
function PageHead({ title, sub }) {
  return <div style={{ marginBottom: 16 }}><h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: "-0.01em" }}>{title}</h1>{sub && <div style={{ fontSize: 13, color: T.sub, marginTop: 4, maxWidth: 640, lineHeight: 1.5 }}>{sub}</div>}</div>;
}

/* ---------- App shell ---------- */
export default function App() {
  const [onboarded, setOnboarded] = useState(false);
  const [steps, setSteps] = useState([true, false, false, false]);
  const [view, setView] = useState("today");
  const [customer, setCustomer] = useState(null);
  const [voice, setVoice] = useState({ tone: "warm", emoji: true, lang: "en" });
  const [caps, setCaps] = useState({ day: 1, week: 3 });
  const [signalsOn, setSignalsOn] = useState(Object.fromEntries(SIGNAL_DEFS.map((s) => [s.id, !["winback", "checkout_abandon"].includes(s.id)])));
  const [orders, setOrders] = useState(COD_ORDERS);
  const [toast, setToast] = useState(null);

  const nav = [
    ["today", "Today", Home], ["customers", "Customers", Users], ["signals", "What to act on", Radio],
    ["messages", "Messages", MessageSquare], ["insights", "Insights", BarChart3], ["cod", "Cash on delivery", Package], ["settings", "Settings", SettingsIcon],
  ];
  const go = (v) => { setView(v); setCustomer(null); };

  return (
    <div style={{ fontFamily: T.font, color: T.text, background: T.pageBg, minHeight: "100vh", fontSize: 14 }}>
      {/* Shopify admin chrome (context only) */}
      <div style={{ background: "#1A1A1A", color: "#E3E3E3", height: 44, display: "flex", alignItems: "center", padding: "0 16px", gap: 16, fontSize: 13 }}>
        <span style={{ fontWeight: 600, color: "#FFF" }}>shopify</span>
        <div style={{ flex: 1, maxWidth: 480, background: "#303030", borderRadius: 8, height: 28, display: "flex", alignItems: "center", padding: "0 10px", color: "#8A8A8A", gap: 8 }}><Search size={13} /> Search</div>
        <span style={{ marginLeft: "auto", color: "#8A8A8A" }}>Shree Sarees</span>
      </div>

      <div style={{ display: "flex" }}>
        {/* Shopify left nav with the app section */}
        <aside style={{ width: 232, padding: "12px 8px", borderRight: `1px solid ${T.border}`, minHeight: "calc(100vh - 44px)", background: "#EBEBEB" }}>
          {["Home", "Orders", "Products", "Customers", "Marketing", "Discounts", "Content", "Analytics"].map((x) => <div key={x} style={{ padding: "6px 10px", fontSize: 13, color: T.sub, borderRadius: 8 }}>{x}</div>)}
          <div style={{ fontSize: 11, color: T.faint, padding: "14px 10px 4px", fontWeight: 500 }}>Apps</div>
          <div style={{ padding: "6px 10px", fontSize: 13, fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}><span style={{ width: 18, height: 18, borderRadius: 4, background: T.magicText, display: "inline-block" }} />CartnCodForm</div>
          {onboarded && nav.map(([k, l, I]) => (
            <button key={k} onClick={() => go(k)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "6px 10px 6px 24px", fontSize: 13, borderRadius: 8, border: "none", cursor: "pointer", fontFamily: T.font, background: view === k ? "#FFF" : "transparent", color: view === k ? T.text : T.sub, fontWeight: view === k ? 500 : 400 }}>
              <I size={14} /> {l}
            </button>
          ))}
        </aside>

        <main style={{ flex: 1, padding: "24px 32px", maxWidth: 1080, boxSizing: "border-box" }}>
          {!onboarded ? (
            <Onboarding steps={steps} setSteps={setSteps} voice={voice} onFinish={() => { setOnboarded(true); setToast("You're set. I'll take it from here."); setTimeout(() => setToast(null), 2500); }} />
          ) : view === "today" ? <Today signalsOn={signalsOn} voice={voice} setView={setView} setCustomer={setCustomer} />
            : view === "customers" ? <Customers customer={customer} setCustomer={setCustomer} voice={voice} />
            : view === "signals" ? <Signals signalsOn={signalsOn} setSignalsOn={setSignalsOn} voice={voice} />
            : view === "messages" ? <Messages />
            : view === "insights" ? <Insights />
            : view === "cod" ? <COD orders={orders} setOrders={setOrders} />
            : <Settings voice={voice} setVoice={setVoice} caps={caps} setCaps={setCaps} />}
        </main>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: T.text, color: "#FFF", padding: "10px 16px", borderRadius: 8, fontSize: 13, display: "flex", gap: 8, alignItems: "center", boxShadow: "0 4px 12px rgba(0,0,0,.2)" }}><Check size={14} /> {toast}</div>
      )}
    </div>
  );
}
