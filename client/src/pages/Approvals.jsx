import { api, fmtDateTime } from '../api';
import { useFetch } from '../hooks';
import { GlassCard, Btn, Chip, Empty, Spinner, StaggerList, StaggerItem } from '../components/Glass';
import { roleLabel } from '../constants';

export default function Approvals() {
  const { data, loading, reload } = useFetch('/api/approvals');

  async function act(id, action) {
    try {
      await api(`/api/approvals/${id}/${action}`, { method: 'POST' });
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
                    <p
                      className="tiny"
                      style={{ marginTop: 6, color: 'var(--orange)', fontWeight: 700 }}
                    >
                      ⚠️ The {u.role_detail} slot is already held by {filled}
                    </p>
                  )}
                  <div className="row" style={{ marginTop: 10 }}>
                    <Btn variant="success" sm onClick={() => act(u.id, 'approve')}>
                      ✓ Approve
                    </Btn>
                    <Btn variant="danger" sm onClick={() => act(u.id, 'reject')}>
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
