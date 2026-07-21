import { Field } from './Glass';
import { BLOCKS, RESIDENT_STATUSES } from '../constants';
import { useHouseNumbers, useHouseOccupancy } from '../houseNumbers';

// Resident Status + Block + dependent House No. selects, shared by the signup,
// OAuth complete-profile, and admin-edit forms. These three describe "who you are
// in the society" and move together:
//   • Resident Status (Owner / Resident) is chosen first — a house holds at most
//     one of each, so availability depends on it.
//   • Block gates House No.: House No. stays disabled until both a status and a
//     block are chosen, then lists only that block's numbers.
//   • Houses whose chosen-status slot is already registered (or that are fully
//     occupied) are shown but greyed out and unselectable (Section 7). The server
//     enforces the same lock, so this is purely a helpful UI hint.
// Changing Block clears the House No. selection (done here so callers can't
// forget). `ignore` = the account's own current { block, houseNo, status } and
// keeps that one slot selectable (used by admin edit so an unchanged re-save
// passes). All three fields are required unless `statusRequired` is false.
export default function BlockHousePicker({
  status,
  houseNo,
  block,
  onStatusChange,
  onBlockChange,
  onHouseNoChange,
  disabled,
  statusRequired = true,
  ignore,
}) {
  const houseNumbers = useHouseNumbers();
  const occupancy = useHouseOccupancy();
  const loading = !houseNumbers;
  const houses = block && houseNumbers ? houseNumbers[block] || [] : [];

  // Which of a house's two slots are taken, treating the caller's own current
  // slot (`ignore`) as free so an unchanged re-save isn't blocked.
  function slotTaken(house, which) {
    const occ = (occupancy && occupancy[block] && occupancy[block][house]) || null;
    let taken = occ ? !!occ[which] : false;
    if (taken && ignore && ignore.block === block && ignore.houseNo === house && ignore.status === which) {
      taken = false;
    }
    return taken;
  }

  // A house option is disabled when it's fully occupied (both slots) or when the
  // currently-selected status's slot is already registered for it.
  function houseDisabled(house) {
    if (slotTaken(house, 'owner') && slotTaken(house, 'resident')) return true;
    if (status && slotTaken(house, status)) return true;
    return false;
  }

  const housePlaceholder = !status
    ? 'Select your status first'
    : !block
    ? 'Select a block first'
    : loading
    ? 'Loading…'
    : 'Select your house no.';

  return (
    <>
      <Field label="I AM THE">
        <select
          className="input"
          value={status || ''}
          onChange={(e) => {
            onStatusChange(e.target.value);
            onHouseNoChange(''); // availability depends on status, so reset the house
          }}
          required={statusRequired}
          disabled={disabled}
        >
          <option value="" disabled>
            Owner or Resident?
          </option>
          {RESIDENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="BLOCK">
        <select
          className="input"
          value={block}
          onChange={(e) => {
            onBlockChange(e.target.value);
            onHouseNoChange(''); // reset house no. when the block changes
          }}
          required
          disabled={disabled}
        >
          <option value="" disabled>
            Select your block
          </option>
          {BLOCKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Field>
      <Field label="HOUSE NO.">
        <select
          className="input"
          value={houseNo}
          onChange={(e) => onHouseNoChange(e.target.value)}
          required
          disabled={disabled || !block || !status || loading}
        >
          <option value="" disabled>
            {housePlaceholder}
          </option>
          {houses.map((h) => {
            const isTaken = houseDisabled(h);
            return (
              <option key={h} value={h} disabled={isTaken}>
                {h}
                {isTaken ? ' — already registered' : ''}
              </option>
            );
          })}
        </select>
      </Field>
    </>
  );
}
