// ui.jsx — shared UI primitives for plonky
const { useState, useEffect, useRef } = React;

// Open the device photo picker / camera, downscale the chosen image to a small
// square JPEG and hand back a base64 data URL (~10 KB) for storing in the DB.
function pickPhoto(onResult) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const S = 160;
        const c = document.createElement('canvas');
        c.width = S; c.height = S;
        const ctx = c.getContext('2d');
        const scale = Math.max(S / img.width, S / img.height); // cover-crop, centered
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
        try { onResult(c.toDataURL('image/jpeg', 0.82)); } catch (e) {}
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

// ── Photo by account id — the ONE source of truth ─────────
// Every avatar resolves a person's CURRENT photo from their account id. The id is
// the key; the account's photo (Account.avatar in the DB) is the single value,
// looked up everywhere. `avatars` is the device's id→photo cache (fetched in
// batch). Self is resolved straight from `account`. Name-match and the photo
// stored on the player are only graceful fallbacks while the id photo loads or
// when the id is unknown.
function resolvePhoto(person, account, family, avatars) {
  if (!person) return '';
  const explicitAid = person.account_id || person.accountId || null;
  // 1) Echte user_id an der Person → die ist die Wahrheit (Konto-Foto, Cache, dann Schnappschuss)
  if (explicitAid) {
    if (account && explicitAid === account.id) return account.avatar || '';   // me → always current
    if (avatars && Object.prototype.hasOwnProperty.call(avatars, explicitAid)) return avatars[explicitAid] || '';
    return person.avatar || ''; // id bekannt, Foto noch nicht geladen → Schnappschuss
  }
  // 2) KEINE user_id (Gast): NUR das mitgereiste Foto der Person — Identität wird
  //    NIE über den Namen geraten (Name ist ein Etikett; Gleichnamige sind
  //    verschiedene User). Ohne ID und ohne Foto gibt's die Initiale.
  return person.avatar || '';
}
// Context carries a bound resolver `(person) => photo` so every <Avatar> resolves
// by id without threading account/family/avatars through every component.
const AvatarCtx = React.createContext(null);
// kept for back-compat; prefer <Avatar accountId=… /> which resolves via context
function liveAvatar(player, account, family) { return resolvePhoto(player, account, family, null); }

// ── Phone screen scaffold ─────────────────────────────────
function Screen({ children, bg = 'var(--paper)', style = {} }) {
  return (
    <div style={{
      height: '100%', background: bg, position: 'relative',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', ...style,
    }}>{children}</div>
  );
}

// scrollable body
function Body({ children, style = {}, pad = 20, className = '' }) {
  return (
    <div className={'noscroll ' + className} style={{
      flex: 1, overflowY: 'auto', overflowX: 'hidden',
      padding: pad, paddingBottom: 8, ...style,
    }}>{children}</div>
  );
}

// header with status-bar clearance
function AppHeader({ title, sub, onBack, right, center = false }) {
  return (
    <div style={{ paddingTop: 60, padding: '60px 20px 6px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 40 }}>
        {onBack && (
          <button onClick={onBack} style={{
            width: 40, height: 40, borderRadius: 13, border: '1px solid var(--line)',
            background: 'var(--card)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: 'var(--ink)', flexShrink: 0,
          }}><Ic.chevL size={20} /></button>
        )}
        <div style={{ flex: 1, textAlign: center ? 'center' : 'left' }}>
          {sub && <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 2 }}>{sub}</div>}
          {title && <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.3 }}>{title}</div>}
        </div>
        {right || (onBack && <div style={{ width: 40 }} />)}
      </div>
    </div>
  );
}

// sticky bottom action area
function Footer({ children, pad = 20 }) {
  return (
    <div style={{
      flexShrink: 0, padding: `12px ${pad}px 30px`,
      background: 'linear-gradient(to top, var(--paper) 62%, rgba(244,244,241,0))',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>{children}</div>
  );
}

// ── Buttons ───────────────────────────────────────────────
function Btn({ children, onClick, kind = 'primary', icon, iconR, disabled, style = {} }) {
  const base = {
    height: 56, borderRadius: 'var(--r-btn)', width: '100%', cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'var(--font)', fontSize: 17, fontWeight: 600, letterSpacing: -0.2,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
    transition: 'transform .12s ease, background .15s ease, opacity .15s', border: 'none',
    opacity: disabled ? 0.4 : 1,
  };
  const kinds = {
    primary: { background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 6px 16px -6px color-mix(in srgb, var(--accent) 60%, transparent)' },
    secondary: { background: 'var(--card)', color: 'var(--ink)', border: '1px solid var(--line)' },
    ghost: { background: 'transparent', color: 'var(--ink-2)' },
    dark: { background: 'var(--ink)', color: '#fff' },
  };
  return (
    <button onClick={disabled ? undefined : onClick}
      onPointerDown={e => !disabled && (e.currentTarget.style.transform = 'scale(.97)')}
      onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      style={{ ...base, ...kinds[kind], ...style }}>
      {icon}{children}{iconR}
    </button>
  );
}

// ── Avatar ────────────────────────────────────────────────
const AV_COLORS = ['#15A35A', '#2F6FE0', '#E0792F', '#9B4FD8', '#D8533B', '#0FA0A8', '#C7A412', '#E04F8C'];
function Avatar({ name, color, size = 38, ring = false, dim = false, src = null, accountId = null }) {
  const resolve = React.useContext(AvatarCtx);
  const finalSrc = resolve ? resolve({ account_id: accountId, name, avatar: src }) : src;
  src = finalSrc;
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
      background: dim ? 'var(--line)' : color, color: dim ? 'var(--ink-3)' : '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.42,
      boxShadow: ring ? '0 0 0 3px var(--card), 0 0 0 5px ' + color : 'none',
    }}>{src
      ? <img src={src} alt={name || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: dim ? 0.5 : 1 }} />
      : initial}</div>
  );
}

// ── Big choice card (role / mode) ─────────────────────────
function ChoiceCard({ icon, title, desc, badge, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', cursor: 'pointer', position: 'relative',
      background: 'var(--card)', borderRadius: 'var(--r-card)',
      border: selected ? '2px solid var(--accent)' : '1px solid var(--line)',
      padding: 20, display: 'flex', gap: 16, alignItems: 'center',
      boxShadow: selected ? '0 10px 24px -14px color-mix(in srgb, var(--accent) 70%, transparent)' : '0 1px 2px rgba(0,0,0,0.02)',
      transition: 'border .15s, box-shadow .2s, transform .12s', fontFamily: 'var(--font)',
    }}
      onPointerDown={e => (e.currentTarget.style.transform = 'scale(.985)')}
      onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
      <div style={{
        width: 54, height: 54, borderRadius: 16, flexShrink: 0,
        background: selected ? 'var(--accent)' : 'var(--line-2)',
        color: selected ? '#fff' : 'var(--ink-2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background .15s, color .15s',
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: -0.2, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.35, color: 'var(--ink-2)' }}>{desc}</div>
      </div>
      {badge && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-3)' }}>{badge}</div>}
    </button>
  );
}

// ── QR code mock (simple squares only) ────────────────────
function QRMock({ size = 200, fg = '#191A15', bg = '#fff' }) {
  const N = 21;
  const cells = [];
  // deterministic pseudo-random pattern
  const seed = (x, y) => ((x * 73856093) ^ (y * 19349663) ^ ((x + 3) * (y + 7) * 83492791)) >>> 0;
  const finder = (x, y) =>
    (x < 7 && y < 7) || (x >= N - 7 && y < 7) || (x < 7 && y >= N - 7);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let on = false;
    if (finder(x, y)) {
      const lx = x >= N - 7 ? x - (N - 7) : x;
      const ly = y >= N - 7 ? y - (N - 7) : y;
      const r = Math.max(Math.abs(lx - 3), Math.abs(ly - 3));
      on = r !== 2;
    } else {
      on = (seed(x, y) % 100) < 46;
    }
    if (on) cells.push(<rect key={x + '-' + y} x={x} y={y} width="1.04" height="1.04" rx="0.18" fill={fg} />);
  }
  return (
    <svg width={size} height={size} viewBox="-1 -1 23 23" style={{ borderRadius: 14, background: bg }}>
      {cells}
    </svg>
  );
}

// ── Real QR code (qrcode-generator global; falls back to mock) ──
function QRCode({ value, size = 200, fg = '#191A15', bg = '#fff' }) {
  if (!value || typeof window.qrcode !== 'function') return <QRMock size={size} fg={fg} bg={bg} />;
  let qr;
  try { qr = window.qrcode(0, 'M'); qr.addData(value); qr.make(); }
  catch (e) { return <QRMock size={size} fg={fg} bg={bg} />; }
  const n = qr.getModuleCount();
  const cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (qr.isDark(y, x)) cells.push(<rect key={x + '-' + y} x={x} y={y} width="1.02" height="1.02" rx="0.12" fill={fg} />);
  }
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${n + 2} ${n + 2}`} style={{ borderRadius: 14, background: bg }}>
      {cells}
    </svg>
  );
}

// ── Onboarding step dots ─────────────────────────────────
function Steps({ n, i }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', padding: '2px 0' }}>
      {Array.from({ length: n }).map((_, k) => (
        <div key={k} style={{
          height: 4, borderRadius: 4, transition: 'all .25s',
          width: k === i ? 22 : 6,
          background: k <= i ? 'var(--accent)' : 'var(--line)',
        }} />
      ))}
    </div>
  );
}

window.UI = { Screen, Body, AppHeader, Footer, Btn, Avatar, ChoiceCard, QRMock, QRCode, Steps, AV_COLORS, pickPhoto, liveAvatar, resolvePhoto, AvatarCtx };
