const cron = require('node-cron');
const db = require('./db');
const { localDateStr, addDays } = require('./lib/dates');

function sweepOverdue() {
  const info = db.prepare("UPDATE dues SET status = 'overdue' WHERE status = 'pending' AND due_date < ?").run(localDateStr());
  if (info.changes > 0) console.log(`[cron] Marked ${info.changes} due(s) overdue`);
}

// Create this month's dues for every approved resident. The partial unique
// index on (automation_id, user_id, period_key) makes re-runs idempotent.
function runAutomation(automation) {
  const today = localDateStr();
  const periodKey = today.slice(0, 7);
  const monthLabel = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  const periodLabel = `${automation.name} — ${monthLabel}`;
  const dueDate = addDays(today, automation.window_days);
  const residents = db.prepare("SELECT id FROM users WHERE role = 'resident' AND status = 'approved'").all();
  const insert = db.prepare(
    `INSERT OR IGNORE INTO dues (user_id, amount, period_label, period_key, due_date, automation_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  let created = 0;
  const tx = db.transaction(() => {
    for (const r of residents) {
      created += insert.run(r.id, automation.amount, periodLabel, periodKey, dueDate, automation.id).changes;
    }
    db.prepare('UPDATE due_automations SET last_run_at = ? WHERE id = ?').run(new Date().toISOString(), automation.id);
  });
  tx();
  console.log(`[cron] Automation "${automation.name}": created ${created} due(s) for ${periodKey}`);
  return created;
}

function runDueAutomations() {
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const automations = db.prepare('SELECT * FROM due_automations WHERE active = 1').all();
  for (const a of automations) {
    // Trigger days past the month's end fire on the last day instead.
    const effectiveDay = Math.min(a.trigger_day, daysInMonth);
    if (today.getDate() !== effectiveDay) continue;
    const lastRunDay = a.last_run_at ? localDateStr(new Date(a.last_run_at)) : null;
    if (lastRunDay === localDateStr()) continue; // already ran today
    runAutomation(a);
  }
}

function dailyTasks() {
  try {
    sweepOverdue();
    runDueAutomations();
  } catch (err) {
    console.error('[cron] Daily tasks failed:', err);
  }
}

function startCron() {
  cron.schedule('10 1 * * *', dailyTasks); // 01:10 server time, every day
  // Also run at boot so a host that was asleep at 01:10 still catches up.
  setTimeout(dailyTasks, 3000);
}

module.exports = { startCron, runAutomation, sweepOverdue };
