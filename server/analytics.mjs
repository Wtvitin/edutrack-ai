import { localDate, monthEnd, monthStart, shiftDate, temporalPeriodDates } from './temporal.mjs';

export async function prepareAnalytics(data, days = 7, subject = 'all', { today = localDate(new Date()) } = {}) {
    const start = shiftDate(today, -(days - 1));
    const previousStart = shiftDate(start, -days);
    const previousEnd = shiftDate(start, -1);
    let sessions = data.sessions;
    if (subject !== 'all') sessions = sessions.filter(session => session.subjectId === subject);

    const currentSessions = sessions.filter(session => session.date >= start && session.date <= today);
    const previousSessions = sessions.filter(session => session.date >= previousStart && session.date <= previousEnd);
    const sumMinutes = entries => entries.reduce((total, session) => total + session.minutes, 0);
    const aggregateDaily = entries => Array.from({ length: days }, (_, index) => {
      const date = shiftDate(entries === currentSessions ? start : previousStart, index);
      return { date, minutes: sumMinutes(entries.filter(session => session.date === date)) };
    });
    const daily = aggregateDaily(currentSessions);
    const previousDaily = aggregateDaily(previousSessions);
    const totals = Object.fromEntries(daily.map(point => [point.date, point.minutes]));
    const tasks = data.tasks.filter(task => subject === 'all' || task.subjectId === subject);
    const active = tasks.filter(task => !task.done && task.status !== 'CANCELLED');
    const completed = tasks.filter(task => {
      const completedDate = task.completedAt ? localDate(new Date(task.completedAt)) : null;
      return task.done && completedDate && completedDate >= start && completedDate <= today;
    });
    const distribution = data.subjects.filter(item => subject === 'all' || item.id === subject).map(item => {
      const subset = active.filter(task => task.subjectId === item.id);
      return {
        name: item.name,
        minutes: sumMinutes(currentSessions.filter(session => session.subjectId === item.id)),
        pending: subset.length,
        estimatedMinutes: subset.reduce((total, task) => total + (task.estimatedMinutes || 0), 0),
      };
    });

    const minutes = sumMinutes(currentSessions);
    const previousMinutes = sumMinutes(previousSessions);
    return {
      days,
      start,
      end: today,
      minutes,
      previousMinutes,
      changePercent: previousMinutes ? Number(((minutes - previousMinutes) / previousMinutes * 100).toFixed(1)) : null,
      activeDays: Object.values(totals).filter(value => value > 0).length,
      sessions: currentSessions.length,
      previousSessions: previousSessions.length,
      averageSession: currentSessions.length ? Number((minutes / currentSessions.length).toFixed(1)) : 0,
      completed: completed.length,
      pending: active.length,
      overdue: active.filter(task => task.due && task.due < today).length,
      urgent: active.filter(task => task.priority === 'urgente' || task.priority === 'URGENT').length,
      estimatedMinutes: active.reduce((total, task) => total + (task.estimatedMinutes || 0), 0),
      daily,
      previousDaily,
      previousStart,
      previousEnd,
      subjects: distribution,
    };
}

const monthShift = (value, count) => {
  const date = new Date(`${monthStart(value)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7) + '-01';
};

function temporalBuckets(request, range) {
  if (request.unit === 'day') return Array.from({ length: request.count }, (_, index) => {
    const start = shiftDate(range.start, index);
    return { start, end: start, label: start, complete: true };
  });
  if (request.unit === 'week') return Array.from({ length: request.count }, (_, index) => {
    const start = shiftDate(range.start, index * 7);
    const naturalEnd = shiftDate(start, 6);
    const end = naturalEnd < range.end ? naturalEnd : range.end;
    return { start, end, label: `${start} a ${end}`, complete: naturalEnd <= range.end };
  });
  return Array.from({ length: request.count }, (_, index) => {
    const start = monthShift(range.start, index);
    const naturalEnd = monthEnd(start);
    return { start, end: naturalEnd < range.end ? naturalEnd : range.end, label: start.slice(0, 7), complete: naturalEnd <= range.end };
  });
}

export async function prepareTemporalAnalytics(data, request, { today } = {}) {
  const range = temporalPeriodDates(request, { today });
  const buckets = temporalBuckets(request, range);
  let sessions = data.sessions;
  if (request.subject && request.subject !== 'all') sessions = sessions.filter(session => session.subjectId === request.subject);
  const intervalSessions = sessions.filter(session => session.date >= range.start && session.date <= range.end);
  const recordStart = intervalSessions.length ? intervalSessions.reduce((earliest, session) => session.date < earliest ? session.date : earliest, intervalSessions[0].date) : null;
  const recordEnd = intervalSessions.length ? intervalSessions.reduce((latest, session) => session.date > latest ? session.date : latest, intervalSessions[0].date) : null;
  const periods = buckets.map(bucket => {
    const entries = sessions.filter(session => session.date >= bucket.start && session.date <= bucket.end);
    return { ...bucket, minutes: entries.reduce((sum, session) => sum + session.minutes, 0), sessions: entries.length };
  });
  return {
    metric: 'study_minutes',
    unit: request.unit,
    granularity: request.granularity,
    count: request.count,
    comparison: request.comparison,
    timezone: request.timezone,
    start: range.start,
    end: range.end,
    recordStart,
    recordEnd,
    periods,
    minutes: periods.reduce((sum, period) => sum + period.minutes, 0),
    sessions: periods.reduce((sum, period) => sum + period.sessions, 0),
    hasActivity: periods.some(period => period.sessions > 0),
  };
}
