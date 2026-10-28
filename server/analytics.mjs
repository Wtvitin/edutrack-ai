const localDate = date => date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const shiftDate = (date, days) => {
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
};

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
