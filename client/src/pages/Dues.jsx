import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, fmtMoney, fmtDate, todayStr } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Toggle, Sheet, Segmented, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import PaymentQR from '../components/PaymentQR';
import CallButton from '../components/CallButton';
import { DUE_STATUS, BLOCKS, hasPerm } from '../constants';

export default function Dues() {
  const { user } = useAuth();
  // Admins, the super admin, and office bearers granted manage_dues get the
  // management view; everyone else sees their own dues.
  return hasPerm(user, 'manage_dues') ? <AdminDues /> : <MyDues />;
}

/* ---------------- resident view ---------------- */

// The lifecycle badge for a due, making the payment state explicit (item 22):
// Submitted → AI-checked (provisional receipt) / Flagged → Verified.
function paymentState(d) {
  const p = d.latest_payment;
  if (d.status === 'paid') return { label: p && p.receipt_at ? 'Paid · receipt emailed' : 'Paid', tone: 'green' };
  // A duplicate submission leaves the due payable again but is flagged for review.
  if (p && p.status === 'duplicate') return { label: 'Duplicate — under review', tone: 'red' };
  if (d.status === 'submitted') {
    if (p && p.ai_verdict === 'pass') return { label: 'AI-checked · provisional receipt sent', tone: 'blue' };
    if (p && (p.ai_verdict === 'suspicious' || p.ai_verdict === 'error')) return { label: 'Flagged for manual review', tone: 'orange' };
    return { label: 'Awaiting verification', tone: 'blue' };
  }
  return DUE_STATUS[d.status] || null;
}

// The dues this payment was auto-mapped against ("June ₹1,500, July ₹500").
function allocationSummary(p) {
  const a = p && Array.isArray(p.allocations) ? p.allocations : [];
  if (!a.length) return null;
  return a.map((x) => `${x.period_label} (${fmtMoney(x.amount)})`).join(', ');
}

function MyDues() {
  const { t } = useTranslation();
  const { data, loading, reload } = useFetch('/api/dues/mine');
  const [paying, setPaying] = useState(null);
  const [extending, setExtending] = useState(null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('dues.title')}</h1>
          <p className="page-sub">Pay via UPI — enter your UTR or upload a screenshot</p>
        </div>
      </div>

      {loading && <Spinner />}
      {!loading && data && data.dues.length === 0 && (
        <Empty emoji="🎉" title={t('home.noDues')} sub={t('home.allClear')} />
      )}

      <StaggerList>
        {data &&
          data.dues.map((d) => {
            const st = paymentState(d);
            const payable = ['pending', 'overdue'].includes(d.status);
            const extLeft = 5 - (d.extension_days_used || 0);
            const p = d.latest_payment;
            const paidSoFar = Number(d.amount_paid || 0);
            const balance = Number(d.amount) - paidSoFar;
            const partial = paidSoFar > 0.001 && balance > 0.001 && d.status !== 'paid';
            const allocSummary = allocationSummary(p);
            return (
              <StaggerItem key={d.id}>
                <GlassCard>
                  <div className="row-between">
                    <span className="title-sm">{d.period_label}</span>
                    {st && <Chip tone={st.tone}>{st.label}</Chip>}
                  </div>
                  <div className="row-between" style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800 }}>{fmtMoney(d.amount)}</span>
                    <span className="muted">Due {fmtDate(d.due_date)}</span>
                  </div>
                  {partial && (
                    <p className="tiny" style={{ marginTop: 6, fontWeight: 600 }}>
                      {fmtMoney(paidSoFar)} paid · {fmtMoney(balance)} balance
                    </p>
                  )}
                  {allocSummary && (p == null || p.status !== 'duplicate') && (
                    <p className="tiny" style={{ marginTop: 6 }}>Applied to: {allocSummary}</p>
                  )}
                  {p && p.status === 'duplicate' && (
                    <p className="tiny" style={{ marginTop: 6, color: 'var(--red)' }}>
                      ⚠ This transaction was already submitted before. The society office will review it — you don’t need to pay again unless asked.
                    </p>
                  )}
                  {d.status === 'submitted' && p && p.ai_verdict === 'pass' && (
                    <p className="tiny" style={{ marginTop: 6, color: 'var(--green)' }}>
                      ✓ Screenshot checked — a provisional receipt was emailed. Awaiting final verification by the society.
                    </p>
                  )}
                  {d.status === 'submitted' && p && (p.ai_verdict === 'suspicious' || p.ai_verdict === 'error') && (
                    <p className="tiny" style={{ marginTop: 6, color: 'var(--orange)' }}>
                      ⚠ {p.ai_reason || 'This payment needs manual verification by the society office.'}
                    </p>
                  )}
                  {d.status === 'submitted' && (!p || !p.ai_verdict) && (
                    <p className="tiny" style={{ marginTop: 6 }}>
                      {p && p.utr_reference && p.utr_reference !== 'via-screenshot' ? <>UTR {p.utr_reference} — </> : null}
                      waiting for verification
                    </p>
                  )}
                  {p && p.status === 'rejected' && payable && (
                    <p className="tiny" style={{ marginTop: 6, color: 'var(--red)' }}>
                      Last payment couldn’t be verified — please resubmit
                    </p>
                  )}
                  {payable && (
                    <div className="row wrap" style={{ marginTop: 12 }}>
                      <Btn sm onClick={() => setPaying(d)}>
                        💳 {t('dues.pay')}
                      </Btn>
                      {extLeft > 0 && (
                        <Btn variant="ghost" sm onClick={() => setExtending(d)}>
                          ⏰ Extension ({extLeft}d left)
                        </Btn>
                      )}
                    </div>
                  )}
                </GlassCard>
              </StaggerItem>
            );
          })}
      </StaggerList>

      <PaySheet due={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); reload(); }} />
      <ExtensionSheet due={extending} onClose={() => setExtending(null)} onDone={() => { setExtending(null); reload(); }} />
    </>
  );
}

function PaySheet({ due, onClose, onDone }) {
  const { t } = useTranslation();
  const [utr, setUtr] = useState('');
  const [screenshot, setScreenshot] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { message, ai }

  useEffect(() => {
    setUtr('');
    setScreenshot(null);
    setError('');
    setResult(null);
    setBusy(false);
  }, [due]);

  async function submit(e) {
    e.preventDefault();
    if (!screenshot && utr.trim().length < 6) {
      setError('Enter your UTR / reference or upload a payment screenshot.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      if (utr.trim()) fd.append('utr_reference', utr.trim());
      if (screenshot) fd.append('screenshot', screenshot);
      const r = await api(`/api/dues/${due.id}/payment`, { method: 'POST', form: fd });
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!due} onClose={onClose} title={due ? `${t('dues.pay')} ${fmtMoney(due.amount)}` : ''}>
      {due && (
        <>
          {error && <div className="err-banner">{error}</div>}

          {result ? (
            <>
              <div
                className={
                  result.ai && ['suspicious', 'error', 'duplicate'].includes(result.ai.verdict) ? 'err-banner' : 'ok-banner'
                }
              >
                {result.message}
              </div>
              {result.ai && result.ai.txn_id && (
                <p className="tiny">Detected transaction ID: <b className="break-anywhere">{result.ai.txn_id}</b></p>
              )}
              {result.ai && Array.isArray(result.ai.allocations) && result.ai.allocations.length > 0 && (
                <p className="tiny" style={{ marginTop: 4 }}>
                  Applied to:{' '}
                  {result.ai.allocations.map((a) => `${a.period_label} (${fmtMoney(a.amount)})`).join(', ')}
                </p>
              )}
              {result.ai && result.ai.reason && (
                <p className="tiny" style={{ marginTop: 4 }}>{result.ai.reason}</p>
              )}
              <Btn block style={{ marginTop: 14 }} onClick={onDone}>
                Done
              </Btn>
            </>
          ) : (
            <>
              <PaymentQR amount={due.amount} tr={`DUE${due.id}`} />
              <form onSubmit={submit} style={{ marginTop: 16 }}>
                <Field label="PAYMENT SCREENSHOT (RECOMMENDED — AI-CHECKED)">
                  <input
                    className="input"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setScreenshot(e.target.files[0] || null)}
                  />
                </Field>
                <Field label="UTR / TRANSACTION REFERENCE (OPTIONAL IF SCREENSHOT ADDED)">
                  <input
                    className="input break-anywhere"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    placeholder="From your UPI app after paying"
                  />
                </Field>
                <Btn block disabled={busy} type="submit">
                  {busy ? (screenshot ? t('dues.aiChecking') : 'Submitting…') : 'Submit for Verification'}
                </Btn>
              </form>
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

function ExtensionSheet({ due, onClose, onDone }) {
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const maxDays = due ? 5 - (due.extension_days_used || 0) : 5;

  useEffect(() => {
    setDays(1);
    setReason('');
    setError('');
  }, [due]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/extensions', { method: 'POST', body: { due_id: due.id, days: Number(days), reason } });
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!due} onClose={onClose} title="Request Due Extension">
      {due && (
        <>
          {error && <div className="err-banner">{error}</div>}
          <p className="muted" style={{ marginBottom: 13 }}>
            {due.period_label} · currently due {fmtDate(due.due_date)}. Max 5 extra days total per due.
          </p>
          <form onSubmit={submit}>
            <Field label="EXTRA DAYS">
              <select className="input" value={days} onChange={(e) => setDays(e.target.value)}>
                {Array.from({ length: maxDays }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n} day{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="REASON (OPTIONAL)">
              <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Btn block disabled={busy} type="submit">
              {busy ? 'Requesting…' : 'Request Extension'}
            </Btn>
          </form>
        </>
      )}
    </Sheet>
  );
}

/* ---------------- admin view ---------------- */

const ADMIN_TABS = [
  { value: 'payments', label: 'Verify' },
  { value: 'dues', label: 'All Dues' },
  { value: 'overdue', label: 'Overdue Watch' },
  { value: 'extensions', label: 'Extensions' },
];

function AdminDues() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('payments');
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('dues.title')}</h1>
          <p className="page-sub">Payments, verification & overdue tracking</p>
        </div>
      </div>

      {/* Always-visible unpaid-residents drill-down (item 19). */}
      <UnpaidCard />

      <div style={{ marginBottom: 14 }}>
        <Segmented options={ADMIN_TABS} value={tab} onChange={setTab} />
      </div>
      {tab === 'payments' && <PaymentsTab />}
      {tab === 'dues' && <AllDuesTab />}
      {tab === 'overdue' && <OverdueTab />}
      {tab === 'extensions' && <ExtensionsTab />}
    </>
  );
}

// Count of residents with unpaid dues; tap to expand the full list, each with a
// Call CTA (item 19). Reuses the collections Call button + its phone branching.
function UnpaidCard() {
  const { data } = useFetch('/api/dues/unpaid-residents');
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <GlassCard className="card-press" onClick={() => setOpen((o) => !o)}>
        <div className="row-between">
          <div className="grow">
            <div className="title-sm">Residents who haven’t paid</div>
            <div className="muted">Tap to {open ? 'hide' : 'view'} the list & call them</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{data.count}</div>
            <div className="tiny">unpaid</div>
          </div>
        </div>
      </GlassCard>
      {open && data.residents.length > 0 && (
        <div className="stack" style={{ marginTop: 10 }}>
          {data.residents.map((r) => (
            <GlassCard key={r.user_id}>
              <div className="row-between">
                <span className="title-sm">
                  {r.name}
                  {r.flat_no ? ` (${r.flat_no})` : ''}
                </span>
                <span style={{ fontWeight: 800 }}>{fmtMoney(r.unpaid_amount || 0)}</span>
              </div>
              <div className="row-between" style={{ marginTop: 5 }}>
                <span className="muted">
                  {r.block ? `${r.block} · ` : ''}
                  {r.unpaid_count} unpaid{r.overdue_count ? ` · ${r.overdue_count} overdue` : ''}
                </span>
                <CallButton phone={r.phone} name={r.name} />
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

const PAYMENT_TABS = [
  { value: 'submitted', label: 'To verify' },
  { value: 'duplicate', label: 'Duplicates' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

function PaymentsTab() {
  const [pstatus, setPstatus] = useState('submitted');
  const { data, loading, reload } = useFetch(`/api/dues/payments/list?status=${pstatus}`);
  const actionable = pstatus === 'submitted' || pstatus === 'duplicate';

  async function act(id, action) {
    try {
      const r = await api(`/api/dues/payments/${id}/${action}`, { method: 'POST' });
      if (r.message) alert(r.message);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  const emptySub = {
    submitted: 'Submitted payments awaiting verification appear here.',
    duplicate: 'Payments flagged as duplicate transactions appear here.',
    verified: 'Verified payments appear here.',
    rejected: 'Rejected payments appear here.',
  }[pstatus];

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Segmented options={PAYMENT_TABS} value={pstatus} onChange={setPstatus} />
      </div>
      {loading && <Spinner />}
      {!loading && (!data || data.payments.length === 0) && <Empty emoji="✅" title="Nothing here" sub={emptySub} />}
      <StaggerList>
        {data &&
          data.payments.map((p) => {
            const isDup = p.status === 'duplicate' || p.ai_verdict === 'duplicate';
            const verdictChip = isDup
              ? { tone: 'red', label: 'Duplicate' }
              : p.ai_verdict === 'pass'
                ? { tone: 'green', label: 'AI: looks genuine' }
                : p.ai_verdict === 'suspicious'
                  ? { tone: 'orange', label: 'AI: flagged' }
                  : p.ai_verdict === 'error'
                    ? { tone: 'gray', label: 'AI: unchecked' }
                    : null;
            const alloc = Array.isArray(p.allocations) ? p.allocations : [];
            return (
              <StaggerItem key={p.id}>
                <GlassCard>
                  <div className="row-between">
                    <span className="title-sm">
                      {p.resident_name}
                      {p.resident_flat ? ` (${p.resident_flat})` : ''}
                    </span>
                    <span style={{ fontWeight: 800 }}>{fmtMoney(p.amount)}</span>
                  </div>
                  <p className="muted" style={{ marginTop: 4 }}>{p.period_label}</p>
                  <p className="tiny break-anywhere" style={{ marginTop: 4 }}>
                    Txn / UTR: <b>{p.txn_id || p.utr_reference}</b>
                    {p.txn_datetime ? ` · ${p.txn_datetime}` : ''}
                  </p>
                  {alloc.length > 0 && (
                    <p className="tiny" style={{ marginTop: 4 }}>
                      Applied to: {alloc.map((a) => `${a.period_label} (${fmtMoney(a.amount)})`).join(', ')}
                    </p>
                  )}
                  {(verdictChip || p.provisional_receipt_at) && (
                    <div className="row wrap" style={{ marginTop: 8, gap: 8 }}>
                      {verdictChip && <Chip tone={verdictChip.tone}>{verdictChip.label}</Chip>}
                      {p.provisional_receipt_at && <Chip tone="blue">Provisional receipt sent</Chip>}
                    </div>
                  )}
                  {isDup && (
                    <p className="tiny" style={{ marginTop: 6, color: 'var(--red)' }}>
                      ⚠ This transaction ID / UTR was already submitted elsewhere — investigate before verifying.
                    </p>
                  )}
                  {p.ai_reason && !isDup && <p className="tiny" style={{ marginTop: 6 }}>{p.ai_reason}</p>}
                  {p.screenshot && (
                    <a href={p.screenshot} target="_blank" rel="noreferrer" className="more-link" style={{ marginTop: 6 }}>
                      🖼️ View screenshot
                    </a>
                  )}
                  {actionable && (
                    <div className="row" style={{ marginTop: 10 }}>
                      <Btn variant="success" sm onClick={() => act(p.id, 'verify')}>
                        {isDup ? '✓ Verify anyway' : '✓ Verify & send receipt'}
                      </Btn>
                      <Btn variant="danger" sm onClick={() => act(p.id, 'reject')}>
                        ✕ Reject
                      </Btn>
                    </div>
                  )}
                </GlassCard>
              </StaggerItem>
            );
          })}
      </StaggerList>
    </>
  );
}

function AllDuesTab() {
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useFetch(`/api/dues${status ? `?status=${status}` : ''}`);
  const [showNew, setShowNew] = useState(false);
  const [residents, setResidents] = useState([]);
  const [perBlock, setPerBlock] = useState(false);
  const [blockAmounts, setBlockAmounts] = useState({});
  const [form, setForm] = useState({ all_residents: true, user_id: '', amount: '', period_label: '', due_date: todayStr() });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/users').then((d) => setResidents(d.users.filter((u) => u.status === 'approved'))).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = {
        all_residents: form.all_residents,
        user_id: form.all_residents ? undefined : form.user_id || undefined,
        amount: form.amount,
        period_label: form.period_label,
        due_date: form.due_date,
      };
      // Per-block overrides only apply to an all-residents due (item 19).
      if (form.all_residents && perBlock) {
        const map = {};
        for (const [b, v] of Object.entries(blockAmounts)) {
          if (v !== '' && v != null) map[b] = Number(v);
        }
        if (Object.keys(map).length) body.block_amounts = map;
      }
      await api('/api/dues', { method: 'POST', body });
      setShowNew(false);
      setPerBlock(false);
      setBlockAmounts({});
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function markPaid(d) {
    if (!confirm(`Mark ${d.resident_name}'s ${fmtMoney(d.amount)} due as paid?`)) return;
    try {
      await api(`/api/dues/${d.id}/mark-paid`, { method: 'PATCH' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <select className="input" style={{ maxWidth: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(DUE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        <Btn sm onClick={() => setShowNew(true)}>
          + New Due
        </Btn>
      </div>

      {loading && <Spinner />}
      {!loading && data && data.dues.length === 0 && <Empty emoji="🗂️" title="No dues found" />}

      <StaggerList>
        {data &&
          data.dues.map((d) => {
            const st = DUE_STATUS[d.status];
            return (
              <StaggerItem key={d.id}>
                <GlassCard>
                  <div className="row-between">
                    <span className="title-sm">
                      {d.resident_name}
                      {d.resident_flat ? ` (${d.resident_flat})` : ''}
                    </span>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </div>
                  <div className="row-between" style={{ marginTop: 5 }}>
                    <span className="muted">{d.period_label}{d.resident_block ? ` · ${d.resident_block}` : ''}</span>
                    <span style={{ fontWeight: 800 }}>{fmtMoney(d.amount)}</span>
                  </div>
                  {Number(d.amount_paid) > 0.001 && d.status !== 'paid' && (
                    <p className="tiny" style={{ marginTop: 4, fontWeight: 600 }}>
                      {fmtMoney(d.amount_paid)} paid · {fmtMoney(d.amount - d.amount_paid)} balance
                    </p>
                  )}
                  <div className="row-between" style={{ marginTop: 6 }}>
                    <span className="tiny">Due {fmtDate(d.due_date)}</span>
                    {d.status !== 'paid' && (
                      <Btn variant="ghost" sm onClick={() => markPaid(d)}>
                        Mark Paid
                      </Btn>
                    )}
                  </div>
                </GlassCard>
              </StaggerItem>
            );
          })}
      </StaggerList>

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Create Due">
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Toggle
            label="For all approved residents"
            checked={form.all_residents}
            onChange={(v) => setForm((f) => ({ ...f, all_residents: v }))}
          />
          {!form.all_residents && (
            <Field label="RESIDENT">
              <select
                className="input"
                value={form.user_id}
                onChange={(e) => setForm((f) => ({ ...f, user_id: e.target.value }))}
                required
              >
                <option value="">Select…</option>
                {residents
                  .filter((u) => u.role === 'resident')
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.flat_no ? `(${u.flat_no})` : ''}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <Field label={perBlock ? 'DEFAULT AMOUNT (₹) — used for blocks below left blank' : 'AMOUNT (₹)'}>
            <input
              className="input"
              type="number"
              min="1"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </Field>
          {form.all_residents && (
            <Toggle label="Different amount per block" checked={perBlock} onChange={setPerBlock} />
          )}
          {form.all_residents && perBlock && (
            <div className="stack" style={{ marginBottom: 13 }}>
              {BLOCKS.map((b) => (
                <div className="row-between" key={b}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{b}</span>
                  <input
                    className="input"
                    type="number"
                    min="1"
                    step="0.01"
                    style={{ maxWidth: 140 }}
                    placeholder="default"
                    value={blockAmounts[b] || ''}
                    onChange={(e) => setBlockAmounts((m) => ({ ...m, [b]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}
          <Field label="PERIOD LABEL">
            <input
              className="input"
              value={form.period_label}
              onChange={(e) => setForm((f) => ({ ...f, period_label: e.target.value }))}
              placeholder="e.g. Festival Fund — 2026"
              required
            />
          </Field>
          <Field label="DUE DATE">
            <input
              className="input"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              required
            />
          </Field>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Creating…' : 'Create Due'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}

function OverdueTab() {
  const { data, loading, reload } = useFetch('/api/dues/overdue-watch');

  async function markPaid(row) {
    if (!confirm(`Mark ${row.name}'s ${fmtMoney(row.amount)} due as paid?`)) return;
    try {
      await api(`/api/dues/${row.due_id}/mark-paid`, { method: 'PATCH' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <Spinner />;
  if (!data || data.overdue.length === 0)
    return <Empty emoji="🌈" title="Nobody is overdue" sub="This list is generated automatically from unpaid dues." />;

  return (
    <StaggerList>
      {data.overdue.map((row) => (
        <StaggerItem key={row.due_id}>
          <GlassCard>
            <div className="row-between">
              <span className="title-sm">
                {row.name}
                {row.flat_no ? ` (${row.flat_no})` : ''}
              </span>
              <Chip tone="red">{row.days_overdue}d overdue</Chip>
            </div>
            <div className="row-between" style={{ marginTop: 5 }}>
              <span className="muted">{row.period_label}</span>
              <span style={{ fontWeight: 800 }}>{fmtMoney(row.amount)}</span>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <CallButton phone={row.phone} name={row.name} />
              <Btn variant="success" sm onClick={() => markPaid(row)}>
                ✓ Mark as Paid
              </Btn>
            </div>
          </GlassCard>
        </StaggerItem>
      ))}
    </StaggerList>
  );
}

function ExtensionsTab() {
  const { data, loading, reload } = useFetch('/api/extensions?status=pending');

  async function act(id, action) {
    try {
      const r = await api(`/api/extensions/${id}/${action}`, { method: 'POST' });
      if (r.message) alert(r.message);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <Spinner />;
  if (!data || data.requests.length === 0)
    return <Empty emoji="⏰" title="No pending requests" sub="Extension requests from residents show up here." />;

  return (
    <StaggerList>
      {data.requests.map((r) => (
        <StaggerItem key={r.id}>
          <GlassCard>
            <div className="row-between">
              <span className="title-sm">
                {r.resident_name}
                {r.resident_flat ? ` (${r.resident_flat})` : ''}
              </span>
              <Chip tone="orange">+{r.days_requested} days</Chip>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              {r.period_label} · {fmtMoney(r.amount)} · due {fmtDate(r.due_date)}
            </p>
            {r.reason && (
              <p className="tiny" style={{ marginTop: 4 }}>
                “{r.reason}”
              </p>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <Btn variant="success" sm onClick={() => act(r.id, 'approve')}>
                ✓ Approve
              </Btn>
              <Btn variant="danger" sm onClick={() => act(r.id, 'reject')}>
                ✕ Reject
              </Btn>
            </div>
          </GlassCard>
        </StaggerItem>
      ))}
    </StaggerList>
  );
}
