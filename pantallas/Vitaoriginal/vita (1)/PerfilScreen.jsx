// PerfilScreen.jsx — Profile, settings, integrations
const PerfilScreen = ({ userName = 'Sofía', onOpenItem, density = 'comfortable' }) => {
  const pad = density === 'compact' ? 14 : 18;

  const [notifs, setNotifs] = useState({ rutina: true, turnos: true, vita: true, gmail: false });

  return (
    <div className="screen-enter" style={{ padding: `8px ${pad}px 120px`, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div className="row between" style={{ marginTop: 6 }}>
        <div>
          <div className="t-label" style={{ color: 'var(--teal-700)' }}>Cuenta</div>
          <div className="h-display" style={{ fontSize: 26, color: 'var(--ink-900)', marginTop: 2 }}>Perfil</div>
        </div>
        <div className="icon-btn" onClick={() => onOpenItem('settings')}>
          <Icon name="settings" size={20} />
        </div>
      </div>

      {/* === Hero: identidad === */}
      <div style={{
        background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 100%)',
        borderRadius: 'var(--r-md)',
        padding: 20,
        color: '#fff',
        boxShadow: '0 14px 36px rgba(8,145,178,0.28)',
        position: 'relative', overflow: 'hidden',
      }}>
        <svg style={{ position: 'absolute', top: -40, right: -40, opacity: 0.15 }} width="200" height="200" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="80" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="100" cy="100" r="55" stroke="#fff" strokeWidth="1" fill="none"/>
        </svg>
        <div className="row gap-3" style={{ alignItems: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(255,255,255,0.22)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: '#fff',
            backdropFilter: 'blur(6px)',
          }}>{userName.charAt(0)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="h-display" style={{ fontSize: 20, lineHeight: 1.1 }}>{userName} Álvarez</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.88, marginTop: 3 }}>sofia.alvarez@gmail.com</div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0 }}>
          <MiniStat label="Estudios" value="14" />
          <MiniStat label="Años con vita" value="1,3" divider />
          <MiniStat label="Streak" value="12d" divider />
        </div>
      </div>

      {/* === Conexiones === */}
      <Group title="Conexiones" subtitle="Integraciones para traer data automáticamente">
        <ConnectionRow
          icon="gmail" color="#EA4335"
          title="Gmail"
          sub="Detecto estudios automáticamente"
          status="connected" email="sofia.alvarez@gmail.com"
        />
        <ConnectionRow
          icon="heart-plus" color="#FF3B30"
          title="Apple Health"
          sub="Métricas desde tu iPhone/Watch"
          status="available"
        />
        <ConnectionRow
          icon="activity" color="#4285F4"
          title="Google Fit"
          sub="Métricas desde Wear OS / Android"
          status="available" last
        />
      </Group>

      {/* === Notificaciones === */}
      <Group title="Notificaciones">
        <ToggleRow label="Recordatorios de rutina" sub="Medicamentos y monitoreo"
          on={notifs.rutina} onChange={v => setNotifs({...notifs, rutina: v})}/>
        <ToggleRow label="Próximos turnos" sub="24 h antes"
          on={notifs.turnos} onChange={v => setNotifs({...notifs, turnos: v})}/>
        <ToggleRow label="vita te escribe" sub="Si olvidás marcar una toma"
          on={notifs.vita} onChange={v => setNotifs({...notifs, vita: v})}/>
        <ToggleRow label="Estudios detectados en Gmail" sub="Confirmación antes de guardar"
          on={notifs.gmail} onChange={v => setNotifs({...notifs, gmail: v})} last/>
      </Group>

      {/* === Privacidad y exportación === */}
      <Group title="Privacidad y datos">
        <LinkRow icon="doc" label="Exportar mi historial" sub="PDF con todo tu timeline" />
        <LinkRow icon="upload" label="Compartir con profesional" sub="Link temporal con tu médico" />
        <LinkRow icon="settings" label="Privacidad" sub="Qué usa vita de tu data" last />
      </Group>

      {/* === Pie === */}
      <div style={{ textAlign: 'center', padding: '16px 0 24px' }}>
        <VitaWordmark size={26} />
        <div className="t-meta" style={{ marginTop: 10, fontSize: 11 }}>versión 1.0 · sesión iniciada hace 12 d</div>
        <div style={{ marginTop: 14 }}>
          <span className="link" style={{ color: 'var(--danger)' }}>Cerrar sesión</span>
        </div>
      </div>
    </div>
  );
};

const MiniStat = ({ label, value, divider }) => (
  <div style={{
    textAlign: 'center', padding: '4px 8px',
    borderLeft: divider ? '1px solid rgba(255,255,255,0.2)' : 'none',
  }}>
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, letterSpacing: '-0.02em' }}>{value}</div>
    <div style={{ fontFamily: 'var(--font-body)', fontSize: 10.5, opacity: 0.85, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{label}</div>
  </div>
);

const Group = ({ title, subtitle, action, onAction, children }) => (
  <div>
    <div className="row between" style={{ padding: '0 6px 10px' }}>
      <div>
        <div className="h-section">{title}</div>
        {subtitle && <div className="t-meta" style={{ marginTop: 2 }}>{subtitle}</div>}
      </div>
      {action && <span className="link" onClick={onAction}>{action}</span>}
    </div>
    <div className="card" style={{ padding: 0 }}>{children}</div>
  </div>
);

const FieldRow = ({ label, value, badge, action, last }) => (
  <div className="row between" style={{
    padding: '14px 18px',
    borderBottom: last ? 'none' : '1px solid rgba(15,33,54,0.05)',
    alignItems: 'center', gap: 12,
  }}>
    <div style={{ minWidth: 0 }}>
      <div className="t-meta" style={{ fontSize: 11.5 }}>{label}</div>
      <div className="row gap-2" style={{ marginTop: 3, alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{value}</span>
        {badge && <span className={`chip ${badge}`} style={{ fontSize: 11, padding: '3px 8px' }}>{value}</span>}
      </div>
    </div>
    {action ? <span className="link" style={{ fontSize: 13 }}>{action}</span>
            : <Icon name="chevron-right" size={16} color="var(--ink-300)" />}
  </div>
);

const ChipFieldRow = ({ label, chips, last }) => (
  <div style={{
    padding: '14px 18px',
    borderBottom: last ? 'none' : '1px solid rgba(15,33,54,0.05)',
  }}>
    <div className="t-meta" style={{ fontSize: 11.5 }}>{label}</div>
    <div className="row gap-2" style={{ marginTop: 8, flexWrap: 'wrap', rowGap: 6 }}>
      {chips.map(c => <span key={c.label} className={`chip ${c.color}`}>{c.label}</span>)}
      <span className="chip" style={{ background: 'transparent', color: 'var(--ink-400)', boxShadow: 'inset 0 0 0 1px var(--ink-200)' }}>
        <Icon name="plus" size={11} /> Agregar
      </span>
    </div>
  </div>
);

const ConnectionRow = ({ icon, color, title, sub, status, email, last }) => (
  <div className="row" style={{
    padding: '14px 18px',
    borderBottom: last ? 'none' : '1px solid rgba(15,33,54,0.05)',
    gap: 12, alignItems: 'center',
  }}>
    <div style={{
      width: 40, height: 40, borderRadius: 12,
      background: `${color}15`, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <Icon name={icon} size={20} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--ink-900)' }}>{title}</div>
      <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {status === 'connected' && email ? email : sub}
      </div>
    </div>
    {status === 'connected' ? (
      <div className="row gap-2" style={{ alignItems: 'center' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)' }}/>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, color: 'var(--ok)' }}>Activo</span>
      </div>
    ) : (
      <button style={{
        border: 'none', background: 'var(--surface-sunk)',
        padding: '6px 14px', borderRadius: 'var(--r-pill)',
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 12,
        color: 'var(--teal-700)', cursor: 'pointer',
      }}>Conectar</button>
    )}
  </div>
);

const ToggleRow = ({ label, sub, on, onChange, last }) => (
  <div className="row between" style={{
    padding: '14px 18px',
    borderBottom: last ? 'none' : '1px solid rgba(15,33,54,0.05)',
    gap: 12, alignItems: 'center',
  }}>
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{label}</div>
      {sub && <div className="t-meta" style={{ marginTop: 2, fontSize: 11.5 }}>{sub}</div>}
    </div>
    <div onClick={() => onChange(!on)} style={{
      width: 44, height: 26, borderRadius: 999,
      background: on ? 'linear-gradient(135deg, var(--teal-500), var(--teal-700))' : 'var(--ink-200)',
      position: 'relative', cursor: 'pointer', transition: 'background 0.2s ease',
      flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
        transition: 'left 0.2s ease',
      }}/>
    </div>
  </div>
);

const LinkRow = ({ icon, label, sub, last }) => (
  <div className="row" style={{
    padding: '14px 18px',
    borderBottom: last ? 'none' : '1px solid rgba(15,33,54,0.05)',
    gap: 12, alignItems: 'center', cursor: 'pointer',
  }}>
    <div style={{
      width: 36, height: 36, borderRadius: 12,
      background: 'var(--surface-sunk)', color: 'var(--ink-500)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <Icon name={icon} size={18} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, color: 'var(--ink-900)' }}>{label}</div>
      {sub && <div className="t-meta" style={{ marginTop: 2, fontSize: 11.5 }}>{sub}</div>}
    </div>
    <Icon name="chevron-right" size={16} color="var(--ink-300)" />
  </div>
);

window.PerfilScreen = PerfilScreen;
