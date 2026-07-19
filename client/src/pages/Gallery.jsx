import { useState } from 'react';
import { api } from '../api';
import { useFetch } from '../hooks';
import { useAuth } from '../auth';
import { Btn, Field, Sheet, Empty, Spinner } from '../components/Glass';
import { motion } from 'framer-motion';

export default function Gallery() {
  const { user } = useAuth();
  const { data, loading, reload } = useFetch('/api/gallery');
  const [showNew, setShowNew] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState({ caption: '', photo: null });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canPost = data ? data.can_post : false;

  async function submit(e) {
    e.preventDefault();
    if (!form.photo) {
      setError('Pick a photo first');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('photo', form.photo);
      if (form.caption) fd.append('caption', form.caption);
      await api('/api/gallery', { method: 'POST', form: fd });
      setShowNew(false);
      setForm({ caption: '', photo: null });
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p) {
    if (!confirm('Remove this photo from the gallery?')) return;
    try {
      await api(`/api/gallery/${p.id}`, { method: 'DELETE' });
      setViewing(null);
      reload();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Photo Gallery</h1>
          <p className="page-sub">Moments from around the society</p>
        </div>
        {canPost && <Btn onClick={() => setShowNew(true)}>+ Upload</Btn>}
      </div>

      {loading && <Spinner />}
      {!loading && data && data.photos.length === 0 && (
        <Empty emoji="📷" title="Gallery is empty" sub="Photos from society events will appear here." />
      )}

      {data && data.photos.length > 0 && (
        <motion.div
          className="gallery-grid"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
        >
          {data.photos.map((p) => (
            <motion.div
              key={p.id}
              className="cell glass"
              style={{ padding: 0 }}
              variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
              onClick={() => setViewing(p)}
            >
              <img src={p.photo} alt={p.caption || 'Society photo'} loading="lazy" />
            </motion.div>
          ))}
        </motion.div>
      )}

      {viewing && (
        <div className="lightbox" onClick={() => setViewing(null)}>
          <img src={viewing.photo} alt={viewing.caption || ''} />
          {viewing.caption && <div className="cap">{viewing.caption}</div>}
          <div className="cap" style={{ opacity: 0.65, fontSize: 12 }}>
            by {viewing.uploader_name}
          </div>
          {(user.role === 'admin' || viewing.uploaded_by === user.id) && canPost && (
            <Btn
              variant="danger"
              sm
              onClick={(e) => {
                e.stopPropagation();
                remove(viewing);
              }}
            >
              Delete Photo
            </Btn>
          )}
        </div>
      )}

      <Sheet open={showNew} onClose={() => setShowNew(false)} title="Upload Photo">
        {error && <div className="err-banner">{error}</div>}
        <form onSubmit={submit}>
          <Field label="PHOTO">
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setForm((f) => ({ ...f, photo: e.target.files[0] || null }))}
              required
            />
          </Field>
          <Field label="CAPTION (OPTIONAL)">
            <input
              className="input"
              value={form.caption}
              onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
              placeholder="e.g. Diwali celebration 2026"
            />
          </Field>
          <Btn block disabled={busy} type="submit">
            {busy ? 'Uploading…' : 'Add to Gallery'}
          </Btn>
        </form>
      </Sheet>
    </>
  );
}
