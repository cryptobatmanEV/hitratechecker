// ESPN season identifiers are not consistent across leagues. Keep the
// rollover rules in one place so a new season never requires another patch.
export function seasonFor(league, date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0 = January

  switch (league) {
    case 'nba':
      // NBA 2026-27 is ESPN season 2027; the new season starts in October.
      return month >= 8 ? year + 1 : year;
    case 'nfl':
    case 'college-football':
      // Football seasons run August/September through the following winter.
      return month < 7 ? year - 1 : year;
    case 'wnba':
    case 'mlb':
    case 'tennis':
    default:
      return year;
  }
}
