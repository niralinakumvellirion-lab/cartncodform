'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import QuietHoursWarning, { useQuietHoursSettings, formatLocalDateTimeInput } from '../components/QuietHoursWarning';
import { ShimmerCard } from '../components/Shimmer';
import { ImageUploadPair } from '../components/ImageUploadPair';
import { EmailPreviewFrame } from '../components/EmailPreviewFrame';
import { ProductPicker } from '../components/ProductPicker';
import MultiDateScheduler from '../components/MultiDateScheduler';

function GripIcon({ size = 14, color = '#9ca3af' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill={color} aria-hidden="true">
      <circle cx="4" cy="3" r="1.25"/><circle cx="10" cy="3" r="1.25"/>
      <circle cx="4" cy="7" r="1.25"/><circle cx="10" cy="7" r="1.25"/>
      <circle cx="4" cy="11" r="1.25"/><circle cx="10" cy="11" r="1.25"/>
    </svg>
  );
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'sent', label: 'Sent' },
];

// The stats-row tiles (Pending, Sent only — Failed/Cancelled tiles were
// removed). The GET /api/queue/:shop endpoint only returns a `total`
// scoped to whatever single `status` filter was requested — there is no
// aggregate "counts per status" field — so the stats row is built from
// parallel calls to that same endpoint (one per status here, reading
// only .total from each). Wasteful (each call also returns up to 20 full,
// profile-enriched job rows that this row never uses) but stays within
// the given backend contract, which this task presented as complete and
// did not ask to extend. See audits/phase2-queue-audit.txt.
const STATS_STATUSES = ['pending', 'sent'];

const STATUS_BADGE = {
  pending: { bg: '#fef3c7', color: '#d97706' },
  sent: { bg: '#dcfce7', color: '#16a34a' },
  failed: { bg: '#fee2e2', color: '#dc2626' },
  cancelled: { bg: '#f3f4f6', color: '#6b7280' },
  skipped: { bg: '#f3f4f6', color: '#6b7280' },
};

const CHANNEL_BADGE = {
  push: { bg: '#dbeafe', color: '#1d4ed8', label: 'Push' },
  email: { bg: '#ede9fe', color: '#6d28d9', label: 'Email' },
};

const GRID_COLS = '1.8fr 1.4fr 0.9fr 1.5fr 1fr 1.8fr';

// FestivalQueue's 4 statuses (see backend/models/FestivalQueue.js) — the
// Planning List previously only ever showed "Approved"/"Draft" (a ternary
// on item.status === 'approved'), silently mislabeling any 'sent' or
// 'cancelled' item as "Draft". Presentation-only fix: a proper 4-way
// badge map, same shape as STATUS_BADGE above.
const FESTIVAL_STATUS_BADGE = {
  draft: { bg: '#f3f4f6', color: '#6b7280', label: 'Draft' },
  approved: { bg: '#dcfce7', color: '#16a34a', label: 'Approved' },
  sent: { bg: '#dbeafe', color: '#2563eb', label: 'Sent' },
  cancelled: { bg: '#f3f4f6', color: '#9ca3af', label: 'Cancelled', strike: true },
};

function formatSignal(type) {
  if (!type) return '—';
  const s = String(type).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDateTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const datePart = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const timePart = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
}

function getCustomerLabel(job) {
  if (job.email) return job.email;
  if (job.profileId) {
    return 'Subscriber #' + String(job.profileId).slice(-6);
  }
  return 'Anonymous';
}

// --- Phase 2: festival calendar data. Was a private, stale hardcoded
// copy that drifted from backend/data/festivals.json (old dates like
// Navratri 2026-10-02, Diwali 2026-10-29). Now the canonical source is
// fetched at runtime via GET /api/push/festivals (see festivalCalendar
// state + its useEffect in QueueScreen below); this array only remains
// as FESTIVAL_CALENDAR_FALLBACK for when that fetch fails, kept in sync
// with backend/data/festivals.json's current contents (all 36 entries,
// including searchTerm/imageUrl). getUpcomingFestivals below is unused
// in this file (kept from the original copy) but updated to reference
// the renamed constant so it isn't left pointing at a removed binding.
const FESTIVAL_CALENDAR_FALLBACK = [
  { name: 'Navratri', date: '2026-10-11', emoji: '🪷',
    suggestion: 'Send festive Navratri offers to all subscribers',
    message: 'Celebrate Navratri with us! Get special festive discounts on your favorite products. 🪷',
    searchTerm: 'navratri garba dance',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796311/ausgezfhwyivcswmojmi.jpg' },
  { name: 'Dussehra', date: '2026-10-20', emoji: '🏹',
    suggestion: 'Send Dussehra sale notification',
    message: 'Happy Dussehra! Victory of good over evil — and great deals for you! Shop now. 🏹',
    searchTerm: 'dussehra festival celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796313/rmqgg4kqkz0yhuxy1c1k.jpg' },
  { name: 'Dhanteras', date: '2026-11-06', emoji: '🪙',
    suggestion: 'Promote Dhanteras shopping with special offer',
    message: 'Dhanteras is here! Bring prosperity home with our exclusive festive collection. 🪙',
    searchTerm: 'dhanteras gold diya',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796315/lt9va3uqcullbw3ils5g.jpg' },
  { name: 'Diwali', date: '2026-11-08', emoji: '🪔',
    suggestion: 'Send Diwali offer — biggest sale of the year',
    message: 'Happy Diwali! Light up your celebrations with our biggest sale of the year. 🪔✨',
    searchTerm: 'diwali diya lamps',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796317/ll2muraxgo6pmdf2bi5d.jpg' },
  { name: 'Bhai Dooj', date: '2026-11-11', emoji: '❤️',
    suggestion: 'Send Bhai Dooj gifting ideas notification',
    message: 'Bhai Dooj special! Find the perfect gift for your siblings. Shop now. ❤️',
    searchTerm: 'bhai dooj celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796320/p0urc4wemgbt3vgbwyyo.jpg' },
  { name: 'Christmas', date: '2026-12-25', emoji: '🎄',
    suggestion: 'Send Christmas sale notification',
    message: 'Merry Christmas! Spread joy with our festive deals. 🎄🎁',
    searchTerm: 'christmas decoration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796322/sgziyovm50lpwwdwquog.jpg' },
  { name: 'New Year', date: '2027-01-01', emoji: '🎆',
    suggestion: 'Send New Year offer to re-engage customers',
    message: 'Happy New Year! Start 2027 with amazing deals. 🎆',
    searchTerm: 'new year fireworks celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796324/yv2sxsk4cdbpvtfi1ntd.jpg' },
  { name: 'Makar Sankranti', date: '2027-01-14', emoji: '🪁',
    suggestion: 'Send Sankranti festive notification',
    message: 'Happy Makar Sankranti! Celebrate with our special festive offers. 🪁',
    searchTerm: 'makar sankranti kite flying',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796327/ryt1bfbk82dezeinpkxp.jpg' },
  { name: 'Republic Day', date: '2027-01-26', emoji: '🇮🇳',
    suggestion: 'Send Republic Day sale notification',
    message: 'Happy Republic Day! Celebrate with patriotic deals. 🇮🇳',
    searchTerm: 'indian republic day flag',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796330/xkdnhkhnsqwrbdvq8zpu.jpg' },
  { name: 'Holi', date: '2027-03-22', emoji: '🎨',
    suggestion: 'Send colorful Holi offers to all subscribers',
    message: 'Happy Holi! Color your celebrations with amazing festive deals. 🎨🌈',
    searchTerm: 'holi colors festival',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796332/iuwmfsgnkt9rxatg0x9f.jpg' },
  { name: 'Eid ul-Fitr', date: '2027-03-05', emoji: '🌙',
    suggestion: 'Send Eid special offers notification',
    message: 'Eid Mubarak! Celebrate with our special Eid collection and offers. 🌙✨',
    searchTerm: 'eid mubarak celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796334/jxghs20chs6r7jg0rqlk.jpg' },
  { name: 'Raksha Bandhan', date: '2027-08-17', emoji: '🧡',
    suggestion: 'Send Raksha Bandhan gifting notification',
    message: 'Raksha Bandhan special! Find the perfect gift for your siblings. 🧡',
    searchTerm: 'rakhi raksha bandhan',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796336/cayk6kbkvbzvu7bu7tsu.jpg' },
  { name: 'Independence Day', date: '2027-08-15', emoji: '🇮🇳',
    suggestion: 'Send Independence Day sale notification',
    message: 'Happy Independence Day! Celebrate freedom with amazing deals. 🇮🇳',
    searchTerm: 'indian independence day flag',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789796338/f4y1pt4wklyalvvlsiro.jpg' },
  { name: 'Ganesh Chaturthi', date: '2027-09-04', emoji: '🐘',
    suggestion: 'Ganesh Chaturthi sale — festive offers',
    message: 'Ganpati Bappa Morya! Celebrate Ganesh Chaturthi with special festive deals. 🐘',
    searchTerm: 'ganesh chaturthi idol festival',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797138/qbvdkmc2zzm6vcjraxyz.jpg' },
  { name: 'Janmashtami', date: '2027-09-04', emoji: '🦚',
    suggestion: 'Janmashtami offer — Krishna Janmashtami sale',
    message: 'Happy Janmashtami! Celebrate Lord Krishna\'s birth with festive discounts. 🦚',
    searchTerm: 'janmashtami krishna festival',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797140/ciggs111tdqkd1sb1dtn.jpg' },
  { name: 'Maha Shivratri', date: '2027-03-06', emoji: '🔱',
    suggestion: 'Maha Shivratri notification — festive offers',
    message: 'Har Har Mahadev! Celebrate Maha Shivratri with special festive deals. 🔱',
    searchTerm: 'maha shivratri shiva temple',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797143/etenxn6oneucxrgs1vfx.jpg' },
  { name: 'Karva Chauth', date: '2026-10-20', emoji: '🌕',
    suggestion: 'Karva Chauth gifting notification',
    message: 'Karva Chauth special! Find the perfect gift for your loved one. 🌕',
    searchTerm: 'karva chauth moon celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797145/yudwvhtztdqbfazfhzfp.jpg' },
  { name: 'Chhath Puja', date: '2026-11-04', emoji: '🌅',
    suggestion: 'Chhath Puja festive notification',
    message: 'Happy Chhath Puja! Celebrate with our special festive collection. 🌅',
    searchTerm: 'chhath puja sunset ritual',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797147/yaz52icxiueuplhdh0lx.jpg' },
  { name: 'Onam', date: '2027-09-15', emoji: '🌼',
    suggestion: 'Onam sale — festive offers for Kerala customers',
    message: 'Happy Onam! Celebrate with our special festive discounts. 🌼',
    searchTerm: 'onam pookalam flower rangoli',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797150/mzediieihrbuukczbywi.jpg' },
  { name: 'Pongal', date: '2027-01-14', emoji: '🌾',
    suggestion: 'Pongal harvest festival sale',
    message: 'Happy Pongal! Celebrate the harvest festival with festive deals. 🌾',
    searchTerm: 'pongal harvest festival',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797152/vulsjz2m8wrjd7vmcrcl.jpg' },
  { name: 'Baisakhi', date: '2027-04-13', emoji: '🪘',
    suggestion: 'Baisakhi sale notification',
    message: 'Happy Baisakhi! Celebrate the harvest festival with special offers. 🪘',
    searchTerm: 'baisakhi bhangra celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797154/gdokf4u4zrezgbqczowq.jpg' },
  { name: 'Gudi Padwa', date: '2027-03-28', emoji: '🚩',
    suggestion: 'Gudi Padwa new year sale',
    message: 'Happy Gudi Padwa! Celebrate the Maharashtrian New Year with deals. 🚩',
    searchTerm: 'gudi padwa flag celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797156/lbbna1lj54xjmxn6jefg.jpg' },
  { name: 'Ugadi', date: '2027-03-28', emoji: '🥭',
    suggestion: 'Ugadi new year offer',
    message: 'Happy Ugadi! Celebrate the Telugu New Year with festive discounts. 🥭',
    searchTerm: 'ugadi pachadi new year',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797159/tlqoerkq1be2tnkrnxcs.jpg' },
  { name: 'Durga Puja', date: '2026-10-10', emoji: '🎊',
    suggestion: 'Durga Puja festive sale',
    message: 'Happy Durga Puja! Celebrate with our special festive collection. 🎊',
    searchTerm: 'durga puja pandal festival',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797161/y4tn0pcsp9qhrfu8ukfv.jpg' },
  { name: 'Lohri', date: '2027-01-13', emoji: '🔥',
    suggestion: 'Lohri bonfire festival sale',
    message: 'Happy Lohri! Celebrate with warm festive deals. 🔥',
    searchTerm: 'lohri bonfire celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797163/xdmkbu4rqagarvyf01kd.jpg' },
  { name: 'Guru Nanak Jayanti', date: '2026-11-24', emoji: '🙏',
    suggestion: 'Guru Nanak Jayanti notification',
    message: 'Happy Guru Nanak Jayanti! Celebrate with our special festive offers. 🙏',
    searchTerm: 'guru nanak jayanti gurudwara',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797165/c97fdkeszhuh7431xp10.jpg' },
  { name: 'Eid ul-Adha (Bakrid)', date: '2027-05-28', emoji: '🐐',
    suggestion: 'Eid ul-Adha special offers',
    message: 'Eid Mubarak! Celebrate Bakrid with our special collection and offers. 🐐',
    searchTerm: 'eid al adha celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797167/fxevfpwgmp3ttnhfrjag.jpg' },
  { name: 'Muharram', date: '2027-07-17', emoji: '🕌',
    suggestion: 'Muharram notification',
    message: 'Muharram Mubarak. Explore our thoughtful collection this season. 🕌',
    searchTerm: 'muharram islamic new year',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797170/o40ouswvnmoqemdplvhs.jpg' },
  { name: 'Good Friday', date: '2027-03-26', emoji: '✝️',
    suggestion: 'Good Friday notification',
    message: 'Good Friday blessings. Explore our special seasonal collection. ✝️',
    searchTerm: 'good friday church cross',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797172/papwwzne8ljinzz6bsba.jpg' },
  { name: 'Easter', date: '2027-03-28', emoji: '🐣',
    suggestion: 'Easter sale — festive offers',
    message: 'Happy Easter! Celebrate with our special spring collection and deals. 🐣',
    searchTerm: 'easter eggs spring celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797174/yrgajnwskwxd3movwp5z.jpg' },
  { name: 'Valentine\'s Day', date: '2027-02-14', emoji: '💝',
    suggestion: 'Valentine\'s Day sale notification',
    message: 'Happy Valentine\'s Day! Find the perfect gift for your loved one. 💝',
    searchTerm: 'valentines day gift romance',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797176/k3feozivl8dl1t7ppthg.jpg' },
  { name: 'Mother\'s Day', date: '2027-05-09', emoji: '💐',
    suggestion: 'Mother\'s Day gifting notification',
    message: 'Happy Mother\'s Day! Find the perfect gift to celebrate Mom. 💐',
    searchTerm: 'mothers day flowers gift',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797178/xts7wthyutqopqaabxbd.jpg' },
  { name: 'Father\'s Day', date: '2027-06-20', emoji: '👔',
    suggestion: 'Father\'s Day gifting notification',
    message: 'Happy Father\'s Day! Find the perfect gift to celebrate Dad. 👔',
    searchTerm: 'fathers day gift celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797182/ma4qy7dbda8dvovufzwx.jpg' },
  { name: 'Friendship Day', date: '2027-08-01', emoji: '🤝',
    suggestion: 'Friendship Day gifting notification',
    message: 'Happy Friendship Day! Find the perfect gift for your best friend. 🤝',
    searchTerm: 'friendship day gift celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797184/f3sesbauw1yeb5ut798s.jpg' },
  { name: 'Children\'s Day', date: '2026-11-14', emoji: '🎈',
    suggestion: 'Children\'s Day sale notification',
    message: 'Happy Children\'s Day! Special deals on gifts for the little ones. 🎈',
    searchTerm: 'childrens day balloons celebration',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797186/luygup3vempztbmdpu5h.jpg' },
  { name: 'Gandhi Jayanti', date: '2026-10-02', emoji: '🕊️',
    suggestion: 'Gandhi Jayanti notification',
    message: 'Remembering Mahatma Gandhi. Explore our thoughtful collection today. 🕊️',
    searchTerm: 'gandhi jayanti peace',
    imageUrl: 'https://res.cloudinary.com/y0kktn9f/image/upload/v1789797188/ytmidkcp8tju6bzsohat.jpg' },
];

function getUpcomingFestivals(count) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return FESTIVAL_CALENDAR_FALLBACK
    .map(f => {
      const fDate = new Date(f.date);
      const diffMs = fDate - today;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return { ...f, diffDays, fDate };
    })
    .filter(f => f.diffDays >= 0 && f.diffDays <= 60)
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, count);
}

// Duplicated from DashboardScreen.jsx (same no-shared-layout convention
// as FESTIVAL_CALENDAR_FALLBACK above) — formats a 'YYYY-MM-DD' festival
// date as local midnight so it never shifts a day in non-UTC timezones.
function formatFestivalDate(dateStr) {
  const parts = dateStr.split('-');
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Planning List date-group headings — render-time grouping only, no new
// state/fetch (festivalItems already arrives sorted by scheduledAt from
// the backend). "Today"/"Tomorrow"/"Yesterday" for near dates, otherwise
// "Fri 20 Nov".
function formatGroupHeading(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

// Returns true when the scheduled date (ISO string or Date) falls before
// the start of today in the user's local timezone. Today and future dates
// return false. Used to suppress the Approve action on past items.
function isPastDay(dateOrIso) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateOrIso) < today;
}

function groupFestivalItemsByDay(items) {
  const groups = new Map();
  items.forEach((item) => {
    const d = new Date(item.scheduledAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!groups.has(key)) groups.set(key, { date: d, items: [] });
    groups.get(key).items.push(item);
  });
  return Array.from(groups.values());
}

// MonthCalendar — renders one month grid. `festivals` is passed the raw,
// unfiltered FESTIVAL_CALENDAR array rather than getUpcomingFestivals()'s
// output: getUpcomingFestivals only returns festivals within a 60-day-
// from-today rolling window, but this calendar has its own month
// navigation (the required ←/→ arrows), so a merchant browsing to a
// month outside that window would see festival markers silently vanish
// if the filtered/capped helper were used instead. The raw array has no
// such limitation and correctly shows festival markers for whatever
// month is on screen. See audits/queue-phase2-audit.txt.
//
// DEVIATION FROM THE GIVEN SPEC: the given code keyed the leading empty
// cells by `key={i}` (array index) and the real day cells by `key={day}`
// (day-of-month number) within the SAME .map() over `days` — since `i`
// and `day` are both small integers, an empty cell and a real day cell
// could end up with the identical React key (e.g. index 1 is an empty
// cell, but day 1 is also a real cell later in the same array), a
// sibling key collision that produces incorrect reconciliation on
// re-render (e.g. when navigating between months). Fixed by keying every
// cell — empty and real — by the array index `i`, which is unique across
// the whole array regardless of cell type.
function FestivalIcon({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 2l2.09 6.26L20 10l-5.45 3.97 1.63 6.03L12 16.77l-4.18 3.26 1.63-6.03L4 10l5.91-1.74z"/>
    </svg>
  );
}

function BellIcon({ size, color }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true">
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
    </svg>
  );
}

// MonthCalendar — icon-only cells. Each cell is a square via
// aspect-ratio:1/1 (no minHeight) so cells never grow from content.
// Festival + notification icons sit in one flex row; both must fit
// side-by-side at any width (never wrap). Props:
//   selectedDayStr / selectedDayType — highlight the active icon.
//   onFestivalClick(dateStr, festivalObj) / onNotificationsClick(dateStr)
//   isNarrow — true when viewport ≤ 600px (passed from QueueScreen).
function MonthCalendar({ month, items, festivals, selectedDayStr, selectedDayType, onFestivalClick, onNotificationsClick, onDayCellClick, isNarrow,
  dragItem, dragOverDate, onCellDragOver, onCellDragLeave, onCellDrop }) {
  const year = month.getFullYear();
  const mon = month.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, mon, 0).getDate();
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const trailingCount = totalCells - firstDay - daysInMonth;

  const cells = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: daysInPrevMonth - firstDay + 1 + i, outside: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, outside: false });
  }
  for (let i = 1; i <= trailingCount; i++) {
    cells.push({ day: i, outside: true });
  }

  const todayReal = new Date();
  // Responsive sizing — narrow = viewport ≤ 600px (calendar cells ~44px).
  const gridGap  = isNarrow ? 3 : 6;
  const cellPad  = isNarrow ? 2 : 4;
  const iconSize = isNarrow ? 18 : 28;
  const glyphSz  = isNarrow ? 12 : 17;
  const iconGap  = isNarrow ? 2 : 4;
  const dayNumSz = isNarrow ? 11 : 12;
  const dayCirc  = isNarrow ? 18 : 22;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: gridGap,
      background: '#e5e7eb', border: '1px solid #e5e7eb',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
        <div key={d} style={{
          background: '#f9fafb', padding: '6px 0',
          textAlign: 'center', fontSize: 10,
          fontWeight: 700, color: '#9ca3af',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>{d}</div>
      ))}
      {cells.map((cell, i) => {
        if (cell.outside) {
          return (
            <div key={i} style={{
              background: '#fbfbfc', aspectRatio: '1 / 1',
              padding: cellPad, overflow: 'hidden',
            }}>
              <div style={{ fontSize: dayNumSz, color: '#d1d5db' }}>{cell.day}</div>
            </div>
          );
        }

        const day = cell.day;
        const dateStr = `${year}-${String(mon+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = todayReal.toDateString() === new Date(year, mon, day).toDateString();
        const isSelected = selectedDayStr === dateStr;
        const festival = festivals.find(f => f.date.startsWith(dateStr));
        const queued = items.filter(item => {
          const d = new Date(item.scheduledAt);
          return d.getFullYear() === year && d.getMonth() === mon && d.getDate() === day;
        });

        const festiveSel = isSelected && selectedDayType === 'festival';
        const notifSel   = isSelected && selectedDayType === 'notifications';

        const isPast = new Date(year, mon, day) < new Date(todayReal.getFullYear(), todayReal.getMonth(), todayReal.getDate());
        const isFutureOrToday = !isPast;
        const emptyAndFuture = isFutureOrToday && !festival && queued.length === 0;
        const cellDateLabel = new Date(year, mon, day).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
        const isValidDropTarget = !!dragItem && isFutureOrToday;
        const isDragOver = dragOverDate === dateStr;

        return (
          <div key={i}
            onDragOver={e => {
              if (!isValidDropTarget) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverDate !== dateStr && onCellDragOver) onCellDragOver(dateStr);
            }}
            onDragLeave={() => { if (isDragOver && onCellDragLeave) onCellDragLeave(); }}
            onDrop={e => {
              e.preventDefault();
              if (!isValidDropTarget) return;
              if (onCellDrop) onCellDrop(dateStr);
            }}
            style={{
              background: isDragOver ? '#eff6ff' : isSelected ? '#F5F8FE' : isToday ? '#eef2ff' : '#fff',
              aspectRatio: '1 / 1',
              padding: cellPad,
              boxShadow: isDragOver
                ? 'inset 0 0 0 2px #2563eb'
                : isSelected ? 'inset 0 0 0 2px #4f46e5'
                : isToday ? 'inset 0 0 0 1.5px #4f46e5' : 'none',
              transition: 'background 0.12s',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              position: 'relative',
              cursor: dragItem && !isValidDropTarget ? 'not-allowed' : undefined,
            }}
          >
            {/* Transparent full-cell click target for today/future */}
            {isFutureOrToday && onDayCellClick && (
              <button
                className="ccf-day-cell-btn"
                aria-label={`Add engagement on ${cellDateLabel}`}
                onClick={e => { e.stopPropagation(); onDayCellClick(dateStr); }}
                onDragOver={e => { if (dragItem) e.preventDefault(); }}
                style={{ zIndex: 0 }}
              />
            )}

            {/* Day number */}
            <div style={{
              width: dayCirc, height: dayCirc, borderRadius: '50%',
              background: isToday ? '#4f46e5' : 'transparent',
              color: isPast ? '#9ca3af' : isToday ? '#fff' : '#111827',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: dayNumSz, fontWeight: isToday ? 700 : 400, flexShrink: 0,
              position: 'relative', zIndex: 1,
            }}>{day}</div>

            {/* Dashed "+" hint on empty future days */}
            {emptyAndFuture && (
              <div style={{
                position: 'absolute', bottom: cellPad + 3, left: '50%',
                transform: 'translateX(-50%)',
                width: glyphSz, height: glyphSz, borderRadius: '50%',
                border: '1.5px dashed #d1d5db',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: glyphSz * 0.7, color: '#d1d5db',
                pointerEvents: 'none', zIndex: 1,
              }}>+</div>
            )}

            {/* Icon row — festival + notification, never wrapping */}
            {(festival || queued.length > 0) && (
              <div style={{ display: 'flex', flexWrap: 'nowrap', gap: iconGap, marginTop: 4, position: 'relative', zIndex: 1 }}>
                {festival && (
                  <button
                    onClick={e => { e.stopPropagation(); onFestivalClick(dateStr, festival); }}
                    aria-label={`${festival.name}, festival`}
                    title={festival.name}
                    aria-pressed={festiveSel}
                    className="ccf-icon-btn"
                    style={{
                      width: iconSize, height: iconSize, flexShrink: 0,
                      borderRadius: 6, padding: 0,
                      border: festiveSel ? '2px solid #8A5A00' : '1.5px solid rgba(138,90,0,0.18)',
                      background: festiveSel ? '#8A5A00' : '#FFF3D6',
                      color: festiveSel ? '#fff' : '#8A5A00',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', position: 'relative', zIndex: 2,
                    }}
                  >
                    <FestivalIcon size={glyphSz} color="currentColor" />
                  </button>
                )}
                {queued.length > 0 && (
                  <div style={{ position: 'relative', flexShrink: 0, zIndex: 2 }}>
                    <button
                      onClick={e => { e.stopPropagation(); onNotificationsClick(dateStr); }}
                      aria-label={queued.length === 1 ? '1 notification' : `${queued.length} notifications`}
                      title={queued.length === 1 ? '1 notification' : `${queued.length} notifications`}
                      aria-pressed={notifSel}
                      className="ccf-icon-btn"
                      style={{
                        width: iconSize, height: iconSize, flexShrink: 0,
                        borderRadius: 6, padding: 0,
                        border: notifSel ? '2px solid #2459D6' : '1.5px solid rgba(36,89,214,0.18)',
                        background: notifSel ? '#2459D6' : '#EAF0FD',
                        color: notifSel ? '#fff' : '#2459D6',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <BellIcon size={glyphSz} color="currentColor" />
                    </button>
                    {queued.length >= 2 && (
                      <div style={{
                        position: 'absolute', top: -5, right: -5,
                        background: '#111827', color: '#fff',
                        borderRadius: 10, fontSize: 9, fontWeight: 700,
                        padding: '0 3px', minWidth: 14, height: 14,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        pointerEvents: 'none',
                      }}>{queued.length}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// DayDetailsPanel — shown in the right column when a calendar icon is
// clicked. Festival tab: name, date, suggestion, sample message.
// Notifications tab: list of cards with the same Approve/Edit/Delete/
// View actions as the planning list (same handlers, no duplicated logic).
function DayDetailsPanel({
  dateStr, dayPanelTab, setDayPanelTab,
  festivalCalendar, festivalItems,
  onBack, onAddEngagement, shop, openEditModal, goToFestivalDetail, setFestivalItems,
  dragItem, onCardDragStart, onCardDragEnd, dragNewId,
}) {
  const dragEndedRef = useRef(false);
  const festival = festivalCalendar.find(f => f.date.startsWith(dateStr));
  const parts = dateStr.split('-');
  const notifications = festivalItems.filter(item => {
    const d = new Date(item.scheduledAt);
    return d.getFullYear() === Number(parts[0]) &&
           d.getMonth()    === Number(parts[1]) - 1 &&
           d.getDate()     === Number(parts[2]);
  });
  const hasBoth = festival && notifications.length > 0;
  const activeTab = hasBoth ? dayPanelTab : (festival ? 'festival' : 'notifications');
  const displayDate = new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]))
    .toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Panel header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 600, color: '#6b7280', padding: 0, marginBottom: 6,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back to planning list
        </button>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: hasBoth ? 10 : 0 }}>
          {displayDate}
        </div>
        {hasBoth && (
          <div style={{ display: 'inline-flex', gap: 2, background: '#f3f4f6', borderRadius: 8, padding: 3 }}>
            {[{key:'festival',label:'Festival'},{key:'notifications',label:'Notifications'}].map(t => (
              <button key={t.key} onClick={() => setDayPanelTab(t.key)} style={{
                padding: '5px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                border: 'none', cursor: 'pointer',
                background: activeTab === t.key ? '#fff' : 'transparent',
                color: activeTab === t.key ? '#111827' : '#6b7280',
                boxShadow: activeTab === t.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{t.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div style={{ overflowY: 'auto', maxHeight: '70vh', padding: 16 }}>
        {/* FESTIVAL TAB */}
        {activeTab === 'festival' && festival && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {festival.imageUrl ? (
                <img src={festival.imageUrl} alt=""
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#FFF3D6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 26, flexShrink: 0 }}>
                  {festival.emoji || '🎉'}
                </div>
              )}
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{festival.name}</div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
                  {new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2]))
                    .toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
            </div>
            {festival.suggestion && (
              <div style={{ background: '#f9fafb', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Suggestion</div>
                <div style={{ fontSize: 13, color: '#374151' }}>{festival.suggestion}</div>
              </div>
            )}
            {festival.message && (
              <div style={{ background: '#fef9f0', border: '1px solid #fde68a',
                borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Sample message</div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{festival.message}</div>
              </div>
            )}
          </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
          notifications.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
              No notifications for this day.
            </div>
          ) : notifications.map((item, ii) => {
            const badge = FESTIVAL_STATUS_BADGE[item.status] || FESTIVAL_STATUS_BADGE.draft;
            const isDraggable = (item.status === 'draft' || item.status === 'approved') && !item.sendClaimedAt;
            const isBeingDragged = dragItem && dragItem._id === item._id;
            const isHighlighted = dragNewId === item._id;
            return (
              <div
                key={item._id}
                draggable={isDraggable}
                onDragStart={isDraggable ? e => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', item._id);
                  dragEndedRef.current = false;
                  requestAnimationFrame(() => {
                    if (!dragEndedRef.current && onCardDragStart) onCardDragStart(item);
                  });
                } : undefined}
                onDragEnd={isDraggable ? () => {
                  dragEndedRef.current = true;
                  if (onCardDragEnd) onCardDragEnd();
                } : undefined}
                style={{
                  background: '#f9fafb', border: isHighlighted ? '2px solid #2563eb' : '1px solid #e5e7eb',
                  borderRadius: 10, padding: '12px 14px',
                  marginBottom: ii < notifications.length - 1 ? 10 : 0,
                  opacity: isBeingDragged ? 0.4 : 1,
                  cursor: isDraggable ? 'grab' : undefined,
                  transition: 'opacity 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
                  {isDraggable && (
                    <div aria-label="Drag to move to another date" style={{
                      color: '#d1d5db', flexShrink: 0, marginTop: 2,
                      display: 'flex', alignItems: 'center',
                    }}>
                      <GripIcon size={14} />
                    </div>
                  )}
                  {(item.mobileImageUrl || item.desktopImageUrl) && (
                    <img src={item.mobileImageUrl || item.desktopImageUrl} alt=""
                      style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                      onError={e => { e.target.style.display = 'none'; }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 2 }}>
                      {item.title}
                    </div>
                    {item.body && (
                      <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.body}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: badge.bg, color: badge.color, flexShrink: 0,
                    textDecoration: badge.strike ? 'line-through' : 'none',
                  }}>{badge.label}</span>
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>
                  {item.festival ? `${item.festival} · ` : ''}
                  {new Date(item.scheduledAt).toLocaleTimeString('en-IN', {
                    hour: 'numeric', minute: '2-digit', hour12: true,
                  })}
                  {' · '}{item.targetType === 'product'
                    ? `→ ${item.productTitle || 'Product'}` : '→ Storefront home'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.status === 'sent' ? (
                    <button onClick={() => goToFestivalDetail(item._id)} style={{
                      padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb',
                      background: '#fff', color: '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}>View</button>
                  ) : (
                    <>
                      {item.status === 'draft' && !isPastDay(item.scheduledAt) && (
                        <button onClick={async () => {
                          await apiSend(
                            `/api/queue/${encodeURIComponent(shop)}/festival/${item._id}`,
                            'PATCH', { status: 'approved' }
                          );
                          setFestivalItems(prev => prev.map(i =>
                            i._id === item._id ? { ...i, status: 'approved' } : i
                          ));
                        }} style={{
                          padding: '5px 10px', borderRadius: 6, border: 'none',
                          background: '#4f46e5', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}>Approve</button>
                      )}
                      {(!item.channel || item.channel === 'push') && (
                        <button onClick={() => openEditModal(item)} style={{
                          padding: '5px 10px', borderRadius: 6, border: '1px solid #e5e7eb',
                          background: '#fff', color: '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}>Edit</button>
                      )}
                      <button onClick={async () => {
                        await apiSend(
                          `/api/queue/${encodeURIComponent(shop)}/festival/${item._id}`,
                          'DELETE', {}
                        );
                        const remaining = festivalItems.filter(i => i._id !== item._id);
                        setFestivalItems(remaining);
                        // Close panel if no notifications remain for this day
                        const stillHere = remaining.filter(fi => {
                          const d = new Date(fi.scheduledAt);
                          return d.getFullYear() === Number(parts[0]) &&
                                 d.getMonth()    === Number(parts[1]) - 1 &&
                                 d.getDate()     === Number(parts[2]);
                        });
                        if (stillHere.length === 0) onBack();
                      }} style={{
                        padding: '5px 10px', borderRadius: 6, border: '1px solid #fee2e2',
                        background: '#fff', color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>Delete</button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        {!isPastDay(dateStr + 'T00:00') && (
          <button
            onClick={onAddEngagement}
            style={{ width: '100%', marginTop: 16, padding: '10px 0', borderRadius: 8,
                     border: 'none', background: '#4f46e5', color: '#fff',
                     fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            + Add engagement
          </button>
        )}
      </div>
    </div>
  );
}

// ─── AddEngagementView ────────────────────────────────────────────────────────
// Renders the multi-step add-engagement panel (list → choose → form → saved).
// All state is owned by QueueScreen; this component is pure render.
const SEGMENT_OPTS = [
  { value: 'everyone',       label: 'Everyone with an email',   desc: 'All subscribers in your list' },
  { value: 'email_captured', label: 'Signed up by email',       desc: 'Customers who gave their email at checkout or signup' },
  { value: 'has_cart',       label: 'Left items in cart',        desc: 'Customers with items still in their cart' },
  { value: 'bought_once',    label: 'Bought once',              desc: 'First-time buyers — a great group to win back' },
  { value: 'going_quiet',    label: 'Going quiet',              desc: 'Subscribers who haven\'t engaged in a while' },
];

const EMAIL_SEGMENT_LABELS = Object.fromEntries(SEGMENT_OPTS.map(o => [o.value, o.label]));

function audienceLineForItem(item) {
  const ch = item.channel;
  if (!ch) return null;
  if (ch === 'push') return 'All push subscribers';
  if (ch === 'email') return EMAIL_SEGMENT_LABELS[item.segment] || 'Everyone with an email';
  if (ch === 'whatsapp') return 'You send it yourself';
  return null;
}

const MAX_PHOTO_BYTES = 1024 * 1024; // 1 MB

function templateTypeChip(type) {
  const map = {
    special_offer: { bg: '#eff6ff', color: '#1d4ed8', label: 'Special offer' },
    festival:      { bg: '#fff7ed', color: '#c2410c', label: 'Festival' },
  };
  const s = map[type] || { bg: '#f3f4f6', color: '#374151', label: type || 'Template' };
  return (
    <span style={{ fontSize: 10, background: s.bg, color: s.color,
                   borderRadius: 10, padding: '1px 7px', fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function AddEngagementView({
  dateStr, festivalItems,
  step, channel,
  title, setTitle, body, setBody,
  subject, setSubject, templateId, setTemplateId,
  sendTime, setSendTime,
  saving, error, banner, newId,
  emailTemplates, emailTemplatesLoading, emailTemplatesError, onRetryTemplates, manageTemplatesUrl,
  mobileImageUrl, setMobileImageUrl,
  desktopImageUrl, setDesktopImageUrl,
  photoError, setPhotoError,
  previewDevice, setPreviewDevice,
  segment, setSegment,
  emailSegmentCounts,
  pushSubscriberCount,
  onBack, onOpenStep, onSave, onAddAnother, onDone,
  dragItem, onCardDragStart, onCardDragEnd,
}) {
  const dragEndedRef = useRef(false);
  const parts = dateStr.split('-');
  const dayDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const dayLabel = dayDate.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const isPast = isPastDay(dateStr + 'T00:00');

  const notifications = festivalItems.filter(item => {
    const d = new Date(item.scheduledAt);
    return d.getFullYear() === Number(parts[0]) &&
           d.getMonth() === Number(parts[1]) - 1 &&
           d.getDate() === Number(parts[2]);
  });

  const CHANNEL_CHIP = { push: { bg: '#dbeafe', color: '#1d4ed8', label: 'Push' }, email: { bg: '#ede9fe', color: '#6d28d9', label: 'Email' }, whatsapp: { bg: '#dcfce7', color: '#15803d', label: 'WhatsApp' } };

  // 1 MB guard for photo uploads — done here, not in ImageUploadPair.jsx
  function handleMobileChange(dataUri) {
    if (dataUri && dataUri.length > MAX_PHOTO_BYTES * 1.37) { // base64 overhead
      setPhotoError('Mobile photo must be under 1 MB. Please choose a smaller file.');
      return;
    }
    setPhotoError('');
    setMobileImageUrl(dataUri);
  }
  function handleDesktopChange(dataUri) {
    if (dataUri && dataUri.length > MAX_PHOTO_BYTES * 1.37) {
      setPhotoError('Desktop photo must be under 1 MB. Please choose a smaller file.');
      return;
    }
    setPhotoError('');
    setDesktopImageUrl(dataUri);
  }

  const [tplPreviewHtml, setTplPreviewHtml] = useState('');
  const [tplPreviewLoading, setTplPreviewLoading] = useState(false);
  const [tplPreviewDevice, setTplPreviewDevice] = useState('desktop');

  async function loadTplPreview(id) {
    setTplPreviewLoading(true);
    setTplPreviewHtml('');
    try {
      const r = await apiGet(`/api/email-templates/${encodeURIComponent(id)}/preview`);
      setTplPreviewHtml(r?.html || '');
    } catch (_) {
      setTplPreviewHtml('');
    } finally {
      setTplPreviewLoading(false);
    }
  }

  const selectedSegmentCount = emailSegmentCounts ? emailSegmentCounts[segment] : null;
  const emailZeroCount = typeof selectedSegmentCount === 'number' && selectedSegmentCount === 0;

  const pushValid = channel === 'push' && title && title.length <= 50;
  const emailValid = channel === 'email' && templateId && subject && !emailZeroCount;
  const waValid = channel === 'whatsapp' && body && body.length <= 300;
  const canSave = pushValid || emailValid || waValid;

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <button
          onClick={() => {
            if (step === 'list') onBack();
            else if (step === 'choose') onOpenStep('list', null);
            else onOpenStep('choose', null);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6b7280', padding: 0, marginBottom: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          {step === 'list' ? 'Back to planning list' : step === 'choose' ? `Back to ${dayLabel}` : 'Back to channels'}
        </button>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
          {step === 'list' ? dayLabel : step === 'choose' ? `Add engagement · ${dayLabel}` : step === 'saved' ? dayLabel : `${channel === 'push' ? 'Push' : channel === 'email' ? 'Email' : 'WhatsApp'} · ${dayLabel}`}
        </div>
      </div>

      <div style={{ overflowY: 'auto', maxHeight: '75vh', padding: 16 }}>
        {/* STEP: LIST */}
        {step === 'list' && (
          <div>
            {notifications.length === 0 ? (
              <div style={{ border: '2px dashed #e5e7eb', borderRadius: 10, padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13, marginBottom: 16 }}>
                Nothing scheduled for this day
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                {notifications.map(item => {
                  const badge = FESTIVAL_STATUS_BADGE[item.status] || FESTIVAL_STATUS_BADGE.draft;
                  const cc = CHANNEL_CHIP[item.channel || 'push'];
                  const audLine = audienceLineForItem(item);
                  const isDraggable = (item.status === 'draft' || item.status === 'approved') && !item.sendClaimedAt;
                  const isBeingDragged = dragItem && dragItem._id === item._id;
                  return (
                    <div key={item._id}
                      draggable={isDraggable}
                      onDragStart={isDraggable ? e => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', item._id);
                        dragEndedRef.current = false;
                        requestAnimationFrame(() => {
                          if (!dragEndedRef.current && onCardDragStart) onCardDragStart(item);
                        });
                      } : undefined}
                      onDragEnd={isDraggable ? () => {
                        dragEndedRef.current = true;
                        if (onCardDragEnd) onCardDragEnd();
                      } : undefined}
                      style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', marginBottom: 8, opacity: isBeingDragged ? 0.4 : 1, cursor: isDraggable ? 'grab' : undefined, transition: 'opacity 0.15s' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        {isDraggable && <div aria-label="Drag to move to another date" style={{ color: '#d1d5db', flexShrink: 0, display: 'flex', alignItems: 'center' }}><GripIcon size={14} /></div>}
                        {cc && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: cc.bg, color: cc.color }}>{cc.label}</span>}
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{item.title || item.subject || '(no title)'}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.color }}>{badge.label}</span>
                      </div>
                      {item.body && <div style={{ fontSize: 12, color: '#6b7280' }}>{item.body}</div>}
                      {audLine && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Audience: {audLine}</div>}
                    </div>
                  );
                })}
              </div>
            )}
            {!isPast ? (
              <button onClick={() => onOpenStep('choose', null)} style={{ width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                + Add engagement
              </button>
            ) : (
              <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '8px 0' }}>
                This date has passed, so new engagements cannot be added.
              </div>
            )}
          </div>
        )}

        {/* STEP: SAVED (re-uses list view with banner) */}
        {step === 'saved' && (
          <div>
            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#166534' }}>
              {channel === 'whatsapp'
                ? 'Saved as a draft. Approve it to add it to your Dashboard tasks.'
                : 'Saved as a draft. Approve it from the day list to schedule it.'}
            </div>
            {notifications.map(item => {
              const badge = FESTIVAL_STATUS_BADGE[item.status] || FESTIVAL_STATUS_BADGE.draft;
              const cc = CHANNEL_CHIP[item.channel || 'push'];
              const isNew = item._id === newId;
              const audLine = audienceLineForItem(item);
              const isDraggable = (item.status === 'draft' || item.status === 'approved') && !item.sendClaimedAt;
              const isBeingDragged = dragItem && dragItem._id === item._id;
              return (
                <div key={item._id}
                  draggable={isDraggable}
                  onDragStart={isDraggable ? e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', item._id);
                    dragEndedRef.current = false;
                    requestAnimationFrame(() => {
                      if (!dragEndedRef.current && onCardDragStart) onCardDragStart(item);
                    });
                  } : undefined}
                  onDragEnd={isDraggable ? () => {
                    dragEndedRef.current = true;
                    if (onCardDragEnd) onCardDragEnd();
                  } : undefined}
                  style={{ background: isNew ? '#eef2ff' : '#f9fafb', border: isNew ? '1.5px solid #a5b4fc' : '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', marginBottom: 8, opacity: isBeingDragged ? 0.4 : 1, cursor: isDraggable ? 'grab' : undefined, transition: 'opacity 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {isDraggable && <div aria-label="Drag to move to another date" style={{ color: '#d1d5db', flexShrink: 0, display: 'flex', alignItems: 'center' }}><GripIcon size={14} /></div>}
                    {cc && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: cc.bg, color: cc.color }}>{cc.label}</span>}
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{item.title || item.subject || '(no title)'}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: badge.bg, color: badge.color }}>{badge.label}</span>
                  </div>
                  {item.body && <div style={{ fontSize: 12, color: '#6b7280' }}>{item.body}</div>}
                  {audLine && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>Audience: {audLine}</div>}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={onAddAnother} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Add another</button>
              <button onClick={onDone} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        )}

        {/* STEP: CHOOSE channel */}
        {step === 'choose' && (
          <div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 14 }}>What kind of engagement do you want to add?</div>
            {[
              { key: 'push', label: 'Push notification', desc: 'A short alert with a title and message.' },
              { key: 'email', label: 'Email', desc: 'Pick one of your saved templates.' },
              { key: 'whatsapp', label: 'WhatsApp', desc: 'A message you send yourself. It shows on your Dashboard that day.' },
            ].map(opt => (
              <button key={opt.key} onClick={() => onOpenStep(opt.key, opt.key)} style={{
                display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left',
                background: '#f9fafb', border: '1.5px solid #e5e7eb', borderRadius: 10,
                padding: '14px 16px', marginBottom: 10, cursor: 'pointer',
                transition: 'border-color 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#4f46e5'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}
              >
                <span style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 3 }}>{opt.label}</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>{opt.desc}</span>
              </button>
            ))}
            <button onClick={() => onOpenStep('list', null)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}>← Cancel</button>
          </div>
        )}

        {/* STEP: PUSH form */}
        {step === 'push' && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Title <span style={{ color: '#9ca3af' }}>{title.length}/50</span></label>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={50}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                placeholder="e.g. Diwali Sale — 30% off everything"
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Message <span style={{ color: '#9ca3af' }}>{body.length}/120</span></label>
              <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={120} rows={3}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                placeholder="e.g. Get 30% off all products — offer ends tonight!"
              />
            </div>
            {/* Photo field */}
            <div style={{ marginBottom: 4 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 2 }}>
                Photo <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
              </label>
              <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>2:1 · JPG or PNG · under 1 MB</div>
              <ImageUploadPair
                mobileImageUrl={mobileImageUrl}
                desktopImageUrl={desktopImageUrl}
                onMobileChange={handleMobileChange}
                onDesktopChange={handleDesktopChange}
                defaultInfoOpen={true}
              />
              {photoError && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{photoError}</div>}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Send time</label>
              <input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13 }}
              />
            </div>
            {/* Push preview with device switch */}
            <div style={{ background: '#f9fafb', borderRadius: 10, padding: '12px 14px', marginBottom: 16, border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {['mobile', 'desktop'].map(d => (
                    <button key={d} onClick={() => setPreviewDevice(d)}
                      style={{ padding: '3px 10px', borderRadius: 6, border: '1.5px solid', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        borderColor: previewDevice === d ? '#4f46e5' : '#e5e7eb',
                        background: previewDevice === d ? '#eef2ff' : '#fff',
                        color: previewDevice === d ? '#4f46e5' : '#6b7280' }}>
                      {d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              {(() => {
                const img = previewDevice === 'mobile' ? mobileImageUrl : desktopImageUrl;
                return (
                  <div style={{ background: '#111827', color: '#fff', borderRadius: 10, overflow: 'hidden' }}>
                    {img ? (
                      <img src={img} alt="" style={{ width: '100%', aspectRatio: '2/1', objectFit: 'cover', display: 'block' }} />
                    ) : null}
                    <div style={{ padding: '10px 14px' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{title || 'Notification title'}</div>
                      <div style={{ fontSize: 12, color: '#d1d5db' }}>{body || 'Your message will appear here.'}</div>
                    </div>
                  </div>
                );
              })()}
              {(() => {
                const img = previewDevice === 'mobile' ? mobileImageUrl : desktopImageUrl;
                return img
                  ? <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>This is how the photo will look on {previewDevice}.</div>
                  : <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>No photo for {previewDevice}, so it will send as text only.</div>;
              })()}
            </div>
            {/* Audience picker — push */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Who gets this?</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  About {pushSubscriberCount === null ? '…' : pushSubscriberCount.total} customers
                </span>
              </div>
              <div role="radiogroup" aria-label="Audience">
                {/* Enabled: everyone */}
                <div role="radio" aria-checked={true} onClick={() => {}}
                  style={{ border: '1.5px solid #4f46e5', borderRadius: 8, padding: '10px 12px', marginBottom: 6,
                    background: '#eef2ff', cursor: 'default' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#4f46e5' }}>All push subscribers</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Everyone who allowed notifications on your store</div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Push reaches everyone who allowed notifications on your store.
              </div>
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onOpenStep('list', null)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={onSave} disabled={!canSave || saving}
                style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: canSave && !saving ? '#4f46e5' : '#e5e7eb', color: canSave && !saving ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 700, cursor: canSave && !saving ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Saving…' : 'Save engagement'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
              Saved as a draft. Approve it from the day list to schedule it.
            </div>
          </div>
        )}

        {/* STEP: EMAIL form */}
        {step === 'email' && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 8, flexWrap: 'wrap', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Choose a template</span>
                <a href={manageTemplatesUrl}
                   aria-label="Manage email templates"
                   style={{ fontSize: 11, color: '#2459D6', textDecoration: 'underline', flexShrink: 0 }}>
                  Manage templates
                </a>
              </div>
              {emailTemplatesLoading ? (
                <div style={{ fontSize: 13, color: '#9ca3af', background: '#f9fafb', borderRadius: 8, padding: 12 }}>
                  Loading templates…
                </div>
              ) : emailTemplatesError ? (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 13, color: '#dc2626', marginBottom: 8 }}>Could not load templates.</div>
                  <button onClick={onRetryTemplates}
                    style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: '#dc2626',
                             border: 'none', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
                    Retry
                  </button>
                </div>
              ) : emailTemplates.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af', background: '#f9fafb', borderRadius: 8, padding: 12 }}>
                  No saved email templates. Create one in the{' '}
                  <a href={manageTemplatesUrl}
                     aria-label="Manage email templates"
                     style={{ color: '#2459D6', textDecoration: 'underline' }}>
                    Email Templates section
                  </a>
                  {' '}first.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {emailTemplates.map(t => {
                    const isSel = templateId === t._id;
                    return (
                      <button key={t._id}
                        onClick={() => {
                          setTemplateId(t._id);
                          setSubject(t.subject || '');
                          loadTplPreview(t._id);
                        }}
                        style={{
                          textAlign: 'left', padding: '10px 12px', borderRadius: 8,
                          border: `1.5px solid ${isSel ? '#2459D6' : '#e5e7eb'}`,
                          background: isSel ? '#F5F8FE' : '#fff',
                          cursor: 'pointer', width: '100%',
                          display: 'flex', alignItems: 'flex-start', gap: 10,
                        }}
                      >
                        <span style={{ marginTop: 2, flexShrink: 0,
                                       width: 14, height: 14, borderRadius: '50%',
                                       border: `2px solid ${isSel ? '#2459D6' : '#d1d5db'}`,
                                       background: isSel ? '#2459D6' : 'transparent',
                                       display: 'inline-block' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{t.name}</span>
                            {templateTypeChip(t.type)}
                          </div>
                          {t.subject && (
                            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2,
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t.subject}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Template preview */}
              {templateId && !emailTemplatesLoading && !emailTemplatesError && (
                <div style={{ marginTop: 12 }}>
                  {/* Desktop / Mobile toggle */}
                  <div role="group" style={{ display: 'flex', gap: 2, background: '#f3f4f6',
                                              borderRadius: 8, padding: 2, width: 'fit-content',
                                              marginBottom: 8 }}>
                    {[['desktop', 'Desktop'], ['mobile', 'Mobile']].map(([d, label]) => (
                      <button key={d} onClick={() => setTplPreviewDevice(d)}
                        style={{
                          padding: '4px 10px', fontSize: 11, fontWeight: 600,
                          border: 'none', borderRadius: 6, cursor: 'pointer',
                          background: tplPreviewDevice === d ? '#fff' : 'transparent',
                          color: tplPreviewDevice === d ? '#2459D6' : '#6b7280',
                          boxShadow: tplPreviewDevice === d ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        }}>
                        {label}
                      </button>
                    ))}
                  </div>
                  {tplPreviewDevice === 'mobile' ? (
                    <div style={{ height: 480, borderRadius: 8, overflow: 'hidden',
                                  border: '1px solid #e5e7eb' }}>
                      <EmailPreviewFrame
                        html={tplPreviewHtml}
                        device="mobile"
                        loading={tplPreviewLoading}
                        templateMode={true}
                      />
                    </div>
                  ) : (
                    <EmailPreviewFrame
                      html={tplPreviewHtml}
                      device="desktop"
                      loading={tplPreviewLoading}
                      templateMode={true}
                      subject={subject}
                    />
                  )}
                </div>
              )}
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Subject line</label>
              <input value={subject} onChange={e => setSubject(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                placeholder="e.g. Happy Diwali — a special offer inside 🪔"
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Send time</label>
              <input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13 }}
              />
            </div>
            {/* Audience picker — email */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Who gets this?</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>
                  About {emailSegmentCounts === null || emailSegmentCounts[segment] === null
                    ? '…'
                    : emailSegmentCounts[segment] === -1
                      ? '–'
                      : emailSegmentCounts[segment]} customers
                </span>
              </div>
              <div role="radiogroup" aria-label="Audience">
                {SEGMENT_OPTS.map(opt => {
                  const count = emailSegmentCounts ? emailSegmentCounts[opt.value] : null;
                  const countStr = count === null ? '…' : count === -1 ? '–' : String(count);
                  const sel = segment === opt.value;
                  return (
                    <div key={opt.value} role="radio" aria-checked={sel}
                      onClick={() => setSegment(opt.value)}
                      style={{ border: `1.5px solid ${sel ? '#4f46e5' : '#e5e7eb'}`, borderRadius: 8,
                        padding: '10px 12px', marginBottom: 6, cursor: 'pointer',
                        background: sel ? '#eef2ff' : '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: sel ? '#4f46e5' : '#374151' }}>{opt.label}</span>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{countStr} customers</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{opt.desc}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                Customers who opted out are skipped automatically.
              </div>
              {emailZeroCount && (
                <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>
                  No customers in this group yet.
                </div>
              )}
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onOpenStep('list', null)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={onSave} disabled={!canSave || saving}
                style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: canSave && !saving ? '#4f46e5' : '#e5e7eb', color: canSave && !saving ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 700, cursor: canSave && !saving ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Saving…' : 'Save engagement'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
              Saved as a draft. Approve it from the day list to schedule it.
            </div>
          </div>
        )}

        {/* STEP: WHATSAPP form */}
        {step === 'whatsapp' && (
          <div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Quick start</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {['Cart reminder', 'Festival wish', 'New arrivals'].map(chip => (
                  <button key={chip} onClick={() => setBody(body ? `${body} ${chip}` : chip)}
                    className="ccf-chip">{chip}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Message <span style={{ color: '#9ca3af' }}>{body.length}/300</span></label>
              <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={300} rows={4}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }}
                placeholder="Hi! We have a special offer for you..."
              />
            </div>
            {/* Chat bubble preview */}
            <div style={{ background: '#e2ffc7', borderRadius: '18px 18px 4px 18px', padding: '10px 14px', maxWidth: 240, marginBottom: 14, fontSize: 13, color: '#111827' }}>
              {body || 'Your WhatsApp message will appear here.'}
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Send time (reminder)</label>
              <input type="time" value={sendTime} onChange={e => setSendTime(e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13 }}
              />
            </div>
            {/* WhatsApp audience info box */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#1e40af', marginBottom: 2 }}>Who gets this?</div>
              <div style={{ fontSize: 12, color: '#1d4ed8' }}>
                You send this one yourself, so you choose who to message when it appears on your Dashboard.
              </div>
            </div>
            <div style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#92400e' }}>
              You send this yourself. It will appear on your Dashboard on this day.
            </div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => onOpenStep('list', null)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
              <button onClick={onSave} disabled={!canSave || saving}
                style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: canSave && !saving ? '#4f46e5' : '#e5e7eb', color: canSave && !saving ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 700, cursor: canSave && !saving ? 'pointer' : 'not-allowed' }}>
                {saving ? 'Saving…' : 'Save engagement'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 8, textAlign: 'center' }}>
              Saved as a draft. Approve it to add it to your Dashboard tasks.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QueueScreen({ shop }) {
  const router = useRouter();
  const goToFestivalDetail = (id) => {
    router.push(`/admin/queue/${id}?shop=${encodeURIComponent(shop)}`);
  };

  const manageTemplatesUrl = '/admin/email-templates?back=queue';

  // One-time style injection — same idempotent pattern DashboardScreen
  // uses for its own keyframes. Only rule here: stack ImageUploadPair's
  // two upload boxes under 600px (that component's props/API are
  // untouched — this targets a className added inside it purely for
  // this external hook).
  if (typeof window !== 'undefined' &&
      !document.getElementById('queue-responsive')) {
    const s = document.createElement('style');
    s.id = 'queue-responsive';
    s.textContent = `
      @media (max-width: 600px) {
        .ccf-upload-pair-grid { grid-template-columns: 1fr !important; }
        .ccf-eng-split { flex-direction: column !important; }
      }
      @media (max-width: 1099px) {
        .ccf-queue-split { grid-template-columns: 1fr !important; }
      }
      .ccf-icon-btn:focus-visible {
        outline: 2px solid #4f46e5;
        outline-offset: 2px;
      }
      .ccf-day-cell-btn {
        position: absolute; inset: 0; width: 100%; height: 100%;
        background: transparent; border: none; cursor: pointer; padding: 0;
        border-radius: 0;
      }
      .ccf-day-cell-btn:focus-visible { outline: 2px solid #4f46e5; outline-offset: -2px; }
      .ccf-tpl-card { cursor: pointer; border-radius: 8px; padding: 10px 12px;
        border: 2px solid #e5e7eb; transition: border-color 0.12s; }
      .ccf-tpl-card:hover { border-color: #a5b4fc; }
      .ccf-tpl-card.selected { border-color: #4f46e5; background: #eef2ff; }
      .ccf-chip { display: inline-flex; align-items: center; padding: 4px 10px;
        border-radius: 20px; font-size: 11px; font-weight: 700; cursor: pointer;
        border: 1.5px solid #e5e7eb; background: #f9fafb; color: #374151;
        transition: all 0.1s; }
      .ccf-chip:hover { background: #4f46e5; color: #fff; border-color: #4f46e5; }
      .ccf-chip.active { background: #4f46e5; color: #fff; border-color: #4f46e5; }
    `;
    document.head.appendChild(s);
  }

  const [isMobileView, setIsMobileView] = useState(false);
  const [isNarrowCal, setIsNarrowCal] = useState(false);
  useEffect(() => {
    const check = () => {
      setIsMobileView(window.innerWidth <= 768);
      setIsNarrowCal(window.innerWidth <= 600);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(0);
  const limit = 20;

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [statusCounts, setStatusCounts] = useState({});
  const [statsLoading, setStatsLoading] = useState(true);

  const [actionLoading, setActionLoading] = useState(null);
  const [actionResults, setActionResults] = useState({});

  const [refreshKey, setRefreshKey] = useState(0);

  // Phase 2: calendar + planning view state.
  const [festivalItems, setFestivalItems] = useState([]);
  const [festivalLoading, setFestivalLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  // The shared, image-enriched festival calendar (backend/data/
  // festivals.json), fetched once on mount — same pattern as
  // DashboardScreen. Falls back to FESTIVAL_CALENDAR_FALLBACK if the
  // request fails, so the calendar still shows festival markers.
  const [festivalCalendar, setFestivalCalendar] = useState([]);
  // Not given an exact name/default by the task ("wrapped in a
  // collapsible 'Sent Notifications' section that defaults to
  // collapsed") — invented, defaulting to false (collapsed).
  const [sentNotifsOpen, setSentNotifsOpen] = useState(false);

  // FETCH LOGIC — job list. Fetch on mount + when statusFilter or page
  // changes; refreshKey also re-triggers this (Refresh button, and after
  // a successful send-now/cancel action).
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setLoading(true);
    apiGet(`/api/queue/${encodeURIComponent(shop)}?status=${encodeURIComponent(statusFilter)}&page=${page}`)
      .then((data) => {
        if (cancelled) return;
        setJobs(data.jobs || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        if (cancelled) return;
        setJobs([]);
        setTotal(0);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop, statusFilter, page, refreshKey]);

  // Stats row — independent of statusFilter/page (it always shows all 4
  // counts at once), but still re-fetched on refreshKey.
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setStatsLoading(true);
    Promise.all(
      STATS_STATUSES.map((s) =>
        apiGet(`/api/queue/${encodeURIComponent(shop)}?status=${s}&page=0`).catch(() => null)
      )
    )
      .then((results) => {
        if (cancelled) return;
        const counts = {};
        STATS_STATUSES.forEach((s, i) => {
          counts[s] = results[i]?.total ?? 0;
        });
        setStatusCounts(counts);
      })
      .finally(() => {
        if (cancelled) return;
        setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop, refreshKey]);

  // Reset to page 0 whenever the status filter changes — otherwise
  // switching from a long list to a short one could land on an
  // out-of-range page with no rows.
  useEffect(() => {
    setPage(0);
  }, [statusFilter]);

  // Phase 2: festival queue fetch.
  useEffect(() => {
    if (!shop) return;
    apiGet(`/api/queue/${encodeURIComponent(shop)}/festival`)
      .then(data => setFestivalItems(data.items || []))
      .catch(() => setFestivalItems([]))
      .finally(() => setFestivalLoading(false));
  }, [shop]);

  // Festival calendar fetch — same pattern as DashboardScreen.
  useEffect(() => {
    let cancelled = false;
    apiGet('/api/push/festivals')
      .then((data) => {
        if (cancelled) return;
        setFestivalCalendar(Array.isArray(data) ? data : FESTIVAL_CALENDAR_FALLBACK);
      })
      .catch(() => {
        if (cancelled) return;
        setFestivalCalendar(FESTIVAL_CALENDAR_FALLBACK);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // One-shot: once festivalItems first loads, if none of them fall in the
  // month the calendar happens to be showing (the current real-world
  // month, at mount), jump to the month of the earliest upcoming item
  // (or the earliest item overall if nothing is upcoming) so the
  // merchant doesn't land on an empty calendar. Guarded by a ref rather
  // than state so it truly only ever fires once and never re-triggers or
  // overrides the user's own prev/next month navigation afterwards.
  const hasSetInitialMonth = useRef(false);
  useEffect(() => {
    if (hasSetInitialMonth.current) return;
    if (festivalLoading) return;
    hasSetInitialMonth.current = true;

    if (!festivalItems.length) return;

    const inDisplayedMonth = festivalItems.some((item) => {
      const d = new Date(item.scheduledAt);
      return d.getFullYear() === currentMonth.getFullYear() &&
             d.getMonth() === currentMonth.getMonth();
    });
    if (inDisplayedMonth) return;

    const sorted = [...festivalItems].sort(
      (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
    );
    const now = new Date();
    const upcoming = sorted.filter((item) => new Date(item.scheduledAt) >= now);
    const target = upcoming.length ? upcoming[0] : sorted[0];
    const targetDate = new Date(target.scheduledAt);
    setCurrentMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
  }, [festivalItems, festivalLoading]);

  // Edit modal state — Planning List's "Edit" action.
  const [editingItem, setEditingItem] = useState(null);
  const quietSettings = useQuietHoursSettings(shop);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editMobileImageUrl, setEditMobileImageUrl] = useState('');
  const [editDesktopImageUrl, setEditDesktopImageUrl] = useState('');
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editTargetType, setEditTargetType] = useState('home');
  const [editProductId, setEditProductId] = useState('');
  const [editProductHandle, setEditProductHandle] = useState('');
  const [editProductTitle, setEditProductTitle] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  // this-date-only (default, today's behaviour) vs all-remaining-dates —
  // only meaningful, and only shown, when editingItem.groupId is set.
  const [editApplyToGroup, setEditApplyToGroup] = useState(false);
  // New dates added while editing this item (audits/queue-multi-date-
  // audit.txt) — null while the MultiDateScheduler toggle is off, an
  // array (possibly empty) once the merchant opts in. These join the
  // item's existing group (or a fresh one, folding this ungrouped item
  // into it) on save — see saveEdit below.
  const [editMultiDates, setEditMultiDates] = useState(null);
  const [editRemovingSibling, setEditRemovingSibling] = useState(null);

  function openEditModal(item) {
    setEditingItem(item);
    setEditTitle(item.title || '');
    setEditBody(item.body || '');
    setEditMobileImageUrl(item.mobileImageUrl || '');
    setEditDesktopImageUrl(item.desktopImageUrl || '');
    setEditScheduledAt(item.scheduledAt || '');
    setEditTargetType(item.targetType || 'home');
    setEditProductId(item.productId || '');
    setEditProductHandle(item.productHandle || '');
    setEditProductTitle(item.productTitle || '');
    setEditApplyToGroup(false);
    setEditMultiDates(null);
  }

  // Day details panel — tracks which date is selected and which tab.
  const [selectedDayStr, setSelectedDayStr] = useState(null);
  const [dayPanelTab, setDayPanelTab] = useState('festival');
  const panelRef = useRef(null);

  // Add-engagement flow state.
  // addEngMode: false = day-details/planning; 'list'|'choose'|'push'|'email'|'whatsapp'|'saved'
  const [addEngMode, setAddEngMode] = useState(false);
  const [addEngStep, setAddEngStep] = useState('list');
  const [addEngChannel, setAddEngChannel] = useState(null);
  const [addEngTitle, setAddEngTitle] = useState('');
  const [addEngBody, setAddEngBody] = useState('');
  const [addEngSubject, setAddEngSubject] = useState('');
  const [addEngTemplateId, setAddEngTemplateId] = useState(null);
  const [addEngSendTime, setAddEngSendTime] = useState('10:00');
  const [addEngSaving, setAddEngSaving] = useState(false);
  const [addEngError, setAddEngError] = useState('');
  const [addEngBanner, setAddEngBanner] = useState('');
  const [addEngNewId, setAddEngNewId] = useState(null);

  // Drag-and-drop rescheduling state
  const [dragItem, setDragItem] = useState(null);
  const [dragOverDate, setDragOverDate] = useState(null);
  const [dragError, setDragError] = useState('');
  const [dragConfirm, setDragConfirm] = useState('');
  const [dragNewId, setDragNewId] = useState(null);
  // Race guard: if dragend fires before the deferred rAF runs, skip setDragItem.
  const dragEndedRef = useRef(false);

  const [emailTemplates, setEmailTemplates] = useState([]);
  const [emailTemplatesLoading, setEmailTemplatesLoading] = useState(false);
  const [emailTemplatesError, setEmailTemplatesError] = useState('');
  // Photo (push only)
  const [addEngMobileImageUrl, setAddEngMobileImageUrl] = useState('');
  const [addEngDesktopImageUrl, setAddEngDesktopImageUrl] = useState('');
  const [addEngPhotoError, setAddEngPhotoError] = useState('');
  const [addEngPreviewDevice, setAddEngPreviewDevice] = useState('mobile');
  // Audience
  const [addEngSegment, setAddEngSegment] = useState('everyone');
  // Email segment counts: { everyone: null|number, email_captured: null|number, … }
  // null = still loading, -1 = error
  const [emailSegmentCounts, setEmailSegmentCounts] = useState(null);
  const [pushSubscriberCount, setPushSubscriberCount] = useState(null);

  // Escape closes the panel (scoped: only active when a day is selected).
  useEffect(() => {
    if (!selectedDayStr) return;
    const onKey = (e) => { if (e.key === 'Escape') setSelectedDayStr(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedDayStr]);

  // On narrow screens (<1100px grid stacks), scroll the panel into view
  // when it first opens so the merchant doesn't have to scroll manually.
  useEffect(() => {
    if (selectedDayStr && panelRef.current && window.innerWidth < 1100) {
      panelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedDayStr]);

  // Refetch templates when the tab regains focus while the email step is open
  // (same pattern as CustomerDetail's visibilitychange handler).
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && addEngStep === 'email') {
        doFetchEmailTemplates();
      }
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [addEngStep]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleFestivalClick(dateStr) {
    setAddEngMode(false);
    if (selectedDayStr === dateStr && dayPanelTab === 'festival' && !addEngMode) {
      setSelectedDayStr(null);
    } else {
      setSelectedDayStr(dateStr);
      setDayPanelTab('festival');
    }
  }

  function handleNotificationsClick(dateStr) {
    setAddEngMode(false);
    if (selectedDayStr === dateStr && dayPanelTab === 'notifications' && !addEngMode) {
      setSelectedDayStr(null);
    } else {
      setSelectedDayStr(dateStr);
      setDayPanelTab('notifications');
    }
  }

  function handleDayCellClick(dateStr) {
    if (isPastDay(new Date(dateStr))) return;
    if (selectedDayStr === dateStr && addEngMode) {
      // Toggle off
      setSelectedDayStr(null);
      setAddEngMode(false);
      setAddEngStep('list');
      return;
    }
    setSelectedDayStr(dateStr);
    setAddEngMode('list');
    setAddEngStep('list');
    setAddEngBanner('');
    setAddEngNewId(null);
  }

  async function handleDrop(targetDateStr) {
    const item = dragItem;
    setDragItem(null);
    setDragOverDate(null);
    if (!item) return;

    const tz = quietSettings.timezone || 'Asia/Kolkata';
    const localDt = formatLocalDateTimeInput(item.scheduledAt, tz); // "YYYY-MM-DDTHH:mm"
    const sourceDateStr = localDt.split('T')[0];
    if (targetDateStr === sourceDateStr) return;

    const timeStr = localDt.split('T')[1];
    const newScheduledAt = `${targetDateStr}T${timeStr}`;

    // Optimistic: keep UTC time-of-day, change the date part
    const prevItems = festivalItems;
    const srcUtc = new Date(item.scheduledAt);
    const [ny, nm, nd] = targetDateStr.split('-').map(Number);
    const newUtcApprox = new Date(Date.UTC(ny, nm - 1, nd, srcUtc.getUTCHours(), srcUtc.getUTCMinutes(), srcUtc.getUTCSeconds()));
    setFestivalItems(prev => prev.map(i =>
      i._id === item._id ? { ...i, scheduledAt: newUtcApprox.toISOString() } : i
    ));
    setSelectedDayStr(targetDateStr);
    setDayPanelTab('notifications');
    setAddEngMode(false);

    try {
      await apiSend(
        `/api/queue/${encodeURIComponent(shop)}/festival/${item._id}`,
        'PATCH',
        { scheduledAt: newScheduledAt }
      );
      const data = await apiGet(`/api/queue/${encodeURIComponent(shop)}/festival`);
      setFestivalItems(data.items || []);
      setDragNewId(item._id);
      setTimeout(() => setDragNewId(null), 2000);
      const labelDate = new Date(ny, nm - 1, nd).toLocaleDateString('en-IN', {
        weekday: 'short', day: 'numeric', month: 'short',
      });
      setDragConfirm(`Moved to ${labelDate}`);
      setTimeout(() => setDragConfirm(''), 3000);
    } catch (e) {
      setFestivalItems(prevItems);
      setSelectedDayStr(null);
      setDragError(e.message || 'Could not reschedule. Please try again.');
      setTimeout(() => setDragError(''), 5000);
    }
  }

  function doFetchEmailTemplates() {
    setEmailTemplatesLoading(true);
    setEmailTemplatesError('');
    apiGet('/api/email-templates')
      .then(d => {
        const fresh = d?.templates || [];
        setEmailTemplates(fresh);
        setEmailTemplatesLoading(false);
        // Deselect if the selected template was removed
        setAddEngTemplateId(prev => (prev && !fresh.some(t => t._id === prev) ? null : prev));
      })
      .catch(() => { setEmailTemplatesError('Could not load templates.'); setEmailTemplatesLoading(false); });
  }

  function retryEmailTemplates() { doFetchEmailTemplates(); }

  function openAddEngStep(step, channel) {
    setAddEngStep(step);
    if (channel) {
      const channelChanged = channel !== addEngChannel;
      setAddEngChannel(channel);
      if (channel === 'push') {
        setAddEngSendTime('10:00');
        setAddEngSegment('everyone');
        // Fetch push subscriber count once per session.
        if (pushSubscriberCount === null) {
          apiGet(`/api/queue/${encodeURIComponent(shop)}/push-subscriber-count`)
            .then(d => setPushSubscriberCount(d))
            .catch(() => setPushSubscriberCount({ mobile: 0, desktop: 0, total: 0 }));
        }
      }
      if (channel === 'email') {
        setAddEngSendTime('18:00');
        setAddEngSegment('everyone');
        // Always refetch when email step opens (never cache a failed/empty result).
        doFetchEmailTemplates();
        // Fetch all segment counts in parallel, cache for session.
        if (!emailSegmentCounts) {
          const segs = ['everyone', 'email_captured', 'has_cart', 'bought_once', 'going_quiet'];
          const initial = Object.fromEntries(segs.map(s => [s, null]));
          setEmailSegmentCounts(initial);
          Promise.all(
            segs.map(s =>
              apiGet(`/api/email-templates/count?segment=${encodeURIComponent(s)}`)
                .then(d => ({ seg: s, count: typeof d.count === 'number' ? d.count : -1 }))
                .catch(() => ({ seg: s, count: -1 }))
            )
          ).then(results => {
            setEmailSegmentCounts(Object.fromEntries(results.map(r => [r.seg, r.count])));
          });
        }
      }
      if (channel === 'whatsapp') setAddEngSendTime('11:00');
      if (channelChanged) {
        setAddEngTitle('');
        setAddEngBody('');
        setAddEngSubject('');
        setAddEngTemplateId(null);
        setAddEngError('');
        setAddEngMobileImageUrl('');
        setAddEngDesktopImageUrl('');
        setAddEngPhotoError('');
        setAddEngPreviewDevice('mobile');
      }
    }
  }

  async function saveEngagement() {
    setAddEngSaving(true);
    setAddEngError('');
    try {
      const scheduledAt = `${selectedDayStr}T${addEngSendTime}`;
      const payload = { channel: addEngChannel, scheduledAt };
      if (addEngChannel === 'push') {
        payload.title = addEngTitle;
        payload.body = addEngBody;
        payload.mobileImageUrl = addEngMobileImageUrl || '';
        payload.desktopImageUrl = addEngDesktopImageUrl || '';
      } else if (addEngChannel === 'email') {
        payload.templateId = addEngTemplateId;
        payload.subject = addEngSubject;
        payload.segment = addEngSegment;
      } else {
        payload.body = addEngBody;
      }
      const result = await apiSend(
        `/api/queue/${encodeURIComponent(shop)}/festival`,
        'POST', payload
      );
      setAddEngNewId(result.id || null);
      // Refetch items
      const data = await apiGet(`/api/queue/${encodeURIComponent(shop)}/festival`);
      setFestivalItems(data.items || []);
      setAddEngBanner('Saved as a draft. It will not go out until you approve it below.');
      setAddEngStep('saved');
    } catch (e) {
      setAddEngError(e.message || 'Failed to save');
    } finally {
      setAddEngSaving(false);
    }
  }

  // Every OTHER document sharing this item's group — already available
  // from the same festivalItems list fetch, no new endpoint needed (see
  // audits/queue-multi-date-audit.txt section 2). Only computed when the
  // modal is actually open on a grouped item.
  const editMultiDateEmpty = editMultiDates !== null && editMultiDates.length === 0;
  const editGroupSiblings = (editingItem && editingItem.groupId)
    ? festivalItems
        .filter((i) => i.groupId === editingItem.groupId)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    : [];

  async function removeGroupSibling(siblingId) {
    if (!editingItem) return;
    if (!window.confirm('Remove this date from the campaign?')) return;
    setEditRemovingSibling(siblingId);
    try {
      await apiSend(`/api/queue/${encodeURIComponent(shop)}/festival/${siblingId}`, 'DELETE', {});
      setFestivalItems((prev) => prev.filter((i) => i._id !== siblingId));
    } catch (e) {
      alert('Failed to remove date');
    } finally {
      setEditRemovingSibling(null);
    }
  }

  function closeEditModal() {
    setEditingItem(null);
  }

  async function saveEdit() {
    if (!editingItem) return;
    setEditSaving(true);
    try {
      await apiSend(
        `/api/queue/${encodeURIComponent(shop)}/festival/${editingItem._id}`,
        'PATCH',
        {
          title: editTitle,
          body: editBody,
          mobileImageUrl: editMobileImageUrl,
          desktopImageUrl: editDesktopImageUrl,
          scheduledAt: editScheduledAt,
          targetType: editTargetType,
          productId: editProductId,
          productHandle: editProductHandle,
          productTitle: editProductTitle,
          ...(editingItem.groupId ? { applyToGroup: editApplyToGroup } : {}),
        }
      );

      // New dates added via MultiDateScheduler join this item's group —
      // its existing groupId if it has one, or a fresh group that folds
      // this (previously ungrouped) item in, so it isn't left as an
      // orphan outside the campaign it's now part of. See the backend's
      // joinGroupId/joinItemId handling in routes/queue.js.
      if (editMultiDates && editMultiDates.length > 0) {
        await apiSend(
          `/api/queue/${encodeURIComponent(shop)}/festival`,
          'POST',
          {
            title: editTitle,
            body: editBody,
            mobileImageUrl: editMobileImageUrl,
            desktopImageUrl: editDesktopImageUrl,
            scheduledAt: editMultiDates,
            festival: editingItem.festival,
            targetType: editTargetType,
            productId: editProductId,
            productHandle: editProductHandle,
            productTitle: editProductTitle,
            status: editingItem.status === 'approved' ? 'approved' : 'draft',
            ...(editingItem.groupId
              ? { joinGroupId: editingItem.groupId }
              : { joinItemId: editingItem._id }),
          }
        );
      }

      setEditingItem(null);
      // Refresh festivalItems so both the calendar and planning list show
      // the saved changes.
      apiGet(`/api/queue/${encodeURIComponent(shop)}/festival`)
        .then((data) => setFestivalItems(data.items || []))
        .catch(() => {});
    } catch (e) {
      alert('Failed to save changes');
    } finally {
      setEditSaving(false);
    }
  }

  async function sendNowJob(jobId) {
    setActionLoading(jobId);
    try {
      await apiSend(`/api/queue/${encodeURIComponent(shop)}/${jobId}/send-now`, 'POST', {});
      setActionResults((prev) => ({ ...prev, [jobId]: { success: true, msg: 'Queued!' } }));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionResults((prev) => ({ ...prev, [jobId]: { success: false, msg: 'Failed' } }));
    } finally {
      setActionLoading(null);
    }
  }

  async function cancelJob(jobId) {
    setActionLoading(jobId);
    try {
      await apiSend(`/api/queue/${encodeURIComponent(shop)}/${jobId}/cancel`, 'POST', {});
      setActionResults((prev) => ({ ...prev, [jobId]: { success: true, msg: 'Cancelled' } }));
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setActionResults((prev) => ({ ...prev, [jobId]: { success: false, msg: 'Failed' } }));
    } finally {
      setActionLoading(null);
    }
  }

  const from = total === 0 ? 0 : page * limit + 1;
  const to = Math.min((page + 1) * limit, total);

  return (
    <div
      style={{
        padding: isMobileView ? '20px 12px 32px' : '24px 20px 32px',
        maxWidth: '1400px',
        margin: '0 auto',
      }}
    >
      {/* PAGE HEADER */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f0f0f', margin: '0 0 4px', letterSpacing: '-0.3px' }}>
          Queue
        </h1>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
          Plan, schedule, and track your festival notifications before they go out.
        </p>
      </div>

      {/* TWO-COLUMN SPLIT — Calendar left, Planning list right.
          Side-by-side ≥1100px viewport; stacked below (ccf-queue-split
          media query at top of component). */}
      <div className="ccf-queue-split" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 20,
        alignItems: 'start',
      }}>

        {/* LEFT: Calendar column */}
        <div>
          {/* MONTH NAVIGATION */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 16, flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ fontSize: 19, fontWeight: 600, color: '#111827' }}>
              {currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => { setCurrentMonth(new Date()); setSelectedDayStr(null); }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                style={{
                  padding: '6px 14px', fontSize: 12, fontWeight: 600,
                  border: '1px solid #e5e7eb', borderRadius: 8,
                  background: '#fff', color: '#374151', cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                Today
              </button>
              <button
                aria-label="Previous month"
                onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1)); setSelectedDayStr(null); }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: '1px solid #e5e7eb',
                  background: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <button
                aria-label="Next month"
                onClick={() => { setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1)); setSelectedDayStr(null); }}
                onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: '1px solid #e5e7eb',
                  background: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#374151"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>
          </div>
          {/* CALENDAR */}
          {dragError && (
            <div style={{
              marginBottom: 8, padding: '8px 12px', borderRadius: 8,
              background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 500,
            }}>{dragError}</div>
          )}
          {dragConfirm && (
            <div style={{
              marginBottom: 8, padding: '8px 12px', borderRadius: 8,
              background: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 500,
            }}>{dragConfirm}</div>
          )}
          {festivalLoading ? (
            <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 40 }}>
              Loading...
            </div>
          ) : (
            <MonthCalendar
              month={currentMonth}
              items={festivalItems}
              festivals={festivalCalendar}
              selectedDayStr={selectedDayStr}
              selectedDayType={addEngMode ? 'add' : dayPanelTab}
              onFestivalClick={handleFestivalClick}
              onNotificationsClick={handleNotificationsClick}
              onDayCellClick={handleDayCellClick}
              isNarrow={isNarrowCal}
              dragItem={dragItem}
              dragOverDate={dragOverDate}
              onCellDragOver={setDragOverDate}
              onCellDragLeave={() => setDragOverDate(null)}
              onCellDrop={handleDrop}
            />
          )}
          {/* Legend */}
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', fontSize: 11, color: '#9ca3af' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#FFF3D6', border: '1px solid rgba(138,90,0,0.2)' }} />
              Festival
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#EAF0FD', border: '1px solid rgba(36,89,214,0.18)' }} />
              Scheduled engagement
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '1.5px dashed #d1d5db' }} />
              Click any upcoming date to add an engagement
            </span>
          </div>
        </div>

        {/* RIGHT: Details panel when a day is selected; planning list otherwise. */}
        <div ref={panelRef}>
          {addEngMode && selectedDayStr ? (
            <AddEngagementView
              dateStr={selectedDayStr}
              festivalItems={festivalItems}
              step={addEngStep}
              channel={addEngChannel}
              title={addEngTitle} setTitle={setAddEngTitle}
              body={addEngBody} setBody={setAddEngBody}
              subject={addEngSubject} setSubject={setAddEngSubject}
              templateId={addEngTemplateId} setTemplateId={setAddEngTemplateId}
              sendTime={addEngSendTime} setSendTime={setAddEngSendTime}
              saving={addEngSaving} error={addEngError}
              banner={addEngBanner} newId={addEngNewId}
              emailTemplates={emailTemplates}
              emailTemplatesLoading={emailTemplatesLoading}
              emailTemplatesError={emailTemplatesError}
              onRetryTemplates={retryEmailTemplates}
              manageTemplatesUrl={manageTemplatesUrl}
              mobileImageUrl={addEngMobileImageUrl} setMobileImageUrl={setAddEngMobileImageUrl}
              desktopImageUrl={addEngDesktopImageUrl} setDesktopImageUrl={setAddEngDesktopImageUrl}
              photoError={addEngPhotoError} setPhotoError={setAddEngPhotoError}
              previewDevice={addEngPreviewDevice} setPreviewDevice={setAddEngPreviewDevice}
              segment={addEngSegment} setSegment={setAddEngSegment}
              emailSegmentCounts={emailSegmentCounts}
              pushSubscriberCount={pushSubscriberCount}
              dragItem={dragItem}
              onCardDragStart={setDragItem}
              onCardDragEnd={() => { setDragItem(null); setDragOverDate(null); }}
              onBack={() => { setAddEngMode(false); setSelectedDayStr(null); }}
              onOpenStep={openAddEngStep}
              onSave={saveEngagement}
              onAddAnother={() => {
                setAddEngStep('choose');
                setAddEngChannel(null);
                setAddEngBanner('');
                setAddEngNewId(null);
              }}
              onDone={() => { setAddEngStep('list'); setAddEngBanner(''); setAddEngNewId(null); }}
            />
          ) : selectedDayStr ? (
            <DayDetailsPanel
              dateStr={selectedDayStr}
              dayPanelTab={dayPanelTab}
              setDayPanelTab={setDayPanelTab}
              festivalCalendar={festivalCalendar}
              festivalItems={festivalItems}
              onBack={() => setSelectedDayStr(null)}
              onAddEngagement={() => {
                setAddEngMode('list');
                setAddEngStep('list');
                setAddEngBanner('');
                setAddEngNewId(null);
              }}
              shop={shop}
              openEditModal={openEditModal}
              goToFestivalDetail={goToFestivalDetail}
              setFestivalItems={setFestivalItems}
              dragItem={dragItem}
              onCardDragStart={setDragItem}
              onCardDragEnd={() => { setDragItem(null); setDragOverDate(null); }}
              dragNewId={dragNewId}
            />
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ overflowY: 'auto', maxHeight: '70vh', padding: '12px 12px 4px' }}>
            {festivalLoading ? (
              <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 40 }}>
                Loading...
              </div>
            ) : festivalItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                <div style={{ fontSize: 32, opacity: 0.4, marginBottom: 8 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                  Nothing queued yet
                </div>
                <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>
                  Head to the Dashboard's Notification Suggestions to plan your first festival notification.
                </div>
              </div>
            ) : (
              groupFestivalItemsByDay(festivalItems).map((group) => (
                <div key={`${group.date.getFullYear()}-${group.date.getMonth()}-${group.date.getDate()}`}
                  style={{ marginBottom: 16 }}>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: '#9ca3af',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: 8, paddingLeft: 2,
                  }}>
                    {formatGroupHeading(group.date)}
                  </div>
                  <div style={{
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12,
                    overflow: 'hidden',
                  }}>
                    {group.items.map((item, ii) => {
                      const badge = FESTIVAL_STATUS_BADGE[item.status] || FESTIVAL_STATUS_BADGE.draft;
                      const isLastInGroup = ii === group.items.length - 1;
                      const planIsDraggable = (item.status === 'draft' || item.status === 'approved') && !item.sendClaimedAt;
                      const planIsBeingDragged = dragItem && dragItem._id === item._id;
                      return (
                        <div key={item._id}
                          draggable={planIsDraggable}
                          onDragStart={planIsDraggable ? e => {
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', item._id);
                            dragEndedRef.current = false;
                            requestAnimationFrame(() => {
                              if (!dragEndedRef.current) setDragItem(item);
                            });
                          } : undefined}
                          onDragEnd={planIsDraggable ? () => {
                            dragEndedRef.current = true;
                            setDragItem(null);
                            setDragOverDate(null);
                          } : undefined}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = '#f9fafb';
                            const actions = e.currentTarget.querySelector('[data-row-actions]');
                            if (actions) actions.style.opacity = '1';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = '#fff';
                            const actions = e.currentTarget.querySelector('[data-row-actions]');
                            if (actions) actions.style.opacity = '0.55';
                          }}
                          style={{
                            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                            borderBottom: isLastInGroup ? 'none' : '1px solid #f9fafb',
                            transition: 'background 0.12s',
                            opacity: planIsBeingDragged ? 0.4 : 1,
                            cursor: planIsDraggable ? 'grab' : undefined,
                          }}
                        >
                          {planIsDraggable && (
                            <div aria-label="Drag to move to another date" style={{
                              color: '#d1d5db', flexShrink: 0,
                              display: 'flex', alignItems: 'center',
                            }}>
                              <GripIcon size={14} />
                            </div>
                          )}
                          {(item.mobileImageUrl || item.desktopImageUrl) && (
                            <img
                              src={item.mobileImageUrl || item.desktopImageUrl}
                              alt=""
                              style={{
                                width: 32, height: 32, borderRadius: 8,
                                objectFit: 'cover', flexShrink: 0,
                              }}
                              onError={e => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 14, fontWeight: 600, color: '#111827',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                              {item.festival ? `${item.festival} · ` : ''}
                              {new Date(item.scheduledAt).toLocaleTimeString('en-IN', {
                                hour: 'numeric', minute: '2-digit', hour12: true,
                              })}
                            </div>
                            <div style={{
                              fontSize: 12, color: '#9ca3af', marginTop: 2,
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {item.targetType === 'product'
                                ? `→ ${item.productTitle || 'Product'}`
                                : '→ Storefront home'}
                            </div>
                          </div>
                          {item.channel && item.channel !== 'push' && (() => {
                            const CHIP = { email: { bg: '#ede9fe', color: '#6d28d9', label: 'Email' }, whatsapp: { bg: '#dcfce7', color: '#15803d', label: 'WhatsApp' } };
                            const c = CHIP[item.channel];
                            return c ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: c.bg, color: c.color, flexShrink: 0 }}>{c.label}</span> : null;
                          })()}
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                            background: badge.bg, color: badge.color, flexShrink: 0,
                            textDecoration: badge.strike ? 'line-through' : 'none',
                          }}>
                            {badge.label}
                          </span>
                          <div data-row-actions style={{
                            display: 'flex', gap: 6, flexShrink: 0,
                            opacity: 0.55, transition: 'opacity 0.15s',
                          }}>
                            {/* A 'sent' document is historical fact — never
                                editable or deletable (the backend now
                                rejects both with 409 regardless). "View"
                                is the only action, same detail page a
                                sent calendar chip already links to. */}
                            {item.status === 'sent' ? (
                              <button
                                onClick={() => goToFestivalDetail(item._id)}
                                style={{
                                  padding: '5px 10px', borderRadius: 6,
                                  border: '1px solid #e5e7eb', background: '#fff',
                                  color: '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                }}>View</button>
                            ) : (
                              <>
                                {item.status === 'draft' && !isPastDay(item.scheduledAt) && (
                                  <button
                                    onClick={async () => {
                                      await apiSend(
                                        `/api/queue/${encodeURIComponent(shop)}/festival/${item._id}`,
                                        'PATCH', { status: 'approved' }
                                      );
                                      setFestivalItems(prev => prev.map(i =>
                                        i._id === item._id ? {...i, status: 'approved'} : i
                                      ));
                                    }}
                                    style={{
                                      padding: '5px 10px', borderRadius: 6, border: 'none',
                                      background: '#4f46e5', color: '#fff', fontSize: 11,
                                      fontWeight: 600, cursor: 'pointer',
                                    }}>Approve</button>
                                )}
                                {(!item.channel || item.channel === 'push') && (
                                  <button
                                    onClick={() => openEditModal(item)}
                                    style={{
                                      padding: '5px 10px', borderRadius: 6,
                                      border: '1px solid #e5e7eb', background: '#fff',
                                      color: '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    }}>Edit</button>
                                )}
                                <button
                                  onClick={async () => {
                                    await apiSend(
                                      `/api/queue/${encodeURIComponent(shop)}/festival/${item._id}`,
                                      'DELETE', {}
                                    );
                                    setFestivalItems(prev => prev.filter(i => i._id !== item._id));
                                  }}
                                  style={{
                                    padding: '5px 10px', borderRadius: 6,
                                    border: '1px solid #fee2e2', background: '#fff',
                                    color: '#dc2626', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                  }}>Delete</button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
            </div>
          )}
        </div>
      </div>

      {/* SENT NOTIFICATIONS — the pre-existing ScheduledJob-based
          list (filter tabs, stats row, table/card list, pagination),
          preserved exactly as it was, now wrapped in a collapsible
          section that defaults to collapsed. */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={() => setSentNotifsOpen(o => !o)}
          onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: '12px 16px', borderRadius: 10,
            border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
            Sent Notifications
          </span>
          <span style={{ fontSize: 13, color: '#9ca3af' }}>
            {sentNotifsOpen ? '▲ Hide' : '▼ Show'}
          </span>
        </button>

        {sentNotifsOpen && (
          <div style={{ marginTop: 16 }}>
            {/* HEADER (Refresh button only — title/subtitle moved up top) */}
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e7eb',
                  background: '#fff', color: '#374151', fontSize: 13,
                  fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                  strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/>
                  <polyline points="1 20 1 14 7 14"/>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36
                    A9 9 0 0 0 20.49 15"/>
                </svg>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {/* STATUS FILTER TABS */}
            <div style={{
              display: 'flex', gap: '8px', marginBottom: '16px',
              overflowX: 'auto', paddingBottom: '4px',
            }}>
              {STATUS_FILTERS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    padding: '6px 14px', fontSize: '13px',
                    fontWeight: statusFilter === tab.key ? '600' : '400',
                    color: statusFilter === tab.key ? '#111827' : '#6b7280',
                    background: statusFilter === tab.key ? '#fff' : 'transparent',
                    border: '1px solid',
                    borderColor: statusFilter === tab.key ? '#e5e7eb' : 'transparent',
                    borderRadius: '20px', cursor: 'pointer',
                    flexShrink: 0, whiteSpace: 'nowrap',
                    boxShadow: statusFilter === tab.key ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* STATS ROW — compact inline bar (see
                audits/queue-stats-compact-audit.txt). NOTE: the task
                assumed a `stats` object with stats.pending/stats.sent;
                the actual state holding these counts in this file is
                `statusCounts` (keyed by status string, populated by the
                STATS_STATUSES effect above) — adapted accordingly. */}
            <div style={{
              display: 'flex',
              gap: 24,
              padding: '12px 0',
              marginBottom: 16,
              borderBottom: '1px solid #f3f4f6',
            }}>
              {[
                { label: 'Pending', value: statusCounts.pending, color: '#f59e0b' },
                { label: 'Sent', value: statusCounts.sent, color: '#16a34a' },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ display: 'flex',
                                          alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color }}>
                    {value ?? '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 500 }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>

            {/* TABLE / CARD LIST */}
            <div style={{
              background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px',
              overflow: 'hidden',
            }}>
              {/* Table header — desktop only */}
              {!isMobileView && (
                <div style={{
                  display: 'grid', gridTemplateColumns: GRID_COLS,
                  padding: '10px 16px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6',
                }}>
                  {['Customer', 'Signal', 'Channel', 'Scheduled', 'Status', 'Actions'].map((h) => (
                    <div key={h} style={{
                      fontSize: '11px', fontWeight: '600', color: '#9ca3af',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>{h}</div>
                  ))}
                </div>
              )}

              {/* Rows */}
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <ShimmerCard key={i} />
                ))
              ) : jobs.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#9ca3af', fontSize: '14px' }}>
                  No jobs in the queue.
                </div>
              ) : (
                jobs.map((job, i) => {
                  const channelBadge = CHANNEL_BADGE[job.channel] || CHANNEL_BADGE.push;
                  const statusBadge = STATUS_BADGE[job.status] || STATUS_BADGE.skipped;
                  const isPending = job.status === 'pending';
                  const isActing = actionLoading === job._id;
                  const result = actionResults[job._id];

                  const channelEl = (
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                      fontSize: '12px', fontWeight: '500',
                      background: channelBadge.bg, color: channelBadge.color,
                    }}>
                      {channelBadge.label}
                    </span>
                  );

                  // Customer column — email when available, else a stable
                  // "Subscriber #XXXXXX" derived from the profile id, else
                  // "Anonymous" when there's no profileId at all (see
                  // getCustomerLabel()), plus a small channel-type indicator.
                  const customerEl = (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                        {getCustomerLabel(job)}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2,
                                    display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: job.channel === 'push' ? '#3b82f6' : '#8b5cf6',
                          flexShrink: 0
                        }} />
                        {job.channel === 'push' ? 'Push subscriber' : 'Email subscriber'}
                      </div>
                    </div>
                  );

                  const statusEl = (
                    <span style={{
                      display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
                      fontSize: '12px', fontWeight: '500',
                      background: statusBadge.bg, color: statusBadge.color,
                    }}>
                      {formatSignal(job.status)}
                    </span>
                  );

                  const actionsEl = isPending ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {result && (
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: result.success ? '#16a34a' : '#dc2626',
                        }}>
                          {result.msg}
                        </span>
                      )}
                      <button
                        onClick={() => sendNowJob(job._id)}
                        disabled={isActing}
                        style={{
                          padding: '5px 10px', fontSize: '11px', fontWeight: '600',
                          color: '#fff', background: isActing ? '#9ca3af' : '#4f46e5',
                          border: 'none', borderRadius: '6px',
                          cursor: isActing ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Send now
                      </button>
                      <button
                        onClick={() => cancelJob(job._id)}
                        disabled={isActing}
                        style={{
                          padding: '5px 10px', fontSize: '11px', fontWeight: '600',
                          color: '#dc2626', background: '#fff',
                          border: '1px solid #fecaca', borderRadius: '6px',
                          cursor: isActing ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#d1d5db' }}>—</span>
                  );

                  if (isMobileView) {
                    return (
                      <div key={job._id} style={{
                        padding: '14px 16px',
                        borderBottom: i < jobs.length - 1 ? '1px solid #f9fafb' : 'none',
                      }}>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                          marginBottom: '6px',
                        }}>
                          {customerEl}
                          {statusEl}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                          {formatSignal(job.signalType)} · {channelEl}
                        </div>
                        <div style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          fontSize: '12px', color: '#9ca3af', marginBottom: '8px',
                        }}>
                          {formatDateTime(job.runAt)}
                        </div>
                        {actionsEl}
                      </div>
                    );
                  }

                  return (
                    <div key={job._id} style={{
                      display: 'grid', gridTemplateColumns: GRID_COLS,
                      padding: '12px 16px', alignItems: 'center',
                      borderBottom: i < jobs.length - 1 ? '1px solid #f9fafb' : 'none',
                    }}>
                      {customerEl}
                      <div style={{ fontSize: '13px', color: '#374151' }}>{formatSignal(job.signalType)}</div>
                      <div>{channelEl}</div>
                      <div style={{ fontSize: '13px', color: '#374151' }}>{formatDateTime(job.runAt)}</div>
                      <div>{statusEl}</div>
                      <div>{actionsEl}</div>
                    </div>
                  );
                })
              )}
            </div>

            {/* PAGINATION */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginTop: '16px',
            }}>
              <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                {total > 0 ? `Showing ${from}-${to} of ${total}` : 'Showing 0 of 0'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0 || loading}
                  style={{
                    padding: '6px 14px', fontSize: '13px', fontWeight: '600',
                    color: page === 0 ? '#d1d5db' : '#374151',
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
                    cursor: page === 0 || loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={to >= total || loading}
                  style={{
                    padding: '6px 14px', fontSize: '13px', fontWeight: '600',
                    color: to >= total ? '#d1d5db' : '#374151',
                    background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px',
                    cursor: to >= total || loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal — mirrors the Dashboard editor's structure (read-only
          festival header, editable title/body/images/date, Save/Cancel),
          minus the live phone/desktop preview panel, which wasn't part
          of this task's spec. Widened to ~560px and the festival header
          moved onto its own tinted strip, visually distinct from the
          editable fields below it. */}
      {editingItem && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20,
        }}
          onClick={e => { if (e.target === e.currentTarget) closeEditModal(); }}
        >
          <div style={{
            background: '#fff', borderRadius: 16,
            width: '100%', maxWidth: 560,
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column',
            maxHeight: '90vh', overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #f3f4f6',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexShrink: 0,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                Edit Notification
              </div>
              <button onClick={closeEditModal}
                style={{ background: 'none', border: 'none',
                         fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>
                ✕
              </button>
            </div>

            {/* Festival header — thumbnail + name + date, read only, on
                a tinted strip so it reads as context, not an editable
                field. */}
            {(() => {
              const meta = festivalCalendar.find(f => f.name === editingItem.festival);
              return (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '16px 20px', background: '#f9fafb',
                  borderBottom: '1px solid #f3f4f6', flexShrink: 0,
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: '#fff', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, flexShrink: 0, overflow: 'hidden',
                    border: '1px solid #f3f4f6',
                  }}>
                    {meta?.imageUrl ? (
                      <>
                        <img
                          src={meta.imageUrl}
                          alt=""
                          style={{
                            width: '100%', height: '100%',
                            borderRadius: '50%', objectFit: 'cover',
                          }}
                          onError={e => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = 'flex';
                            }
                          }}
                        />
                        <span style={{
                          display: 'none', alignItems: 'center',
                          justifyContent: 'center', width: '100%', height: '100%',
                        }}>
                          {meta?.emoji || '📢'}
                        </span>
                      </>
                    ) : (
                      meta?.emoji || '📢'
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                      {editingItem.festival || 'Notification'}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      {meta
                        ? formatFestivalDate(meta.date)
                        : new Date(editingItem.scheduledAt).toLocaleDateString('en-IN', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                          })}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Editable fields — scrollable if the modal runs out of
                vertical room. */}
            <div style={{ padding: 20, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {/* Title */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600,
                                color: '#374151', display: 'block',
                                marginBottom: 6 }}>
                  Notification Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px',
                           borderRadius: 8, border: '1px solid #e5e7eb',
                           fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>

              {/* Body */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600,
                                color: '#374151', display: 'block',
                                marginBottom: 6 }}>
                  Message
                </label>
                <textarea
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  rows={4}
                  style={{ width: '100%', padding: '8px 12px',
                           borderRadius: 8, border: '1px solid #e5e7eb',
                           fontSize: 13, resize: 'vertical',
                           fontFamily: 'inherit', boxSizing: 'border-box' }}
                />
              </div>

              {/* Where the notification click-through goes — home page
                  or a specific product. */}
              <ProductPicker
                shop={shop}
                value={{
                  targetType: editTargetType,
                  productId: editProductId,
                  productHandle: editProductHandle,
                  productTitle: editProductTitle,
                }}
                onChange={(next) => {
                  setEditTargetType(next.targetType);
                  setEditProductId(next.productId);
                  setEditProductHandle(next.productHandle);
                  setEditProductTitle(next.productTitle);
                }}
              />

              {/* Mobile Image + Desktop Image — shared widget, same as
                  the Dashboard editor. Side by side on desktop; the
                  component's own internal grid stacks under 600px via a
                  media query QueueScreen injects (see the top of this
                  file) — ImageUploadPair's props are unchanged. */}
              <div style={{ marginBottom: 16 }}>
                <ImageUploadPair
                  mobileImageUrl={editMobileImageUrl}
                  desktopImageUrl={editDesktopImageUrl}
                  onMobileChange={setEditMobileImageUrl}
                  onDesktopChange={setEditDesktopImageUrl}
                />
              </div>

              {/* Scheduled date — entered and displayed in the STORE's
                  timezone (never UTC, never the browser's local zone). See
                  formatLocalDateTimeInput in QuietHoursWarning.jsx. */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600,
                                color: '#374151', display: 'block',
                                marginBottom: 6 }}>
                  Schedule Date & Time ({quietSettings.timezone || 'Asia/Kolkata'})
                </label>
                <input
                  type="datetime-local"
                  value={formatLocalDateTimeInput(editScheduledAt, quietSettings.timezone)}
                  onChange={e => setEditScheduledAt(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px',
                           borderRadius: 8, border: '1px solid #e5e7eb',
                           fontSize: 13, boxSizing: 'border-box' }}
                />
                <QuietHoursWarning value={editScheduledAt} settings={quietSettings} />
              </div>

              {/* Dates already in this item's campaign — pulled from the
                  same festivalItems list fetch already in memory, no new
                  endpoint (audits/queue-multi-date-audit.txt section 2).
                  Only the currently-edited row and 'sent' rows are
                  non-removable; a 'sent' document is never deleted here. */}
              {editGroupSiblings.length > 1 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                    Dates in this campaign ({editGroupSiblings.length})
                  </div>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                    {editGroupSiblings.map((sibling, i) => {
                      const isCurrent = sibling._id === editingItem._id;
                      const isSent = sibling.status === 'sent';
                      return (
                        <div key={sibling._id} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '8px 10px', fontSize: 12,
                          background: isCurrent ? '#eef2ff' : '#fff',
                          borderBottom: i < editGroupSiblings.length - 1 ? '1px solid #f3f4f6' : 'none',
                        }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                            background: isSent ? '#dbeafe' : '#dcfce7',
                            color: isSent ? '#2563eb' : '#16a34a',
                          }}>{isSent ? 'Sent' : 'Pending'}</span>
                          <span style={{ flex: 1, color: '#374151' }}>
                            {new Date(sibling.scheduledAt).toLocaleString('en-IN', {
                              day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                            })}
                            {isCurrent && <span style={{ color: '#4f46e5', fontWeight: 600 }}> (editing)</span>}
                          </span>
                          {!isCurrent && !isSent && (
                            <button
                              type="button"
                              onClick={() => removeGroupSibling(sibling._id)}
                              disabled={editRemovingSibling === sibling._id}
                              style={{
                                padding: '3px 9px', borderRadius: 6, border: '1px solid #e5e7eb',
                                background: '#fff', color: '#dc2626', fontSize: 11, cursor: 'pointer',
                              }}
                            >{editRemovingSibling === sibling._id ? 'Removing…' : 'Remove'}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add more dates to this campaign — shared with
                  DashboardScreen.jsx's festival editor (frontend/app/
                  admin/components/MultiDateScheduler.jsx). Keyed on
                  editingItem._id so it resets whenever a different item
                  is opened for editing. */}
              <MultiDateScheduler
                key={editingItem._id}
                firstDate=""
                timezone={quietSettings.timezone}
                onDatesChange={setEditMultiDates}
                individualHint="Add more dates to this campaign — they'll join the dates listed above."
              />

              {/* Only shown for a date that belongs to a multi-date
                  campaign (audits/multi-date-festival-audit.txt design
                  (a)). Defaults unchecked — this-date-only, today's
                  behaviour — every time the modal is opened
                  (openEditModal resets it). Never touches scheduledAt or
                  status on siblings, and never touches a sibling that
                  already sent — see the PATCH handler's applyToGroup
                  handling in routes/queue.js. */}
              {editingItem.groupId && (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
                  fontSize: 12, color: '#374151', cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={editApplyToGroup}
                    onChange={e => setEditApplyToGroup(e.target.checked)}
                  />
                  Apply title/body/image changes to all remaining dates in this campaign
                  <span style={{ color: '#9ca3af' }}>(not yet sent — this date's own schedule is unaffected)</span>
                </label>
              )}
            </div>

            {/* Footer — right-aligned, separated by a 1px divider */}
            <div style={{
              padding: '16px 20px', borderTop: '1px solid #f3f4f6',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
              flexShrink: 0,
            }}>
              <button
                onClick={closeEditModal}
                disabled={editSaving}
                style={{
                  padding: '10px 20px', borderRadius: 8,
                  border: '1px solid #e5e7eb', background: '#fff',
                  color: '#374151', fontSize: 13, fontWeight: 700,
                  cursor: editSaving ? 'not-allowed' : 'pointer',
                }}>
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || editMultiDateEmpty}
                style={{
                  padding: '10px 20px', borderRadius: 8,
                  border: 'none',
                  background: (editSaving || editMultiDateEmpty) ? '#818cf8' : '#4f46e5',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: (editSaving || editMultiDateEmpty) ? 'not-allowed' : 'pointer',
                  opacity: editMultiDateEmpty ? 0.6 : 1,
                }}>
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
