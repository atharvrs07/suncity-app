import { Btn } from './Glass';

// Call CTA reused by the dues collections views (Overdue Watch + the unpaid-
// residents drill-down, item 19). Branches on whether a phone number is on file:
// a tappable tel: link when present, a disabled "No phone" button otherwise.
export default function CallButton({ phone, name, sm = true }) {
  if (!phone) {
    return (
      <Btn variant="ghost" sm={sm} disabled title="No phone number on file">
        📞 No phone
      </Btn>
    );
  }
  return (
    <a href={`tel:${phone}`} aria-label={name ? `Call ${name}` : 'Call'}>
      <Btn variant="ghost" sm={sm}>
        📞 Call
      </Btn>
    </a>
  );
}
