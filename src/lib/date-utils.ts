import { format, parse, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, addWeeks, subWeeks, setHours, setMinutes, getHours, getMinutes, addDays, isSameDay, isSameMonth } from 'date-fns';
import { sv } from 'date-fns/locale'; // For Swedish day/month names if needed

export const DATE_FORMAT = 'yyyy-MM-dd';
export const TIME_FORMAT = 'HH:mm';
export const DISPLAY_DATE_FORMAT = 'PPP'; // e.g., "July 15th, 2024"
export const DISPLAY_TIME_FORMAT = 'p'; // e.g., "10:00 AM"
export const DISPLAY_MONTH_YEAR_FORMAT = 'MMMM yyyy';

export const formatInputDate = (date: Date): string => format(date, DATE_FORMAT);
export const formatInputTime = (date: Date): string => format(date, TIME_FORMAT);

export const parseInputDate = (dateString: string): Date => parse(dateString, DATE_FORMAT, new Date());
export const parseInputTime = (timeString: string, referenceDate: Date = new Date()): Date => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return setMinutes(setHours(referenceDate, hours), minutes);
};

export const combineDateAndTime = (date: Date, time: Date): Date => {
  return setMinutes(setHours(date, getHours(time)), getMinutes(time));
};

export const getMonthNameYear = (date: Date): string => format(date, DISPLAY_MONTH_YEAR_FORMAT, { locale: sv });
export const getDayOfWeekShort = (date: Date): string => format(date, 'EEE', { locale: sv }); // Mon, Tue, etc. in Swedish

export const getDaysInMonth = (date: Date): Date[] => {
  const start = startOfWeek(startOfMonth(date), { locale: sv });
  const end = endOfWeek(endOfMonth(date), { locale: sv });
  return eachDayOfInterval({ start, end });
};

export const getWeekDays = (date: Date): Date[] => {
  const start = startOfWeek(date, { locale: sv });
  const end = endOfWeek(date, { locale: sv });
  return eachDayOfInterval({ start, end });
};

export const getHoursInDay = (): Date[] => {
  const hours = [];
  for (let i = 0; i < 24; i++) {
    hours.push(setMinutes(setHours(new Date(), i), 0));
  }
  return hours;
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
  sv as SwedishLocale
};
