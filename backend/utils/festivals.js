'use strict';
const { zonedParts, resolveTz } = require('./timezone');

/**
 * upcomingFestival(todayYmd, list) -> { name, date, daysAway } | null
 *
 * Returns the first festival whose date >= todayYmd, with daysAway as
 * whole calendar days (0 = today). list is an array of { name, date, ... }.
 * Comparison is lexicographic on YYYY-MM-DD strings, which is safe because
 * that format is ISO 8601 and lexicographic order equals date order.
 */
function upcomingFestival(todayYmd, list) {
  if (!Array.isArray(list) || !todayYmd) return null;
  const sorted = list.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  for (var i = 0; i < sorted.length; i++) {
    var f = sorted[i];
    if (f.date >= todayYmd) {
      var tp = todayYmd.split('-');
      var fp = f.date.split('-');
      var t = Date.UTC(+tp[0], +tp[1] - 1, +tp[2]);
      var d = Date.UTC(+fp[0], +fp[1] - 1, +fp[2]);
      var daysAway = Math.round((d - t) / (1000 * 60 * 60 * 24));
      return { name: f.name, date: f.date, daysAway: daysAway };
    }
  }
  return null;
}

/**
 * storeTodayYmd(timezone) -> 'YYYY-MM-DD' in the store's timezone.
 * Falls back to Asia/Kolkata (same default as the rest of the app).
 */
function storeTodayYmd(timezone) {
  var parts = zonedParts(new Date(), resolveTz(timezone));
  var yy = String(parts.y);
  var mm = String(parts.mo).padStart(2, '0');
  var dd = String(parts.d).padStart(2, '0');
  return yy + '-' + mm + '-' + dd;
}

module.exports = { upcomingFestival, storeTodayYmd };
