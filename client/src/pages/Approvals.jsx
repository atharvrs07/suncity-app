import { useState } from 'react';
import { api, fmtDateTime } from '../api';
import { useFetch } from '../hooks';
import { GlassCard, Btn, Chip, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import { roleLabel, OFFICE_BEARER_PERMISSIONS } from '../constants';

const ALL_PERM_KEYS = OFFICE_BEARER_PERMISSIONS.map((p) => p.key);

export default function Approvals() {
  const { data, loading, reload } = useFetch('/api/approvals');
  // Per-pending-office-bearer permission selection. Defaults to all granted;
  // the admin unchecks whatever they don't want to delegate before approving.
  const [permSel, setPermSel] = useState({});

  const selFor = (u) => permSel[u.id] ?? ALL_PERM_KEYS;
  const togglePerm = (u, key) =>
    setPermSel((prev) => {
      const cur = prev[u.id] ?? ALL_PERM_KEYS;
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      return { ...prev, [u.id]: next };
    });

  async function act(u, action) {
    try {
      const body = action === 'approve' && u.role === 'office_bearer' ? { permissions: selFor(u) } : undefined;
      await api(`/api/approvals/${u.id}/${action}`, { method: 'POST', body });
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  const slotWarning = (u) => {
    if (!data || !u.role_detail) return null;
    const holder = data.slots[u.role] && data.slots[u.role][u.role_detail];
    return holder ? holder : null;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Approvals</h1>
          <p className="page-sub">Review pending signups</p>
        </div>
      </div>

      {loading && <Spinner />}
      {!loading && data && data.pending.length === 0 && (
        <Empty emoji="🎊" title="All caught up" sub="No pending signups to review." />
      )}

      <StaggerList>
        {data &&
          data.pending.map((u) => {
            const filled = slotWarning(u);
            const sel = selFor(u);
            return (
              <StaggerItem key={u.id}>
                <GlassCard>
                  <div className="row-between">
                    <span className="title-sm">{u.name}</span>
                    <Chip tone={u.role === 'admin' ? 'red' : u.role === 'resident' ? 'blue' : 'purple'}>
                      {roleLabel(u)}
                    </Chip>
                  </div>
                  <p className="muted" style={{ marginTop: 4 }}>
                    📱 {u.phone}
                    {u.flat_no ? ` · Flat ${u.flat_no}` : ''}
                  </p>
                  <p className="tiny" style={{ marginTop: 3 }}>
                    Requested {fmtDateTime(u.created_at)}
                  </p>
                  {filled && (
                    <p className="tiny" style={{ marginTop: 6, color: 'var(--orange)', fontWeight: 700 }}>
                      ⚠️ The {u.role_detail} slot is already held by {filled}
                    </p>
                  )}

                  {u.role === 'office_bearer' && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(140,140,170,0.18)' }}>
                      <p className="tiny" style={{ marginBottom: 8, fontWeight: 700 }}>
                        PERMISSIONS TO GRANT
                      </p>
                      <div className="stack" style={{ gap: 6 }}>
                        {OFFICE_BEARER_PERMISSIONS.map((p) => (
                          <label key={p.key} className="row" style={{ gap: 9, alignItems: 'flex-start', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              checked={sel.includes(p.key)}
                              onChange={() => togglePerm(u, p.key)}
                              style={{ marginTop: 3 }}
                            />
                            <span>
                              <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                                {p.emoji} {p.label}
                              </span>
                              <span className="tiny" style={{ display: 'block' }}>
                                {p.desc}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="row" style={{ marginTop: 12 }}>
                    <Btn variant="success" sm onClick={() => act(u, 'approve')}>
                      ✓ Approve
                    </Btn>
                    <Btn variant="danger" sm onClick={() => act(u, 'reject')}>
                      ✕ Reject
                    </Btn>
                  </div>
                </GlassCard>
              </StaggerItem>
            );
          })}

        {data && (
          <>
            <StaggerItem>
              <h2 className="title-sm" style={{ marginTop: 10 }}>
                🪑 Office bearer slots
              </h2>
            </StaggerItem>
            <StaggerItem>
              <GlassCard>
                <div className="stack" style={{ gap: 7 }}>
                  {Object.entries(data.slots.office_bearer).map(([slot, holder]) => (
                    <div className="row-between" key={slot}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{slot}</span>
                      {holder ? <Chip tone="green">{holder}</Chip> : <Chip tone="gray">Vacant</Chip>}
                    </div>
                  ))}
                </div>
              </GlassCard>
            </StaggerItem>
            <StaggerItem>
              <h2 className="title-sm" style={{ marginTop: 4 }}>
                🧰 Supervisor slots
              </h2>
            </StaggerItem>
            <StaggerItem>
              <GlassCard>
                <div className="stack" style={{ gap: 7 }}>
                  {Object.entries(data.slots.supervisor).map(([slot, holder]) => (
                    <div className="row-between" key={slot}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, textTransform: 'capitalize' }}>
                        {slot} Supervisor
                      </span>
                      {holder ? <Chip tone="green">{holder}</Chip> : <Chip tone="gray">Vacant</Chip>}
                    </div>
                  ))}
                </div>
              </GlassCard>
            </StaggerItem>
          </>
        )}
      </StaggerList>
    </>
  );
}
