import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { Spinner } from './Glass';

// Reusable payment QR + VPA block (item 21). Shows the society's provided QR
// image when one is configured (admin-settable), otherwise generates a UPI QR
// from the VPA. Offers a download of the QR and a copy button for the VPA. Used
// on the Home screen (below the dues card) and inside the dues Pay sheet.
//
// Props: amount / tr optionally embed a specific payment into the generated UPI
// QR (used in the Pay sheet); omitted on Home for a generic "pay the society" QR.
export default function PaymentQR({ amount, tr, compact = false }) {
  const { t } = useTranslation();
  const [cfg, setCfg] = useState(null);
  const [qrData, setQrData] = useState(null); // data URL to render + download
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    api('/api/dues/upi-config')
      .then(async (c) => {
        if (!live) return;
        setCfg(c);
        if (c.qr_image) {
          setQrData(c.qr_image); // society-provided image (already a URL)
        } else if (c.vpa) {
          const uri = `upi://pay?pa=${encodeURIComponent(c.vpa)}&pn=${encodeURIComponent(c.payee_name || '')}${
            amount ? `&am=${amount}` : ''
          }${tr ? `&tr=${tr}` : ''}&cu=INR`;
          const url = await QRCode.toDataURL(uri, { width: 320, margin: 2 });
          if (live) setQrData(url);
        }
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [amount, tr]);

  const copyVpa = async () => {
    if (!cfg || !cfg.vpa) return;
    try {
      await navigator.clipboard.writeText(cfg.vpa);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };

  const download = () => {
    if (!qrData) return;
    const a = document.createElement('a');
    a.href = qrData;
    a.download = 'suncity-payment-qr.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (error) return <p className="tiny" style={{ color: 'var(--red)' }}>{error}</p>;

  return (
    <div className="qr-card">
      {!compact && <div className="title-sm" style={{ marginBottom: 8 }}>{t('home.scanToPay')}</div>}
      <div className="qr-frame">{qrData ? <img src={qrData} alt="Payment QR code" /> : <Spinner />}</div>

      {cfg && cfg.vpa && (
        <div className="vpa-row">
          <span className="tiny" style={{ fontWeight: 700 }}>{t('home.upiId')}</span>
          <span className="vpa break-anywhere">{cfg.vpa}</span>
          <button className="copy-btn" onClick={copyVpa}>
            {copied ? t('common.copied') : t('common.copy')}
          </button>
        </div>
      )}

      {qrData && (
        <button className="copy-btn" style={{ marginTop: 10 }} onClick={download}>
          ⬇ {t('home.downloadQr')}
        </button>
      )}
    </div>
  );
}
