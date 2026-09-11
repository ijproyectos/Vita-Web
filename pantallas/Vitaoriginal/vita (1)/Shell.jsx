// Shell.jsx — common app chrome: status bar, bottom nav, FAB, screen container
const { useState, useEffect, useRef, useMemo } = React;

const StatusBar = () => {
  const [now, setNow] = useState(() => {
    const d = new Date();
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false });
  });
  useEffect(() => {
    const id = setInterval(() => {
      const d = new Date();
      setNow(d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }));
    }, 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="status-bar">
      <span>{now}</span>
      <div className="sb-icons">
        <Icon name="signal" size={15} />
        <Icon name="wifi" size={15} />
        <Icon name="battery" size={20} />
      </div>
    </div>
  );
};

const BottomNav = ({ active, onNav, onFab, showFabLabel = true }) => {
  const items = [
    { key: 'home', icon: 'home', label: 'Inicio' },
    { key: 'rutina', icon: 'routine', label: 'Rutina' },
    { key: 'salud', icon: 'heart-plus', label: 'Mi Salud' },
    { key: 'perfil', icon: 'user', label: 'Perfil' },
  ];
  return (
    <div className="bottom-nav">
      <div className={`bn-item ${active === 'home' ? 'active' : ''}`} onClick={() => onNav('home')}>
        <Icon name="home" size={22} />
        <span>Inicio</span>
        <span className="bn-dot" />
      </div>
      <div className={`bn-item ${active === 'rutina' ? 'active' : ''}`} onClick={() => onNav('rutina')}>
        <Icon name="routine" size={22} />
        <span>Rutina</span>
        <span className="bn-dot" />
      </div>
      <div className="bn-fab-wrap">
        <div className="bn-fab" onClick={onFab} aria-label="Abrir chat con vita">
          <VMark size={30} />
        </div>
        {showFabLabel && <span className="bn-fab-label">vita</span>}
      </div>
      <div className={`bn-item ${active === 'salud' ? 'active' : ''}`} onClick={() => onNav('salud')}>
        <Icon name="heart-plus" size={22} />
        <span>Mi Salud</span>
        <span className="bn-dot" />
      </div>
      <div className={`bn-item ${active === 'perfil' ? 'active' : ''}`} onClick={() => onNav('perfil')}>
        <Icon name="user" size={22} />
        <span>Perfil</span>
        <span className="bn-dot" />
      </div>
    </div>
  );
};

// The geometric "v" mark — italic wedge, not a letter glyph
const VMark = ({ size = 30, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
    <path d="M6 8.5 L13.5 23.5 A2 2 0 0 0 17.5 23.5 L26 8.5"
      stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="16" cy="14" r="1.5" fill={color} opacity="0.9"/>
  </svg>
);

// Vita brand logo (full wordmark) for splash / onboarding
const VitaWordmark = ({ size = 40 }) => (
  <div className="row gap-2" style={{ alignItems: 'center' }}>
    <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden' }}>
      <div className="v-mark"><VMark size={size * 0.7} /></div>
    </div>
    <span style={{
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: size * 0.68,
      letterSpacing: '-0.03em',
      color: 'var(--ink-900)',
    }}>vita<span style={{ color: 'var(--teal-600)' }}>.ia</span></span>
  </div>
);

// Vita avatar (circle with "v" mark) for chat
const VitaAvatar = ({ size = 36 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', flexShrink: 0 }}>
    <div className="v-mark"><VMark size={size * 0.7} /></div>
  </div>
);

// Sparkline
const Sparkline = ({ values, width = 120, height = 36, color = 'var(--teal-600)', fill = true }) => {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (width - pad * 2);
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const last = pts[pts.length - 1];
  const area = `${d} L${width - pad},${height - pad} L${pad},${height - pad} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill && (
        <>
          <defs>
            <linearGradient id={`sg-${values.join('')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#sg-${values.join('')})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
      <circle cx={last[0]} cy={last[1]} r="6" fill={color} opacity="0.18" />
    </svg>
  );
};

Object.assign(window, { StatusBar, BottomNav, VMark, VitaWordmark, VitaAvatar, Sparkline });
