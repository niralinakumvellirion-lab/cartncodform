'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiGet, apiSend } from '../../../lib/api';
import QuietHoursWarning, { useQuietHoursSettings, formatLocalDateTimeInput } from '../components/QuietHoursWarning';
import { ShimmerRow, ShimmerCard } from '../components/Shimmer';
import { ImageUploadPair } from '../components/ImageUploadPair';
import { ProductPicker } from '../components/ProductPicker';
import MultiDateScheduler from '../components/MultiDateScheduler';
import DateRangeFilter, { DATE_FILTERS, getDateRange } from '../components/DateRangeFilter';

const DS = {
  page: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '24px 20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  card: {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '20px 24px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    marginBottom: 16,
  },
  cardFlat: {
    background: '#ffffff',
    border: '1px solid #f0f0f0',
    borderRadius: 14,
    padding: '20px 24px',
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: '#0f0f0f',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  pageSubtitle: {
    fontSize: 13,
    color: '#9ca3af',
    margin: '4px 0 0',
    fontWeight: 400,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 10,
  },
  primary: '#4f46e5',
  primaryLight: '#eef2ff',
  success: '#16a34a',
  successLight: '#dcfce7',
  warning: '#d97706',
  warningLight: '#fef3c7',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray200: '#e5e7eb',
  gray400: '#9ca3af',
  gray600: '#4b5563',
  gray900: '#111827',
  btnPrimary: {
    background: '#4f46e5',
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f3f4f6',
    color: '#374151',
    border: '1px solid #e5e7eb',
    borderRadius: 9,
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

const CAL_MONTHS = ['January','February','March','April','May','June',
                    'July','August','September','October','November','December'];
const CAL_DAYS = ['SU','MO','TU','WE','TH','FR','SA'];

function getCustomRange(from, to) {
  if (!from || !to) return { from: null, to: null };
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return {
    from: new Date(fy, fm - 1, fd, 0, 0, 0, 0).toISOString(),
    to:   new Date(ty, tm - 1, td, 23, 59, 59, 999).toISOString(),
  };
}

function SidebarCalendar({ from, to, onRangeSelect, onClear }) {
  const [viewYear, setViewYear]   = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [pendingFrom, setPendingFrom] = useState(null);

  const todayISO = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  })();

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate();

  function dayISO(d) {
    return `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  function handleDayClick(iso) {
    if (pendingFrom === null) {
      setPendingFrom(iso);
    } else {
      const f = iso < pendingFrom ? iso : pendingFrom;
      const t = iso < pendingFrom ? pendingFrom : iso;
      setPendingFrom(null);
      onRangeSelect(f, t);
    }
  }

  const displayFrom = pendingFrom || from;
  const displayTo   = pendingFrom ? null : to;

  function formatField(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  const accent      = '#4f46e5';
  const accentLight = '#eef2ff';

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 10 }}>
        Custom Range
      </div>

      {/* From / To read-only fields */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[{ label: 'From', val: formatField(displayFrom) },
          { label: 'To',   val: formatField(displayTo)   }].map(({ label, val }) => (
          <div key={label} style={{
            flex: 1, minWidth: 0,
            background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 8px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af',
                          textTransform: 'uppercase', marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ flex: 1, fontSize: 12, color: val ? '#111827' : '#d1d5db',
                             fontWeight: val ? 500 : 400, whiteSpace: 'nowrap',
                             overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {val || '—'}
              </span>
              {val && (
                <button
                  type="button"
                  aria-label={`Clear ${label}`}
                  onClick={(e) => { e.stopPropagation(); setPendingFrom(null); onClear(); }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                           color: '#9ca3af', fontSize: 14, lineHeight: 1,
                           padding: '0 2px', flexShrink: 0 }}
                >×</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <button type="button" onClick={prevMonth} aria-label="Previous month"
          style={{ background: 'none', border: 'none', cursor: 'pointer',
                   color: '#6b7280', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>
          ‹
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
          {CAL_MONTHS[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} aria-label="Next month"
          style={{ background: 'none', border: 'none', cursor: 'pointer',
                   color: '#6b7280', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}>
          ›
        </button>
      </div>

      {/* Weekday headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 2 }}>
        {CAL_DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 600,
                                color: '#9ca3af', padding: '3px 0' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
        {Array.from({ length: firstDayOfWeek }).map((_, i) => (
          <div key={`p${i}`} style={{ aspectRatio: '1' }} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
          const iso  = dayISO(d);
          const isF  = iso === displayFrom;
          const isT  = iso === displayTo;
          const inR  = !!displayFrom && !!displayTo && iso > displayFrom && iso < displayTo;
          const isTod = iso === todayISO;
          return (
            <button
              key={iso}
              type="button"
              aria-label={new Date(viewYear, viewMonth, d).toLocaleDateString('en-IN', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
              onClick={() => handleDayClick(iso)}
              style={{
                aspectRatio: '1', width: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: (isF || isT || isTod) ? 700 : 400,
                border: (isTod && !isF && !isT) ? `1px solid ${accent}` : 'none',
                borderRadius: 6,
                background: (isF || isT) ? accent : inR ? accentLight : 'transparent',
                color: (isF || isT) ? '#fff' : isTod ? accent : '#374151',
                cursor: 'pointer', padding: 0, boxSizing: 'border-box',
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'flex-start' }}>
        <div>
          <h1 style={DS.pageTitle}>{title}</h1>
          {subtitle && (
            <p style={DS.pageSubtitle}>{subtitle}</p>
          )}
        </div>
        {action && (
          <div style={{ flexShrink: 0, marginTop: 2 }}>{action}</div>
        )}
      </div>
      <div style={{ height: 3, background: 'linear-gradient(90deg, #4f46e5, #818cf8)',
                    borderRadius: 2, marginTop: 12, width: 48 }} />
    </div>
  );
}

// --- from Insights.jsx ---
const SORT_TABS = [
  { key: 'views', label: 'Views' },
  { key: 'avgDwell', label: 'Time on page' },
  { key: 'cartRate', label: 'Cart rate' },
];

// DATE_FILTERS and getDateRange are imported from ../components/DateRangeFilter

const NOTIF_STATS = [
  { key: 'pushSent', label: 'Push Sent' },
  { key: 'emailsSent', label: 'Emails Sent' },
  { key: 'popupsShown', label: 'Popups Shown' },
  { key: 'emailsCaptured', label: 'Emails Captured' },
  { key: 'pushSubscribers', label: 'Push Subscribers' },
];

const ACTIVITY_STATS = [
  { key: 'add_to_cart', label: 'Added to Cart' },
  { key: 'checkout_start', label: 'Started Checkout' },
  { key: 'purchase', label: 'Purchased' },
  { key: 'revisit', label: 'Revisited' },
];


const SIGNAL_LABELS = {
  cart_abandon: 'Cart left behind',
  checkout_abandon: 'Reached checkout',
  browse_abandon: "Looked, didn't add",
  high_intent: 'Keeps coming back',
  price_hesitation: 'Stopped at the price',
  price_drop: 'Price dropped on a saved item',
  back_in_stock: 'Back in stock',
  post_purchase_d3: 'Three days after buying',
  lapsing: 'Going quiet',
  email_capture: 'Ask for an email',
  cod_to_prepaid: 'Offer prepaid on COD',
  winback: 'Win back',
};

// Used only if the /api/push/festivals fetch fails — see the
// festivalCalendar state + useEffect in DashboardScreen below. The
// canonical, image-enriched copy lives in backend/data/festivals.json.
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

function getUpcomingFestivals(festivals, count) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return festivals
    .map(f => {
      // Parse as LOCAL midnight (not UTC) so diffDays doesn't shift by a
      // day in timezones behind UTC — new Date('YYYY-MM-DD') parses as
      // UTC midnight, which used to be diffed against local-midnight today.
      const parts = f.date.split('-');
      const fDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const diffMs = fDate - today;
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return { ...f, diffDays, fDate };
    })
    .filter(f => f.diffDays >= 0 && f.diffDays <= 60)
    .sort((a, b) => a.diffDays - b.diffDays)
    .slice(0, count);
}

function formatRelativeDate(diffDays) {
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 13) return `In ${diffDays} days`;
  const weeks = Math.round(diffDays / 7);
  return `In ${weeks} week${weeks === 1 ? '' : 's'}`;
}

// Parsed as LOCAL midnight (see getUpcomingFestivals) so the displayed
// date always matches the day the merchant picked, regardless of timezone.
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

// Popups Shown drill-down — a slide-out panel rather than a navigation,
// since there's no existing screen that lists raw StorefrontEvent rows
// (audits/dashboard-kpi-drilldown-audit.txt section 3). customerId is
// shown exactly as the backend returned it — only present on an event
// that already carried one; never resolved/joined to an email here.
function PopupsShownPanel({ shop, from, to, open, onClose }) {
  const [events, setEvents] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const limit = 20;

  useEffect(() => { if (open) setPage(0); }, [open, from, to]);

  useEffect(() => {
    if (!open || !shop) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    apiGet(
      `/api/profiles/${encodeURIComponent(shop)}/popups-shown?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&page=${page}&limit=${limit}`
    )
      .then((data) => {
        if (cancelled) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
        setTotal(Number.isFinite(data.total) ? data.total : 0);
      })
      .catch((e) => { if (!cancelled) setError(e.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, shop, from, to, page]);

  // Esc closes — the only keyboard affordance a slide-out panel needs
  // beyond its own focusable Close button.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Popups Shown"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, maxWidth: '100vw',
          background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)', zIndex: 51,
          display: 'flex', flexDirection: 'column', padding: 20, overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111827', margin: 0 }}>Popups Shown</h2>
          <button
            type="button" onClick={onClose} aria-label="Close"
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#6b7280', lineHeight: 1 }}
          >×</button>
        </div>

        {loading ? (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 32 }}>Loading…</div>
        ) : error ? (
          <div style={{ color: '#b91c1c', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{error}</span>
            <button type="button" onClick={() => setPage((p) => p)} style={{
              background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 12px',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', color: '#374151',
            }}>Retry</button>
          </div>
        ) : events.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 32 }}>
            No popups shown in this range.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>{total} total</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {events.map((e, i) => (
                <div key={i} style={{ padding: '10px 12px', border: '1px solid #f3f4f6', borderRadius: 8, fontSize: 13 }}>
                  <div style={{ color: '#111827', fontWeight: 500 }}>{e.path || '—'}</div>
                  <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 2 }}>
                    {new Date(e.ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {e.customerId ? ` · Customer #${e.customerId}` : ''}
                  </div>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                <button
                  type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                  style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6, border: 'none',
                    background: '#f3f4f6', color: page === 0 ? '#d1d5db' : '#374151',
                    cursor: page === 0 ? 'not-allowed' : 'pointer',
                  }}
                >Prev</button>
                <span style={{ fontSize: 12, color: '#6b7280', alignSelf: 'center' }}>
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}
                  style={{
                    padding: '5px 12px', fontSize: 12, borderRadius: 6, border: 'none',
                    background: '#f3f4f6', color: page + 1 >= totalPages ? '#d1d5db' : '#374151',
                    cursor: page + 1 >= totalPages ? 'not-allowed' : 'pointer',
                  }}
                >Next</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function DashboardScreen({ shop }) {
  const router = useRouter();

  // Shared keyframes for the Send Now spinner + success toast, injected
  // once (same idempotent-injection pattern as components/Shimmer.jsx).
  // See audits/sendnow-fixes-audit.txt.
  if (typeof window !== 'undefined' &&
      !document.getElementById('dashboard-anim')) {
    const s = document.createElement('style');
    s.id = 'dashboard-anim';
    s.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); }
                          to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(s);
  }

  // --- Today.jsx state (renamed stats/loading/error -> today* to avoid
  // colliding with Insights' own stats/loading/error below) ---
  const [todayStats, setTodayStats] = useState(null);
  const [pushStats, setPushStats] = useState(null);
  const [signals, setSignals] = useState([]);
  const [todayLoading, setTodayLoading] = useState(true);
  const [todayError, setTodayError] = useState('');

  const [dateFilter, setDateFilter] = useState('7d');
  const [customRange, setCustomRange] = useState({ from: null, to: null });
  const [activity, setActivity] = useState(null);
  const [notifStats, setNotifStats] = useState(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  // Phase: shimmer-on-refresh — distinguishes a manual Refresh click
  // (isRefreshing true -> shimmer overlay) from the page's first load
  // (isRefreshing stays false -> the existing '—' fallback still shows).
  // See audits/shimmer-audit.txt.
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [newSubscribers, setNewSubscribers] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [sendingTo, setSendingTo] = useState(null);
  const [sendResults, setSendResults] = useState({});

  // KPI tile drill-downs (audits/dashboard-kpi-drilldown-audit.txt):
  // Popups Shown opens an in-page slide-out panel (nothing existing to
  // navigate to); New Subscribers Today scrolls to + briefly highlights
  // the section that already renders this same list further down the
  // page, rather than navigating anywhere.
  const [popupsPanelOpen, setPopupsPanelOpen] = useState(false);
  const [openInfoIdx, setOpenInfoIdx] = useState(null);
  const [hoveredFunnelIdx, setHoveredFunnelIdx] = useState(null);
  const funnelInfoRefs = useRef([]);
  const newSubsRef = useRef(null);
  const [highlightNewSubs, setHighlightNewSubs] = useState(false);

  useEffect(() => {
    if (openInfoIdx === null) return;
    function onKey(e) { if (e.key === 'Escape') setOpenInfoIdx(null); }
    function onOutside(e) {
      const ref = funnelInfoRefs.current[openInfoIdx];
      if (ref && !ref.contains(e.target)) setOpenInfoIdx(null);
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [openInfoIdx]);

  function scrollToNewSubscribers() {
    if (!newSubscribers.length || !newSubsRef.current) return;
    newSubsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightNewSubs(true);
    setTimeout(() => setHighlightNewSubs(false), 1600);
  }

  const [isMobileView, setIsMobileView] = useState(false);

  // --- Insights.jsx state (renamed stats/products/insights/loading/error
  // -> insights* to avoid the same collision) ---
  const [insightsStats, setInsightsStats] = useState(null);
  const [insightsProducts, setInsightsProducts] = useState([]);
  const [aiInsights, setAiInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState('');
  const [sortBy, setSortBy] = useState('views');

  // --- Phase 1: Notification Suggestions sidebar + editor modal state
  // (see audits/dashboard-phase1-audit.txt). Replaces the old
  // showSuggestModal/modalFestival/modalSending/modalSent compose-modal
  // state from the previous phase entirely. ---
  const [suggestionsOpen, setSuggestionsOpen] = useState(true);
  const [festivalCalendar, setFestivalCalendar] = useState([]);
  const [selectedFestival, setSelectedFestival] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorBody, setEditorBody] = useState('');
  const [editorMobileImageUrl, setEditorMobileImageUrl] = useState('');
  const [editorDesktopImageUrl, setEditorDesktopImageUrl] = useState('');
  const [editorAction, setEditorAction] = useState(null);
  const [editorDate, setEditorDate] = useState('');
  const quietSettings = useQuietHoursSettings(shop);
  const [editorTargetType, setEditorTargetType] = useState('home');
  const [editorProductId, setEditorProductId] = useState('');
  const [editorProductHandle, setEditorProductHandle] = useState('');
  const [editorProductTitle, setEditorProductTitle] = useState('');
  const [sendingNow, setSendingNow] = useState(false);

  // Multi-date scheduling (audits/multi-date-festival-audit.txt design
  // (a) — one FestivalQueue document per date, linked server-side by a
  // shared groupId). The single editorDate input above stays the
  // untouched default; MultiDateScheduler (shared with QueueScreen.jsx's
  // edit modal — see frontend/app/admin/components/MultiDateScheduler.jsx)
  // is purely additive, off unless the merchant opts in. null = single-date
  // mode (use editorDate alone, exactly as before this feature existed);
  // an array (possibly empty) = multi-date mode.
  const [multiDates, setMultiDates] = useState(null);
  const multiDateMode = multiDates !== null;
  const multiDateEmpty = multiDateMode && multiDates.length === 0;
  const [successMsg, setSuccessMsg] = useState('');
  // FestivalQueue items already queued for this shop — used to hide
  // already-queued festivals from the Suggestions list. Holds raw items
  // (each needs at least .festival and .status); a Set of the relevant
  // names is derived from this below, near upcomingFestivals.
  const [queuedFestivals, setQueuedFestivals] = useState([]);

  // Fetch the shared, image-enriched festival calendar once on mount.
  // Falls back to the hardcoded (no-image) copy if the request fails, so
  // the sidebar still works if the backend or festivals.json is briefly
  // unavailable.
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

  // Fetch this shop's existing FestivalQueue items once on mount, so the
  // Suggestions sidebar can exclude festivals that are already queued.
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    apiGet(`/api/queue/${encodeURIComponent(shop)}/festival`)
      .then((data) => {
        if (cancelled) return;
        setQueuedFestivals(data.items || []);
      })
      .catch(() => {
        if (cancelled) return;
        setQueuedFestivals([]);
      });
    return () => {
      cancelled = true;
    };
  }, [shop]);

  const [calPopoverOpen, setCalPopoverOpen] = useState(false);
  const calPopoverRef = useRef(null);
  const [recentSends, setRecentSends] = useState([]);
  const [recentSendsLoading, setRecentSendsLoading] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [isMedium, setIsMedium] = useState(false);

  // --- Today.jsx: activity + notifStats fetch, keyed on date filter ---
  useEffect(() => {
    if (!shop) return;
    if (dateFilter === 'custom' && (!customRange.from || !customRange.to)) return;
    let cancelled = false;
    const { from, to } = dateFilter === 'custom'
      ? getCustomRange(customRange.from, customRange.to)
      : getDateRange(dateFilter);
    setNotifLoading(true);
    Promise.allSettled([
      apiGet(`/api/activity?shop=${encodeURIComponent(shop)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/today-stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    ])
      .then(([actResult, statsResult]) => {
        if (cancelled) return;
        setActivity(actResult.status === 'fulfilled' ? actResult.value : null);
        setNotifStats(statsResult.status === 'fulfilled' ? statsResult.value : null);
      })
      .finally(() => {
        if (cancelled) return;
        setNotifLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop, dateFilter, customRange, refreshKey]);

  // --- Today.jsx: poll for new subscribers every 30s ---
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;

    function fetchNewSubs() {
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/new-subscribers`)
        .then(data => {
          if (!cancelled) setNewSubscribers(data.subscribers || []);
        })
        .catch(() => {});
    }

    fetchNewSubs();
    const interval = setInterval(fetchNewSubs, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shop]);

  async function sendNow(profileId) {
    setSendingTo(profileId);
    try {
      await apiSend(
        `/api/push/send-now`, 'POST', { profileId }
      );
      setSendResults(prev => ({
        ...prev,
        [profileId]: { success: true, msg: 'Queued!' }
      }));
      setTimeout(() => {
        setNewSubscribers(prev =>
          prev.filter(s => s.profileId !== profileId)
        );
      }, 3000);
    } catch (e) {
      setSendResults(prev => ({
        ...prev,
        [profileId]: { success: false, msg: 'Failed' }
      }));
    } finally {
      setSendingTo(null);
    }
  }

  // Carries `shop` forward on client-side nav — see Today.jsx's own note:
  // every admin/*/page.js wrapper reads shop via searchParams.get('shop').
  const navigate = (path) => {
    const sep = path.includes('?') ? '&' : '?';
    router.push(`${path}${sep}shop=${encodeURIComponent(shop)}`);
  };

  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsMobileView(w <= 768);
      setIsNarrow(w < 900);
      setIsMedium(w < 1100);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Clears isRefreshing once both effects a Refresh click kicks off
  // (notifLoading via refreshKey, insightsLoading via loadInsights())
  // have settled back to false. Not given verbatim by the task (its own
  // sketch was just "// after data loads: setIsRefreshing(false)" inside
  // the click handler, which can't work directly since refreshKey only
  // triggers an effect asynchronously and isn't awaitable at the click
  // site) — watching both loading flags is the accurate way to know
  // when the refresh has actually finished.
  useEffect(() => {
    if (isRefreshing && !notifLoading && !insightsLoading) {
      setIsRefreshing(false);
    }
  }, [isRefreshing, notifLoading, insightsLoading]);

  // Fetch last 4 sent jobs for the Recent Sends card.
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setRecentSendsLoading(true);
    apiGet(`/api/queue/${encodeURIComponent(shop)}?status=sent`)
      .then(data => {
        if (cancelled) return;
        setRecentSends((data.jobs || []).slice(0, 4));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRecentSendsLoading(false); });
    return () => { cancelled = true; };
  }, [shop]);

  // Close the calendar popover when the user clicks outside it.
  useEffect(() => {
    if (!calPopoverOpen) return;
    function handler(e) {
      if (calPopoverRef.current && !calPopoverRef.current.contains(e.target)) {
        setCalPopoverOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [calPopoverOpen]);

  // Close the calendar popover on Escape.
  useEffect(() => {
    if (!calPopoverOpen) return;
    function handler(e) { if (e.key === 'Escape') setCalPopoverOpen(false); }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [calPopoverOpen]);

  // --- Today.jsx: push-stats / signals / orders ---
  useEffect(() => {
    if (!shop) return;
    let cancelled = false;
    setTodayLoading(true);
    setTodayError('');

    Promise.allSettled([
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/push-stats`),
      apiGet(`/api/profiles/${encodeURIComponent(shop)}/signals?limit=20`),
      apiGet(`/api/stores/${encodeURIComponent(shop)}/orders`),
    ]).then(([ps, sg]) => {
      if (cancelled) return;
      if (ps.status === 'fulfilled') setPushStats(ps.value || null);
      if (sg.status === 'fulfilled') {
        setSignals(Array.isArray(sg.value?.signals) ? sg.value.signals : []);
      }
      if (ps.status === 'rejected' && sg.status === 'rejected') {
        setTodayError(ps.reason?.message || 'Failed to load Today');
      }
      setTodayLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [shop]);

  const groupedSignals = signals
    ? Object.values(
        signals.reduce((acc, sig) => {
          if (!acc[sig.type]) {
            acc[sig.type] = { ...sig, count: 1 };
          } else {
            acc[sig.type].count += 1;
            if (sig.strength > acc[sig.type].strength) {
              acc[sig.type].strength = sig.strength;
            }
          }
          return acc;
        }, {})
      ).sort((a, b) => b.strength - a.strength)
    : [];

  const todaySubtitle = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  // --- Insights.jsx: product analytics + weekly narrative ---
  const loadInsights = useCallback(async () => {
    if (!shop) return;
    setInsightsLoading(true);
    setInsightsError('');
    try {
      const [pa, wn] = await Promise.allSettled([
        apiGet(`/api/events/${encodeURIComponent(shop)}/product-analytics`),
        apiGet(`/api/profiles/${encodeURIComponent(shop)}/weekly-narrative`),
      ]);
      if (pa.status === 'fulfilled') {
        setInsightsStats(pa.value?.stats || null);
        setInsightsProducts(Array.isArray(pa.value?.products) ? pa.value.products : []);
      } else {
        setInsightsError(pa.reason?.message || 'Failed to load analytics');
      }
      if (wn.status === 'fulfilled') {
        setAiInsights(Array.isArray(wn.value?.insights) ? wn.value.insights : []);
      }
    } finally {
      setInsightsLoading(false);
    }
  }, [shop]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  const sortedProducts = [...(insightsProducts || [])].sort((a, b) => {
    if (sortBy === 'avgDwell') return b.avgDwell - a.avgDwell;
    if (sortBy === 'cartRate') return b.cartRate - a.cartRate;
    return b.views - a.views;
  });

  // --- Redesign-only derived data (render-time groupings, no new
  // fetches/state — mirrors the existing TILES/groupedSignals pattern) ---
  // Every tile's drill-down carries the Dashboard's OWN current range —
  // computed fresh here (cheap, pure) rather than reading it back out of
  // whatever the notifStats fetch last used, so a tile always links to
  // exactly the range it's currently displaying.
  const { from: kpiFrom, to: kpiTo } = dateFilter === 'custom'
    ? getCustomRange(customRange.from, customRange.to)
    : getDateRange(dateFilter);

  const customLabel = (customRange.from && customRange.to)
    ? (() => {
        const fmt = (iso) => {
          const [y, m, d] = iso.split('-').map(Number);
          return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        };
        return `${fmt(customRange.from)} – ${fmt(customRange.to)}`;
      })()
    : 'Custom range';
  const kpiRow1 = [
    {
      label: 'Push Sent', value: notifStats?.pushSent,
      ariaLabel: 'Push Sent — view sent push notifications',
      onClick: () => navigate(`/admin/messages?channel=push&status=sent&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`),
    },
    {
      label: 'Emails Sent', value: notifStats?.emailsSent,
      ariaLabel: 'Emails Sent — view sent emails',
      onClick: () => navigate(`/admin/messages?channel=email&status=sent&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`),
    },
    {
      label: 'Push Subscribers', value: notifStats?.pushSubscribers,
      ariaLabel: 'Push Subscribers — view subscribed customers',
      onClick: () => navigate(`/admin/customers?filter=push_subscribed&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`),
    },
  ];
  const kpiRow2 = [
    {
      label: 'Popups Shown', value: notifStats?.popupsShown,
      ariaLabel: 'Popups Shown — view popup impressions',
      onClick: () => setPopupsPanelOpen(true),
    },
    {
      label: 'Emails Captured', value: notifStats?.emailsCaptured,
      ariaLabel: 'Emails Captured — view customers who gave an email',
      onClick: () => navigate(`/admin/customers?filter=email_captured&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`),
    },
    {
      label: 'New Subscribers Today', value: newSubscribers.length,
      ariaLabel: 'New Subscribers Today — jump to the list below',
      onClick: scrollToNewSubscribers,
    },
  ];
  const ACT_COLORS = {
    add_to_cart: '#f59e0b',
    checkout_start: '#8b5cf6',
    purchase: '#16a34a',
    revisit: '#3b82f6',
  };

  const showingLabel = dateFilter === 'custom'
    ? (customRange.from && customRange.to ? customLabel : 'Custom range')
    : { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' }[dateFilter] || dateFilter;

  const funnelCols = isNarrow ? 'repeat(2, 1fr)' : isMedium ? 'repeat(3, 1fr)' : 'repeat(5, 1fr)';

  const funnelSteps = [
    {
      label: 'SAW THE POPUP',
      info: 'Visitors who were shown your push opt-in popup',
      value: notifStats?.popupsShown ?? 0,
      onClick: () => setPopupsPanelOpen(true),
      color: '#6366f1',
    },
    {
      label: 'SUBSCRIBED',
      info: 'Visitors who accepted push notifications',
      value: notifStats?.pushSubscribers ?? 0,
      onClick: () => navigate(`/admin/customers?filter=push_subscribed&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`),
      color: '#8b5cf6',
    },
    {
      label: 'ADDED TO CART',
      info: 'Subscribers who added a product to their cart',
      value: activity?.summary?.add_to_cart ?? 0,
      onClick: () => navigate(`/admin/activity?type=add_to_cart&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`),
      color: '#f59e0b',
    },
    {
      label: 'STARTED CHECKOUT',
      info: 'Subscribers who started the checkout process',
      value: activity?.summary?.checkout_start ?? 0,
      onClick: () => navigate(`/admin/activity?type=checkout_start&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`),
      color: '#0ea5e9',
    },
    {
      label: 'PURCHASED',
      info: 'Subscribers who completed a purchase',
      value: activity?.summary?.purchase ?? 0,
      onClick: () => navigate(`/admin/activity?type=purchase&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`),
      color: '#16a34a',
    },
  ];

  // Festivals already queued (draft or approved — NOT sent/cancelled, so
  // a sent festival becomes suggestible again next year) should not be
  // re-suggested. Filter the source calendar before slicing to the top
  // 10, so already-queued festivals get backfilled by later ones rather
  // than just shrinking the list below 10.
  const queuedFestivalNames = new Set(
    queuedFestivals
      .filter((item) => item.status === 'draft' || item.status === 'approved')
      .map((item) => item.festival)
  );
  const availableFestivalCalendar = festivalCalendar.filter(
    (f) => !queuedFestivalNames.has(f.name)
  );

  // Phase 1 sidebar: all festivals in the next 60 days (getUpcomingFestivals
  // already filters to <=60 days internally — see its definition above).
  const upcomingFestivals = getUpcomingFestivals(availableFestivalCalendar, 10);

  // Shared by the suggestion row's click and its Create button — opens the
  // festival notification editor pre-filled for that festival.
  function openFestivalEditor(f) {
    setSelectedFestival(f);
    setEditorTitle(f.name + ' Special Offer');
    setEditorBody(f.message);
    // Pre-fill both image slots with the festival's own photo (if we have
    // one) as a sensible default — the merchant can still replace either
    // one via the existing upload inputs.
    setEditorMobileImageUrl(f.imageUrl || '');
    setEditorDesktopImageUrl(f.imageUrl || '');
    setEditorDate(f.date);
    // MultiDateScheduler's own internal state resets itself — it's keyed
    // on selectedFestival.name, so changing it remounts a fresh instance.
    setMultiDates(null);
    setEditorAction(null);
    // Every suggestion starts targeting the storefront home page — the
    // merchant picks a specific product via ProductPicker if they want one.
    setEditorTargetType('home');
    setEditorProductId('');
    setEditorProductHandle('');
    setEditorProductTitle('');
    setShowEditor(true);
  }

  // Header "Refresh" — re-runs Today's date-filtered effect (via
  // refreshKey) AND Insights' own load, so one button refreshes the
  // whole merged dashboard. Insights previously had no manual refresh
  // at all, so this adds capability rather than losing any.
  const refreshButton = (
    <button
      onClick={() => {
        setIsRefreshing(true);
        // existing refresh logic
        setRefreshKey(k => k + 1);
        loadInsights();
        // after data loads: setIsRefreshing(false) — handled by the
        // watcher effect above once notifLoading/insightsLoading settle
      }}
      disabled={notifLoading || insightsLoading}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        ...DS.btnSecondary,
        cursor: (notifLoading || insightsLoading) ? 'not-allowed' : 'pointer',
        opacity: (notifLoading || insightsLoading) ? 0.6 : 1,
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
      {(notifLoading || insightsLoading) ? 'Refreshing...' : 'Refresh'}
    </button>
  );

  return (
    <div style={{
      height: 'calc(100vh - 40px)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#f9fafb',
    }}>

      {/* HEADER */}
      <div style={{
        position: isMobileView ? 'relative' : 'sticky',
        top: 0,
        zIndex: 10,
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        padding: '12px 24px',
        display: 'flex',
        flexDirection: isMobileView ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobileView ? 'flex-start' : 'center',
        gap: isMobileView ? 10 : 0,
      }}>
        <div>
          <h1 style={{ ...DS.pageTitle, fontSize: 18, fontWeight: 700 }}>Dashboard</h1>
          <p style={{ ...DS.pageSubtitle, marginTop: 2 }}>Showing {showingLabel}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <DateRangeFilter
            value={dateFilter}
            onChange={(key) => {
              setCustomRange({ from: null, to: null });
              setDateFilter(key);
              setCalPopoverOpen(false);
            }}
            customLabel={customLabel}
            showAllTime={false}
          />
          {/* Custom range popover */}
          <div ref={calPopoverRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setCalPopoverOpen(o => !o)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: dateFilter === 'custom' ? 700 : 500,
                color: dateFilter === 'custom' ? DS.primary : '#374151',
                background: dateFilter === 'custom' ? DS.primaryLight : '#f3f4f6',
                border: `1px solid ${dateFilter === 'custom' ? DS.primary : '#e5e7eb'}`,
                borderRadius: 20,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {dateFilter === 'custom' && customRange.from ? customLabel : 'Custom range'}
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                strokeLinejoin="round"
                style={{ transform: calPopoverOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {calPopoverOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                zIndex: 100,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                padding: 12,
                width: 300,
              }}>
                <SidebarCalendar
                  from={customRange.from}
                  to={customRange.to}
                  onRangeSelect={(f, t) => {
                    setCustomRange({ from: f, to: t });
                    if (dateFilter !== 'custom') setDateFilter('custom');
                    else setRefreshKey(k => k + 1);
                    setCalPopoverOpen(false);
                  }}
                  onClear={() => {
                    setCustomRange({ from: null, to: null });
                    setDateFilter('7d');
                    setCalPopoverOpen(false);
                  }}
                />
              </div>
            )}
          </div>
          {refreshButton}
        </div>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: '#16a34a', color: '#fff',
          padding: '12px 20px', borderRadius: 10,
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'fadeIn 0.3s ease',
        }}>
          {successMsg}
        </div>
      )}

      {/* CONTENT */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        gap: 16,
        padding: '16px 20px',
      }}>

        {/* LEFT — main content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* FUNNEL CARD */}
          <div style={{ ...DS.card, marginBottom: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
              Conversion Funnel
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: funnelCols, gap: 12 }}>
              {funnelSteps.map((step, i) => {
                const prev = i > 0 ? funnelSteps[i - 1].value : null;
                const rate = (prev && prev > 0) ? Math.min(100, Math.round((step.value / prev) * 100)) : null;
                const isHovered = hoveredFunnelIdx === i;
                const infoOpen = openInfoIdx === i;
                return (
                  <div
                    key={step.label}
                    role="button"
                    tabIndex={0}
                    onClick={step.onClick}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); step.onClick(); } }}
                    onMouseEnter={() => setHoveredFunnelIdx(i)}
                    onMouseLeave={() => setHoveredFunnelIdx(null)}
                    style={{
                      padding: '10px 12px',
                      background: isHovered ? '#f0f0ff' : '#fafafa',
                      border: isHovered ? '1px solid #c7d2fe' : '1px solid #f3f4f6',
                      borderRadius: 8,
                      cursor: 'pointer',
                      position: 'relative',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', flex: 1 }}>
                        {step.label}
                      </span>
                      {/* Info button: stopPropagation prevents it from triggering the card's onClick */}
                      <span ref={(el) => { funnelInfoRefs.current[i] = el; }} style={{ position: 'relative' }}>
                        <button
                          type="button"
                          aria-label={`Info: ${step.label}`}
                          aria-expanded={infoOpen}
                          onClick={(e) => { e.stopPropagation(); setOpenInfoIdx(infoOpen ? null : i); }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: infoOpen ? '#6366f1' : '#d1d5db', padding: 0, fontSize: 11, lineHeight: 1 }}
                        >
                          ⓘ
                        </button>
                        {infoOpen && (
                          <div
                            role="tooltip"
                            style={{
                              position: 'absolute', top: 20, right: 0, zIndex: 50,
                              background: '#1f2937', color: '#f9fafb',
                              fontSize: 11, lineHeight: 1.5,
                              padding: '7px 10px', borderRadius: 6,
                              width: 170, whiteSpace: 'normal',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
                              pointerEvents: 'none',
                            }}
                          >
                            {step.info}
                          </div>
                        )}
                      </span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', lineHeight: 1 }}>
                      {(notifLoading || todayLoading) ? '—' : step.value.toLocaleString('en-IN')}
                    </div>
                    <div style={{ height: 3, background: '#e5e7eb', borderRadius: 2, margin: '8px 0 4px' }}>
                      <div style={{ height: '100%', background: step.color, borderRadius: 2, width: rate !== null ? `${rate}%` : '100%', transition: 'width 0.4s ease' }} />
                    </div>
                    {rate !== null
                      ? <div style={{ fontSize: 10, color: '#9ca3af' }}>{rate}% of {funnelSteps[i - 1].label.toLowerCase()}</div>
                      : <div style={{ fontSize: 10, color: '#9ca3af' }}>Starting point</div>
                    }
                  </div>
                );
              })}
            </div>
          </div>

          {/* Two-col: Do This Next | Recent Sends */}
          <div style={{ display: 'grid', gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr', gap: 12 }}>

            {/* Do This Next */}
            <div style={{ ...DS.card, marginBottom: 0 }}>
              <div style={DS.sectionLabel}>Do This Next</div>
              {todayLoading ? (
                [1, 2, 3].map(i => (
                  <div key={i} style={{ height: 40, background: '#f3f4f6', borderRadius: 6, marginBottom: 8 }} />
                ))
              ) : groupedSignals.length === 0 ? (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No signals right now — check back later.</p>
              ) : (
                groupedSignals.slice(0, 3).map((sig, idx, arr) => (
                  <div key={sig.type} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: idx < arr.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                        {SIGNAL_LABELS[sig.type] || sig.type.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                        {sig.count} customer{sig.count !== 1 ? 's' : ''} · {sig.channel || 'push'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/customers?signal=${sig.type}&from=${encodeURIComponent(kpiFrom)}&to=${encodeURIComponent(kpiTo)}`)}
                      style={{ flexShrink: 0, padding: '5px 12px', fontSize: 11, fontWeight: 700, color: DS.primary, background: DS.primaryLight, border: 'none', borderRadius: 8, cursor: 'pointer' }}
                    >
                      Reach them
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Recent Sends */}
            <div style={{ ...DS.card, marginBottom: 0 }}>
              <div style={DS.sectionLabel}>Recent Sends</div>
              {recentSendsLoading ? (
                [1, 2, 3, 4].map(i => (
                  <div key={i} style={{ height: 36, background: '#f3f4f6', borderRadius: 6, marginBottom: 8 }} />
                ))
              ) : recentSends.length === 0 ? (
                <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>No sends recorded yet.</p>
              ) : (
                recentSends.map((job, idx, arr) => (
                  <div key={String(job._id)} style={{ padding: '7px 0', borderBottom: idx < arr.length - 1 ? '1px solid #f9fafb' : 'none', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.payload?.title || '(no title)'}
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                        {job.channel || 'push'} · {SIGNAL_LABELS[job.signalType] || job.signalType || 'manual'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: (job.outcome === 'delivered' || job.outcome === 'clicked' || job.outcome === 'converted') ? '#16a34a' : job.outcome === 'failed' ? '#dc2626' : '#9ca3af' }}>
                        {job.outcome || 'sent'}
                      </div>
                      <div style={{ fontSize: 10, color: '#d1d5db', marginTop: 1 }}>
                        {(job.sentAt || job.updatedAt)
                          ? new Date(job.sentAt || job.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : '—'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>

          {insightsError && (
            <div style={{ background: DS.dangerLight, border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#b91c1c' }}>
              {insightsError}
            </div>
          )}
          {todayError && (
            <div style={{ background: DS.dangerLight, border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#b91c1c' }}>
              {todayError}
            </div>
          )}






        </div>

        {/* RIGHT sidebar — Coming up + New subscribers */}
        {!isNarrow && (
          <div style={{
            width: 280,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>

            {/* Coming up card */}
            <div style={{ ...DS.card, padding: 0, overflow: 'hidden' }}>
              <div style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f3f4f6',
                fontSize: 12,
                fontWeight: 700,
                color: '#111827',
              }}>
                Coming up
              </div>
              {upcomingFestivals.slice(0, 5).length === 0 ? (
                <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                  No upcoming festivals.
                </div>
              ) : (
                upcomingFestivals.slice(0, 5).map((f, idx, arr) => {
                  const urgent = f.diffDays <= 7;
                  const isLast = idx === arr.length - 1;
                  return (
                    <div
                      key={f.name}
                      onClick={() => openFestivalEditor(f)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 16px',
                        borderBottom: isLast ? 'none' : '1px solid #f9fafb',
                        cursor: 'pointer',
                        transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      {/* 44px thumbnail */}
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: '#f3f4f6',
                        flexShrink: 0,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                      }}>
                        {f.imageUrl ? (
                          <>
                            <img
                              src={f.imageUrl}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={e => {
                                e.target.style.display = 'none';
                                if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                            <span style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                              {f.emoji}
                            </span>
                          </>
                        ) : f.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#111827',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {f.name}
                        </div>
                        <div style={{
                          fontSize: 11,
                          marginTop: 2,
                          color: urgent ? DS.warning : '#9ca3af',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}>
                          {urgent && (
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: DS.warning, display: 'inline-block', flexShrink: 0 }} />
                          )}
                          {formatRelativeDate(f.diffDays)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* New subscribers card */}
            {newSubscribers.length > 0 && (
              <div style={{ ...DS.card, padding: 0, overflow: 'hidden' }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f3f4f6',
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#111827',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  New subscribers
                  <span style={{
                    background: '#dcfce7',
                    color: '#16a34a',
                    borderRadius: 20,
                    padding: '2px 8px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    {newSubscribers.length}
                  </span>
                </div>
                {newSubscribers.slice(0, 3).map((sub, idx, arr) => (
                  <div
                    key={sub.profileId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderBottom: idx < arr.length - 1 ? '1px solid #f9fafb' : 'none',
                      gap: 10,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#111827',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {sub.email || 'Anonymous'}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                        {sub.subscribedAt
                          ? new Date(sub.subscribedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'recently'}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0 }}>
                      {sendResults[sub.profileId] ? (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: sendResults[sub.profileId].success ? '#10b981' : '#ef4444',
                        }}>
                          {sendResults[sub.profileId].msg}
                        </span>
                      ) : (
                        <button
                          onClick={() => sendNow(sub.profileId)}
                          disabled={sendingTo === sub.profileId}
                          style={{
                            padding: '5px 12px',
                            borderRadius: 6,
                            border: 'none',
                            cursor: sendingTo === sub.profileId ? 'not-allowed' : 'pointer',
                            background: sendingTo === sub.profileId ? '#e5e7eb' : DS.primary,
                            color: sendingTo === sub.profileId ? '#9ca3af' : '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                            opacity: sendingTo === sub.profileId ? 0.7 : 1,
                          }}
                        >
                          {sendingTo === sub.profileId ? 'Sending…' : 'Send'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </div>

      {/* Notification Editor modal (Part C) — replaces the old compose
          modal entirely. See audits/dashboard-phase1-audit.txt for the
          /api/queue/festival URL-shape fix (the given spec's `/festival`
          path, with no :shopDomain segment, would have made every
          Approve/Add-to-Queue request fail with 403 under this backend's
          requireStoreOwner middleware, which requires and compares
          req.params.shopDomain — matched to this file's own established
          route pattern instead) and for the known, undone gap where
          POST /api/push/send-store does not yet forward imageUrl (Send
          Now already sends it; the endpoint itself silently drops it —
          left as-is since fixing it would mean editing
          backend/routes/push.js, outside this task's stated file scope). */}
      {showEditor && selectedFestival && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 1000, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: 20,
        }}
          onClick={e => { if (e.target === e.currentTarget) {
            setShowEditor(false);
            setEditorMobileImageUrl('');
            setEditorDesktopImageUrl('');
            setSendingNow(false);
          } }}
        >
          <div style={{
            background: '#fff', borderRadius: 16,
            width: '100%', maxWidth: 760,
            boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
            display: 'flex', flexDirection: 'column',
            maxHeight: '90vh', overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid #f3f4f6',
              display: 'flex', justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700,
                              color: '#111827' }}>
                  {selectedFestival.emoji} {selectedFestival.name} Notification
                </div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                  Edit and preview before sending
                </div>
              </div>
              <button onClick={() => {
                  setShowEditor(false);
                  setEditorMobileImageUrl('');
                  setEditorDesktopImageUrl('');
                  setSendingNow(false);
                }}
                style={{ background: 'none', border: 'none',
                         fontSize: 20, cursor: 'pointer', color: '#9ca3af' }}>
                ✕
              </button>
            </div>

            {/* Modal body — editor + preview side by side */}
            <div style={{
              display: 'flex', flex: 1, overflow: 'hidden',
            }}>
              {/* Left: Editor */}
              <div style={{
                flex: 1, padding: 20, overflowY: 'auto',
                borderRight: '1px solid #f3f4f6',
              }}>
                {/* Festival visual header — image (or emoji fallback),
                    name, and date, so the merchant can confirm which
                    festival they're editing before scrolling further. */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  marginBottom: 20, paddingBottom: 16,
                  borderBottom: '1px solid #f3f4f6',
                }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: '50%',
                    background: '#f3f4f6', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, flexShrink: 0, overflow: 'hidden',
                  }}>
                    {selectedFestival.imageUrl ? (
                      <>
                        <img
                          src={selectedFestival.imageUrl}
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
                          {selectedFestival.emoji}
                        </span>
                      </>
                    ) : (
                      selectedFestival.emoji
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                      {selectedFestival.name}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      {formatFestivalDate(selectedFestival.date)}
                    </div>
                  </div>
                </div>

                {/* Title */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600,
                                  color: '#374151', display: 'block',
                                  marginBottom: 6 }}>
                    Notification Title
                  </label>
                  <input
                    type="text"
                    value={editorTitle}
                    onChange={e => setEditorTitle(e.target.value)}
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
                    value={editorBody}
                    onChange={e => setEditorBody(e.target.value)}
                    rows={4}
                    style={{ width: '100%', padding: '8px 12px',
                             borderRadius: 8, border: '1px solid #e5e7eb',
                             fontSize: 13, resize: 'vertical',
                             fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Where the notification click-through goes — home page
                    or a specific product. Reordered ImageUploadPair to
                    sit after this (was directly after Title/Body before
                    this task) so both editors now share the same field
                    order: Title, Body, ProductPicker, ImageUploadPair,
                    Scheduled date — matching QueueScreen's edit modal. */}
                <ProductPicker
                  shop={shop}
                  value={{
                    targetType: editorTargetType,
                    productId: editorProductId,
                    productHandle: editorProductHandle,
                    productTitle: editorProductTitle,
                  }}
                  onChange={(next) => {
                    setEditorTargetType(next.targetType);
                    setEditorProductId(next.productId);
                    setEditorProductHandle(next.productHandle);
                    setEditorProductTitle(next.productTitle);
                  }}
                />

                {/* Mobile Image + Desktop Image — shared widget, see
                    frontend/app/admin/components/ImageUploadPair.jsx.
                    See audits/horizontal-upload-audit.txt (was
                    audits/separate-images-audit.txt, stacked). */}
                <div style={{ marginBottom: 16 }}>
                  <ImageUploadPair
                    mobileImageUrl={editorMobileImageUrl}
                    desktopImageUrl={editorDesktopImageUrl}
                    onMobileChange={setEditorMobileImageUrl}
                    onDesktopChange={setEditorDesktopImageUrl}
                  />
                </div>

                {/* Scheduled date — entered and displayed in the STORE's
                    timezone (never UTC, never the browser's local zone).
                    See formatLocalDateTimeInput in QuietHoursWarning.jsx. */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, fontWeight: 600,
                                  color: '#374151', display: 'block',
                                  marginBottom: 6 }}>
                    Schedule Date & Time ({quietSettings.timezone || 'Asia/Kolkata'})
                  </label>
                  <input
                    type="datetime-local"
                    value={formatLocalDateTimeInput(editorDate, quietSettings.timezone)}
                    onChange={e => setEditorDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px',
                             borderRadius: 8, border: '1px solid #e5e7eb',
                             fontSize: 13, boxSizing: 'border-box' }}
                  />
                  <QuietHoursWarning value={editorDate} settings={quietSettings} />
                </div>

                {/* Multi-date scheduling — shared with QueueScreen.jsx's
                    edit modal, see frontend/app/admin/components/
                    MultiDateScheduler.jsx. Remounts (via key) whenever a
                    different suggestion is opened, resetting its internal
                    state cleanly. */}
                <MultiDateScheduler
                  key={selectedFestival?.name || 'none'}
                  firstDate={editorDate}
                  timezone={quietSettings.timezone}
                  onDatesChange={setMultiDates}
                />

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      setSendingNow(true);
                      try {
                        const result = await apiSend('/api/push/send-store', 'POST', {
                          shop,
                          title: editorTitle,
                          body: editorBody,
                          mobileImageUrl: editorMobileImageUrl,
                          desktopImageUrl: editorDesktopImageUrl,
                          targetType: editorTargetType,
                          productHandle: editorProductHandle,
                        });
                        setShowEditor(false);
                        setSendingNow(false);
                        // Show success toast
                        setSuccessMsg('Notification sent successfully! 🎉');
                        setTimeout(() => setSuccessMsg(''), 3000);
                      } catch(e) {
                        setSendingNow(false);
                        alert('Failed to send notification');
                      }
                    }}
                    disabled={sendingNow || multiDateMode}
                    title={multiDateMode ? 'Send Now is a single immediate send — turn off multi-date scheduling to use it' : undefined}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8,
                      border: 'none',
                      background: (sendingNow || multiDateMode) ? '#818cf8' : '#4f46e5',
                      color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: (sendingNow || multiDateMode) ? 'not-allowed' : 'pointer',
                      opacity: (sendingNow || multiDateMode) ? 0.5 : 1,
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'center', gap: 6,
                    }}>
                    {sendingNow ? (
                      <>
                        <span style={{
                          width: 12, height: 12, border: '2px solid #fff',
                          borderTopColor: 'transparent', borderRadius: '50%',
                          display: 'inline-block',
                          animation: 'spin 0.8s linear infinite',
                        }} />
                        Sending...
                      </>
                    ) : 'Send Now'}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await apiSend(
                          `/api/queue/${encodeURIComponent(shop)}/festival`,
                          'POST',
                          {
                            title: editorTitle,
                            body: editorBody,
                            mobileImageUrl: editorMobileImageUrl,
                            desktopImageUrl: editorDesktopImageUrl,
                            scheduledAt: multiDateMode ? multiDates : editorDate,
                            festival: selectedFestival.name,
                            targetType: editorTargetType,
                            productId: editorProductId,
                            productHandle: editorProductHandle,
                            productTitle: editorProductTitle,
                            status: 'approved',
                          }
                        );
                        setQueuedFestivals(prev => [
                          ...prev,
                          { festival: selectedFestival.name, status: 'approved' },
                        ]);
                        setShowEditor(false);
                        setEditorMobileImageUrl('');
                        setEditorDesktopImageUrl('');
                        setSendingNow(false);
                        setSuccessMsg(
                          multiDateMode
                            ? `Added ${multiDates.length} notifications to the queue as approved!`
                            : 'Added to queue as approved!'
                        );
                        setTimeout(() => {
                          setSuccessMsg('');
                          navigate('/admin/queue');
                        }, 1200);
                      } catch(e) {
                        alert('Failed to approve');
                      }
                    }}
                    disabled={multiDateEmpty}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8,
                      border: 'none',
                      background: multiDateEmpty ? '#86efac' : '#16a34a',
                      color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: multiDateEmpty ? 'not-allowed' : 'pointer',
                      opacity: multiDateEmpty ? 0.6 : 1,
                    }}>
                    Approve
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await apiSend(
                          `/api/queue/${encodeURIComponent(shop)}/festival`,
                          'POST',
                          {
                            title: editorTitle,
                            body: editorBody,
                            mobileImageUrl: editorMobileImageUrl,
                            desktopImageUrl: editorDesktopImageUrl,
                            scheduledAt: multiDateMode ? multiDates : editorDate,
                            festival: selectedFestival.name,
                            targetType: editorTargetType,
                            productId: editorProductId,
                            productHandle: editorProductHandle,
                            productTitle: editorProductTitle,
                            status: 'draft',
                          }
                        );
                        setQueuedFestivals(prev => [
                          ...prev,
                          { festival: selectedFestival.name, status: 'draft' },
                        ]);
                        setShowEditor(false);
                        setEditorMobileImageUrl('');
                        setEditorDesktopImageUrl('');
                        setSendingNow(false);
                        setSuccessMsg(
                          multiDateMode
                            ? `Added ${multiDates.length} notifications to the queue`
                            : 'Added to queue'
                        );
                        setTimeout(() => {
                          setSuccessMsg('');
                          navigate('/admin/queue');
                        }, 1200);
                      } catch(e) {
                        alert('Failed to save');
                      }
                    }}
                    disabled={multiDateEmpty}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8,
                      border: '1px solid #e5e7eb', background: '#fff',
                      color: multiDateEmpty ? '#d1d5db' : '#374151',
                      fontSize: 13, fontWeight: 700,
                      cursor: multiDateEmpty ? 'not-allowed' : 'pointer',
                    }}>
                    Add to Queue
                  </button>
                </div>
              </div>

              {/* Right: Live Preview — compact phone frame + Mac desktop
                  toast, resized to fit the panel without cutting off.
                  See audits/preview-redesign-audit.txt. */}
              <div style={{
                width: 260,
                flexShrink: 0,
                padding: '14px 12px',
                background: '#f8fafc',
                borderLeft: '1px solid #e5e7eb',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8',
                              textTransform: 'uppercase', letterSpacing: '0.08em',
                              textAlign: 'center' }}>
                  Live Preview
                </div>

                {/* MOBILE PREVIEW */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b',
                                textAlign: 'center', marginBottom: 6 }}>
                    📱 Mobile
                  </div>
                  {/* Phone outer frame */}
                  <div style={{
                    width: 180, margin: '0 auto',
                    background: '#111', borderRadius: 24,
                    padding: '8px 5px',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
                  }}>
                    {/* Screen */}
                    <div style={{
                      background: '#f2f2f7',
                      borderRadius: 18,
                      overflow: 'hidden',
                    }}>
                      {/* Status bar */}
                      <div style={{
                        padding: '5px 10px 2px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        background: '#f2f2f7',
                      }}>
                        <span style={{ fontSize: 8, fontWeight: 700,
                                       color: '#111' }}>9:41</span>
                        <span style={{ fontSize: 8, color: '#111' }}>
                          ●●● ▲ 🔋
                        </span>
                      </div>
                      {/* Notification card */}
                      <div style={{
                        margin: '3px 5px 5px',
                        background: 'rgba(255,255,255,0.92)',
                        borderRadius: 10,
                        overflow: 'hidden',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
                      }}>
                        {/* App row */}
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          gap: 5, padding: '6px 8px 3px',
                        }}>
                          <div style={{
                            width: 12, height: 12,
                            background: '#4f46e5', borderRadius: 3,
                            flexShrink: 0,
                          }} />
                          <span style={{ fontSize: 8, fontWeight: 700,
                                         color: '#555', flex: 1 }}>
                            ShopiReachBoost AI
                          </span>
                          <span style={{ fontSize: 7, color: '#999' }}>now</span>
                        </div>
                        {/* Title + body + thumbnail */}
                        <div style={{
                          display: 'flex', gap: 6,
                          padding: '0 8px 6px',
                          alignItems: 'flex-start',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 10, fontWeight: 700, color: '#111',
                              marginBottom: 2,
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {editorTitle || 'Notification Title'}
                            </div>
                            <div style={{
                              fontSize: 8, color: '#555', lineHeight: 1.3,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}>
                              {editorBody || 'Message preview...'}
                            </div>
                          </div>
                          {/* Thumbnail */}
                          <div style={{
                            width: 32, height: 32, borderRadius: 6,
                            overflow: 'hidden', flexShrink: 0,
                            background: '#eef2ff',
                            display: 'flex', alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {editorMobileImageUrl ? (
                              <img src={editorMobileImageUrl} alt=""
                                style={{ width: '100%', height: '100%',
                                         objectFit: 'cover' }}
                                onError={e => e.target.style.display = 'none'} />
                            ) : (
                              <span style={{ fontSize: 14 }}>🔔</span>
                            )}
                          </div>
                        </div>
                        {/* Banner image when uploaded */}
                        {editorMobileImageUrl && (
                          <img src={editorMobileImageUrl} alt=""
                            style={{ width: '100%', height: 55,
                                     objectFit: 'cover', display: 'block' }}
                            onError={e => e.target.style.display = 'none'}
                          />
                        )}
                      </div>
                      {/* Home bar */}
                      <div style={{
                        height: 14, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        background: '#f2f2f7',
                      }}>
                        <div style={{ width: 40, height: 3,
                                      background: '#c7c7cc', borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* DESKTOP PREVIEW */}
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b',
                                textAlign: 'center', marginBottom: 6 }}>
                    🖥️ Desktop
                  </div>
                  {/* Mac desktop background */}
                  <div style={{
                    background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2027 100%)',
                    borderRadius: 10, padding: 8, maxWidth: 220, margin: '0 auto',
                  }}>
                    {/* Notification toast */}
                    <div style={{
                      background: 'rgba(50,50,50,0.92)',
                      borderRadius: 10, overflow: 'hidden',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    }}>
                      {/* App header */}
                      <div style={{
                        display: 'flex', alignItems: 'center',
                        gap: 5, padding: '7px 8px 3px',
                      }}>
                        <div style={{ width: 12, height: 12,
                                      background: '#4f46e5', borderRadius: 3,
                                      flexShrink: 0 }} />
                        <span style={{ fontSize: 8, fontWeight: 700,
                                       color: 'rgba(255,255,255,0.7)', flex: 1 }}>
                          ShopiReachBoost AI
                        </span>
                        <span style={{ fontSize: 7,
                                       color: 'rgba(255,255,255,0.4)' }}>now</span>
                      </div>
                      {/* Content */}
                      <div style={{
                        display: 'flex', gap: 6,
                        padding: '0 8px 8px', alignItems: 'flex-start',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 10, fontWeight: 700, color: '#fff',
                            marginBottom: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {editorTitle || 'Notification Title'}
                          </div>
                          <div style={{
                            fontSize: 8, color: 'rgba(255,255,255,0.65)',
                            lineHeight: 1.3,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                            {editorBody || 'Message preview here...'}
                          </div>
                        </div>
                        {/* Desktop thumbnail */}
                        <div style={{
                          width: 36, height: 36, borderRadius: 6,
                          overflow: 'hidden', flexShrink: 0,
                          background: 'rgba(255,255,255,0.15)',
                          display: 'flex', alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {editorDesktopImageUrl ? (
                            <img src={editorDesktopImageUrl} alt=""
                              style={{ width: '100%', height: '100%',
                                       objectFit: 'cover' }}
                              onError={e => e.target.style.display = 'none'} />
                          ) : (
                            <span style={{ fontSize: 16 }}>🔔</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Mac taskbar hint */}
                    <div style={{
                      display: 'flex', justifyContent: 'flex-end',
                      marginTop: 4, paddingRight: 2,
                    }}>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {['#ff5f57','#febc2e','#28c840'].map(c => (
                          <div key={c} style={{ width: 6, height: 6,
                                                borderRadius: '50%',
                                                background: c }} />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: 9, color: '#94a3b8',
                              textAlign: 'center' }}>
                  Updates as you type
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <PopupsShownPanel
        shop={shop}
        from={kpiFrom}
        to={kpiTo}
        open={popupsPanelOpen}
        onClose={() => setPopupsPanelOpen(false)}
      />
    </div>
  );
}
