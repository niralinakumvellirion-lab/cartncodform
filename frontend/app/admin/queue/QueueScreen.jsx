'use client';

import { useState, useEffect, useRef } from 'react';
import { apiGet, apiSend } from '../../../lib/api';
import { ShimmerCard } from '../components/Shimmer';
import { ImageUploadPair } from '../components/ImageUploadPair';
import { ProductPicker } from '../components/ProductPicker';

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
const MAX_CHIPS_PER_DAY = 2;

// MonthCalendar — renders one month grid, now a complete 6x7-capable
// grid with dimmed leading/trailing days from adjacent months (purely
// visual — those dimmed cells show only a day number, no festival/queue
// matching against their real month, keeping this presentation-only).
// `onItemClick` is a new prop (this component is local to this file,
// not a shared/exported one, so this isn't touching any external API) —
// wires the existing openEditModal() into the previously-inert chips.
function MonthCalendar({ month, items, festivals, onItemClick }) {
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

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1,
      background: '#e5e7eb', border: '1px solid #e5e7eb',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
        <div key={d} style={{
          background: '#f9fafb', padding: '8px 0',
          textAlign: 'center', fontSize: 10,
          fontWeight: 700, color: '#9ca3af',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>{d}</div>
      ))}
      {cells.map((cell, i) => {
        if (cell.outside) {
          return (
            <div key={i} style={{
              background: '#fbfbfc', minHeight: 90, padding: 6,
            }}>
              <div style={{ fontSize: 12, color: '#d1d5db' }}>{cell.day}</div>
            </div>
          );
        }

        const day = cell.day;
        const dateStr = `${year}-${String(mon+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday = todayReal.toDateString() ===
          new Date(year, mon, day).toDateString();
        const festival = festivals.find(f => f.date.startsWith(dateStr));
        const queued = items.filter(item => {
          const d = new Date(item.scheduledAt);
          return d.getFullYear() === year &&
                 d.getMonth() === mon &&
                 d.getDate() === day;
        });
        const visibleChips = queued.slice(0, MAX_CHIPS_PER_DAY);
        const extraCount = queued.length - MAX_CHIPS_PER_DAY;

        return (
          <div key={i}
            onMouseEnter={e => { if (!isToday) e.currentTarget.style.background = '#f9fafb'; }}
            onMouseLeave={e => { e.currentTarget.style.background = isToday ? '#eef2ff' : '#fff'; }}
            style={{
              background: isToday ? '#eef2ff' : '#fff',
              minHeight: 90, padding: 6, position: 'relative',
              boxShadow: isToday ? 'inset 0 0 0 1.5px #4f46e5' : 'none',
              transition: 'background 0.12s',
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: '50%',
              background: isToday ? '#4f46e5' : 'transparent',
              color: isToday ? '#fff' : '#111827',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: isToday ? 700 : 400, marginBottom: 4,
            }}>{day}</div>
            {festival && (
              <div style={{
                fontSize: 10, background: '#fef3c7', color: '#d97706',
                borderRadius: 5, padding: '2px 5px', marginBottom: 2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontWeight: 600,
              }}>{festival.emoji} {festival.name}</div>
            )}
            {visibleChips.map(q => (
              <div key={q._id}
                onClick={() => onItemClick && onItemClick(q)}
                style={{
                  fontSize: 11,
                  background: q.status === 'approved' ? '#dcfce7' : '#dbeafe',
                  color: q.status === 'approved' ? '#16a34a' : '#2563eb',
                  borderRadius: 5, padding: '2px 5px', marginBottom: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  cursor: 'pointer', fontWeight: 600,
                }}>{q.title}</div>
            ))}
            {extraCount > 0 && (
              <div style={{ fontSize: 10, color: '#9ca3af', padding: '1px 5px', fontWeight: 600 }}>
                +{extraCount} more
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function QueueScreen({ shop }) {
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
      }
    `;
    document.head.appendChild(s);
  }

  const [isMobileView, setIsMobileView] = useState(false);
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth <= 768);
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
  const [queueTab, setQueueTab] = useState('calendar');
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
        }
      );
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
        maxWidth: '1100px',
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

      {/* TABS: Calendar | Planning List — segmented control, same pill
          pattern as the Dashboard's own DATE_FILTERS switcher. */}
      <div style={{
        display: 'inline-flex', gap: 4, padding: 4,
        background: '#f3f4f6', borderRadius: 10, marginBottom: 24,
      }}>
        {[
          { key: 'calendar', label: 'Calendar' },
          { key: 'planning', label: 'Planning List' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setQueueTab(tab.key)}
            style={{
              padding: '8px 18px', minHeight: 36, fontSize: 13, fontWeight: 600,
              border: 'none', borderRadius: 7, cursor: 'pointer',
              background: queueTab === tab.key ? '#4f46e5' : 'transparent',
              color: queueTab === tab.key ? '#fff' : '#6b7280',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* MONTH NAVIGATION — calendar tab only. Prev/next/Today handlers
          not given verbatim by the task; Today jumps to new Date(), the
          same seed value currentMonth starts from. */}
      {queueTab === 'calendar' && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16, flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ fontSize: 19, fontWeight: 600, color: '#111827' }}>
            {currentMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setCurrentMonth(new Date())}
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
              onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
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
              onClick={() => setCurrentMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
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
      )}

      {/* CONTENT AREA */}
      {queueTab === 'calendar' ? (
        festivalLoading ? (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 40 }}>
            Loading...
          </div>
        ) : (
          <MonthCalendar
            month={currentMonth}
            items={festivalItems}
            festivals={festivalCalendar}
            onItemClick={openEditModal}
          />
        )
      ) : (
        <div>
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
                style={{ marginBottom: 20 }}>
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
                    return (
                      <div key={item._id}
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
                        }}
                      >
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
                          {item.status === 'draft' && (
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
                          <button
                            onClick={() => openEditModal(item)}
                            style={{
                              padding: '5px 10px', borderRadius: 6,
                              border: '1px solid #e5e7eb', background: '#fff',
                              color: '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                            }}>Edit</button>
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

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

              {/* Scheduled date */}
              <div>
                <label style={{ fontSize: 12, fontWeight: 600,
                                color: '#374151', display: 'block',
                                marginBottom: 6 }}>
                  Schedule Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={editScheduledAt ?
                    new Date(editScheduledAt).toISOString().slice(0,16) : ''}
                  onChange={e => setEditScheduledAt(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px',
                           borderRadius: 8, border: '1px solid #e5e7eb',
                           fontSize: 13, boxSizing: 'border-box' }}
                />
              </div>
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
                disabled={editSaving}
                style={{
                  padding: '10px 20px', borderRadius: 8,
                  border: 'none', background: editSaving ? '#818cf8' : '#4f46e5',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: editSaving ? 'not-allowed' : 'pointer',
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
