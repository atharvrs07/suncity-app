import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, fmtMoney, fmtDate, todayStr } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { GlassCard, Btn, Chip, Field, Toggle, Sheet, Segmented, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import { DUE_STATUS } from '../constants';

export default function Dues() {
  const { user } = useAuth();
  return user.role === 'admin' ? <AdminDues /> : <MyDues />;
}

/* ---------------- resident view ---------------- */

function MyDues() {
  const { data, loading, reload } = useFetch('/api/dues/mine');
  const [paying, setPaying] = useState(null);
  const [extending, setExtending] = useState(null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dues</h1>
          <p className="page-sub">Pay via UPI and submit your UTR reference</p>
        </div>
      </div>

      {loading && <Spinner />}
      {!loading && data && data.dues.length === 0 && (
        <Empty emoji="🎉" title="No dues" sub="You're all settled up!" />
      )}

      <StaggerList>
        {data &&
          data.dues.map((d) => {
            const st = DUE_STATUS[d.status];
            const payable = ['pending', 'overdue'].includes(d.status);
            const extLeft = 5 - (d.extension_days_used || 0);
            return (
              <StaggerItem key={d.id}>
                <GlassCard>
                  <div className="row-between">
                    <span className="title-sm">{d.period_label}</span>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </div>
                  <div className="row-between" style={{ marginTop: 8 }}>
                    <span style={{ fontSize: 22, fontWeight: 800 }}>{fmtMoney(d.amount)}</span>
                    <span className="muted">Due {fmtDate(d.due_date)}</span>
                  </div>
                  {d.status === 'submitted' && d.latest_payment && (
                    <p className="tiny" style={{ marginTop: 6 }}>
                      UTR {d.latest_payment.utr_reference} — waiting for admin verification
                    </p>
                  )}
                  {d.latest_payment && d.latest_payment.status === 'rejected' && payable && (
                    <p className="tiny" style={{ marginTop: 6, color: 'var(--red)' }}>
                      Last payment was rejected — please resubmit
                    </p>
                  )}
                  {payable && (
                    <div className="row" style={{ marginTop: 12 }}>
                      <Btn sm onClick={() => setPaying(d)}>
                        💳 Pay Now
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
  const [qr, setQr] = useState(null);
  const [upi, setUpi] = useState(null);
  const [utr, setUtr] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!due) return;
    setQr(null);
    setUtr('');
    setError('');
    api('/api/dues/upi-config').then((cfg) => {
      setUpi(cfg);
      const uri = `upi://pay?pa=${encodeURIComponent(cfg.vpa)}&pn=${encodeURIComponent(cfg.payee_name)}&am=${due.amount}&tr=DUE${due.id}&cu=INR`;
      QRCode.toDataURL(uri, { width: 260, margin: 2 }).then(setQr);
    }).catch((e) => setError(e.message));
  }, [due]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/api/dues/${due.id}/payment`, { method: 'POST', body: { utr_reference: utr } });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Sheet open={!!due} onClose={onClose} title={due ? `Pay ${fmtMoney(due.amount)}` : ''}>
      {due && (
        <>
          {error && <div className="err-banner">{error}</div>}
          <div style={{ textAlign: 'center' }}>
            {qr ? (
              <img src={qr} alt="UPI QR code" style={{ borderRadius: 18, background: '#fff', padding: 6 }} />
            ) : (
              <Spinner />
            )}
            {upi && (
              <p className="muted" style={{ marginTop: 6 }}>
                Scan with any UPI app · {upi.vpa}
              </p>
            )}
          </div>
          <form onSubmit={submit} style={{ marginTop: 16 }}>
            <Field label="UTR / TRANSACTION REFERENCE">
              <input
                className="input"
                value={utr}
                onChange={(e) => setUtr(e.target.value)}
                placeholder="From your UPI app after paying"
                required
              />
            </Field>
            <Btn block disabled={busy} type="submit">
              {busy ? 'Submitting…' : 'Submit for Verification'}
            </Btn>
          </form>
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
  const [tab, setTab] = useState('payments');
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dues</h1>
          <p className="page-sub">Payments, verification & overdue tracking</p>
        </div>
      </div>
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

function PaymentsTab() {
  const { data, loading, reload } = useFetch('/api/dues/payments/list?status=submitted');

  async function act(id, action) {
    try {
      await api(`/api/dues/payments/${id}/${action}`, { method: 'POST' });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <Spinner />;
  if (!data || data.payments.length === 0)
    return <Empty emoji="✅" title="Nothing to verify" sub="Submitted payments will appear here." />;

  return (
    <StaggerList>
      {data.payments.map((p) => (
        <StaggerItem key={p.id}>
          <GlassCard>
            <div className="row-between">
              <span className="title-sm">
                {p.resident_name}
                {p.resident_flat ? ` (${p.resident_flat})` : ''}
              </span>
              <span style={{ fontWeight: 800 }}>{fmtMoney(p.amount)}</span>
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              {p.period_label}
            </p>
            <p className="tiny" style={{ marginTop: 4 }}>
              UTR: <b>{p.utr_reference}</b>
            </p>
            <div className="row" style={{ marginTop: 10 }}>
              <Btn variant="success" sm onClick={() => act(p.id, 'verify')}>
                ✓ Verify
              </Btn>
              <Btn variant="danger" sm onClick={() => act(p.id, 'reject')}>
                ✕ Reject
              </Btn>
            </div>
          </GlassCard>
        </StaggerItem>
      ))}
    </StaggerList>
  );
}

function AllDuesTab() {
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useFetch(`/api/dues${status ? `?status=${status}` : ''}`);
  const [showNew, setShowNew] = useState(false);
  const [residents, setResidents] = useState([]);
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
      await api('/api/dues', { method: 'POST', body: { ...form, user_id: form.user_id || undefined } });
      setShowNew(false);
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
                    <span className="muted">{d.period_label}</span>
                    <span style={{ fontWeight: 800 }}>{fmtMoney(d.amount)}</span>
                  </div>
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
          <Field label="AMOUNT (₹)">
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
              <a href={`tel:${row.phone}`}>
                <Btn variant="ghost" sm>
                  📞 Call
                </Btn>
              </a>
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
