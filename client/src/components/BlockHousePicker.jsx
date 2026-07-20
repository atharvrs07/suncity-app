import { Field } from './Glass';
import { BLOCKS } from '../constants';
import { useHouseNumbers } from '../houseNumbers';

// Block + dependent House No. selects, shared by the signup and OAuth
// complete-profile forms. House No. stays disabled until a Block is chosen,
// then lists only that block's house numbers. Changing Block clears the House
// No. selection (done here so callers can't forget). Both are required.
export default function BlockHousePicker({ block, houseNo, onBlockChange, onHouseNoChange, disabled }) {
  const houseNumbers = useHouseNumbers();
  const loading = !houseNumbers;
  const houses = block && houseNumbers ? houseNumbers[block] || [] : [];

  return (
    <>
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
          disabled={disabled || !block || loading}
        >
          <option value="" disabled>
            {!block ? 'Select a block first' : loading ? 'Loading…' : 'Select your house no.'}
          </option>
          {houses.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}
