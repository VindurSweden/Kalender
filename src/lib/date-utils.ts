import { format, parse, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, setHours, setMinutes, getHours, getMinutes, addDays, isSameDay, isSameMonth, set, nextDay, Day, add } from 'date-fns';
import { sv } from 'date-fns/locale'; // For Swedish day/month names

export const DATE_FORMAT = 'yyyy-MM-dd';
export const TIME_FORMAT = 'HH:mm';
export const DISPLAY_DATE_FORMAT = 'PPP'; // e.g., "July 15th, 2024"
export const DISPLAY_TIME_FORMAT = 'p'; // e.g., "10:00 AM"
export const DISPLAY_MONTH_YEAR_FORMAT = 'MMMM yyyy';

export const formatInputDate = (date: Date): string => format(date, DATE_FORMAT);
export const formatInputTime = (date: Date): string => format(date, TIME_FORMAT);

export const parseInputDate = (dateString: string): Date => {
    // Handles both 'YYYY-MM-DD' and full ISO 'YYYY-MM-DDTHH:mm:ss'
    const d = new Date(dateString);
    if (!isNaN(d.getTime())) {
        return d;
    }
    return parse(dateString, DATE_FORMAT, new Date());
};

export const parseInputTime = (timeString: string, referenceDate: Date = new Date()): Date => {
  const [hours, minutes] = timeString.split(':').map(Number);
  if (isNaN(hours) || isNaN(minutes)) {
    // Fallback for invalid time string
    return setMinutes(setHours(referenceDate, 12), 0);
  }
  return setMinutes(setHours(referenceDate, hours), minutes);
};

export const combineDateAndTime = (date: Date, time: Date): Date => {
  return setMinutes(setHours(date, getHours(time)), getMinutes(time));
};

export const getMonthNameYear = (date: Date): string => format(date, DISPLAY_MONTH_YEAR_FORMAT, { locale: sv });
export const getDayOfWeekShort = (date: Date): string => format(date, 'EEE', { locale: sv });

export const getDaysInMonth = (date: Date): Date[] => {
  const start = startOfWeek(startOfMonth(date), { locale: sv, weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(date), { locale: sv, weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
};

export const getWeekDays = (date: Date): Date[] => {
  const start = startOfWeek(date, { locale: sv, weekStartsOn: 1 });
  const end = endOfWeek(date, { locale: sv, weekStartsOn: 1 });
  return eachDayOfInterval({ start, end });
};

export const getHoursInDay = (): Date[] => {
  const hours = [];
  for (let i = 0; i < 24; i++) {
    hours.push(setMinutes(setHours(new Date(), i), 0));
  }
  return hours;
};

const swedishWeekdays: { [key: string]: Day } = {
  'söndag': 0, 'måndag': 1, 'tisdag': 2, 'onsdag': 3, 'torsdag': 4, 'fredag': 5, 'lördag': 6,
  'sön': 0, 'mån': 1, 'tis': 2, 'ons': 3, 'tor': 4, 'fre': 5, 'lör': 6
};

const swedishMonths: { [key: string]: number } = {
  'januari': 0, 'februari': 1, 'mars': 2, 'april': 3, 'maj': 4, 'juni': 5,
  'juli': 6, 'augusti': 7, 'september': 8, 'oktober': 9, 'november': 10, 'december': 11,
  'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'maj': 4, 'jun': 5,
  'jul': 6, 'aug': 7, 'sep': 8, 'okt': 9, 'nov': 10, 'dec': 11
};

export const parseFlexibleSwedishDateString = (dateString: string, referenceDate: Date = new Date()): Date | null => {
  const lowerDateString = dateString.toLowerCase().trim();
  const now = referenceDate;

  if (lowerDateString === 'idag') return now;
  if (lowerDateString === 'imorgon' || lowerDateString === 'i morgon') return addDays(now, 1);
  if (lowerDateString === 'i övermorgon' || lowerDateString === 'övermorgon') return addDays(now, 2);

  try {
    const parsedDate = parse(lowerDateString, 'yyyy-MM-dd', now);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  } catch (e) {/* ignore */}

  let match = lowerDateString.match(/^nästa\s+(.+)$/);
  if (match && swedishWeekdays.hasOwnProperty(match[1])) {
    return nextDay(now, swedishWeekdays[match[1]]);
  }

  match = lowerDateString.match(/^(\d{1,2})\s+(.+)$/);
  if (match) {
    const day = parseInt(match[1]);
    const monthName = match[2];
    if (swedishMonths.hasOwnProperty(monthName)) {
      const month = swedishMonths[monthName];
      try {
        return set(now, { month, date: day });
      } catch (e) { /* ignore invalid date */ }
    }
  }
  
  match = lowerDateString.match(/^om\s+(\d+)\s+(dag|dagar|vecka|veckor|månad|månader)$/);
  if (match) {
    const amount = parseInt(match[1]);
    const unit = match[2];
    if (unit.startsWith('dag')) return addDays(now, amount);
    if (unit.startsWith('veck')) return addWeeks(now, amount);
    if (unit.startsWith('månad')) return addMonths(now, amount);
  }

  try {
    const parsedDate = parse(dateString, 'P', new Date(), { locale: sv });
     if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1970) return parsedDate;
  } catch (e) { /* ignore */ }
  
  console.warn(`Could not parse flexible date string: "${dateString}"`);
  return null;
};


export const parseFlexibleSwedishTimeString = (timeString: string, referenceDate: Date = new Date()): Date | null => {
  const lowerTimeString = timeString.toLowerCase().trim();

  let match = lowerTimeString.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
      return setMinutes(setHours(referenceDate, hours), minutes);
    }
  }

  match = lowerTimeString.match(/^(?:kl|klockan)\s*(\d{1,2})$/);
  if (match) {
    const hours = parseInt(match[1]);
    if (hours >= 0 && hours < 24) {
      return setMinutes(setHours(referenceDate, hours), 0);
    }
  }
  
  match = lowerTimeString.match(/^(\d{1,2})$/);
   if (match) {
    const hours = parseInt(match[1]);
    if (hours >= 0 && hours < 24) {
      return setMinutes(setHours(referenceDate, hours), 0);
    }
  }

  if (lowerTimeString.includes('morgon') || lowerTimeString.includes('förmiddag')) return setMinutes(setHours(referenceDate, 9), 0);
  if (lowerTimeString.includes('lunch')) return setMinutes(setHours(referenceDate, 12), 0);
  if (lowerTimeString.includes('eftermiddag')) return setMinutes(setHours(referenceDate, 15), 0);
  if (lowerTimeString.includes('kväll')) return setMinutes(setHours(referenceDate, 19), 0);

  console.warn(`Could not parse flexible time string: "${timeString}"`);
  return null;
};


export {
  format,
  parse,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addWeeks,
  subWeeks,
  addDays,
  isSameDay,
  isSameMonth,
  set,
  nextDay,
  add,
  sv as SwedishLocale
};
