// HomeScreen.jsx — Panel de Inicio (Home Dashboard) for vita.ia
const HomeScreen = ({ userName = 'Sofía', onNavToSalud, onNavToRutina, onNavToPerfil, onOpenNotifications, onEditProfile, onAddTurno, density = 'comfortable' }) => {
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Buen día';
    if (h < 19) return 'Hola';
    return 'Buenas noches';
  })();

  const [meds, setMeds] = useState([
    { id: 1, name: 'Metformina', dose: '500 mg', moment: 'Mañana', time: '08:00', taken: true, color: 'teal' },
    { id: 2, name: 'Losartán',   dose: '50 mg',  moment: 'Mañana', time: '08:00', taken: true, color: 'violet' },
    { id: 3, name: 'Vitamina D', dose: '1 cáps.', moment: 'Mediodía', time: '13:00', taken: false, color: 'amber' },
    { id: 4, name: 'Omega 3',    dose: '1 cáps.', moment: 'Noche', time: '21:00', taken: false, color: 'teal' },
  ]);

  const toggleMed = (id) => setMeds(m => m.map(x => x.id === id ? { ...x, taken: !x.taken } : x));
  const taken = meds.filter(m => m.taken).length;
  const total = meds.length;
  const pct = Math.round((taken / total) * 100);

  const turnos = [
    { id: 1, spec: 'Cardiología', doctor: 'Dr. R. Méndez', day: 'Mar 21', time: '10:30', tint: '#0891b2' },
    { id: 2, spec: 'Laboratorio', doctor: 'Perfil tiroideo', day: 'Vie 24', time: '08:00', tint: '#7c3aed' },
    { id: 3, spec: 'Odontología', doctor: 'Dra. Lopez',    day: 'Mié 29', time: '16:00', tint: '#f59e0b' },
  ];

  const pad = density === 'compact' ? 14 : 18;

  return (
    <div className="screen-enter stack-5" style={{ padding: `8px ${pad}px 120px`, gap: density === 'compact' ? 18 : 22, display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div className="row between" style={{ marginTop: 6 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--ink-400)', fontWeight: 500 }}>{greeting},</div>
          <div className="h-display" style={{ fontSize: 26, color: 'var(--ink-900)', marginTop: 2 }}>
            {userName} <span style={{ fontWeight: 400 }}>👋</span>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <div className="icon-btn" onClick={onOpenNotifications} aria-label="Notificaciones">
            <Icon name="bell" size={20} />
            <span className="dot-badge" />
          </div>
        </div>
      </div>

      {/* === Profile summary card (tap to open detail) === */}
      <div className="card" style={{ padding: 18, position: 'relative', cursor: 'pointer' }} onClick={onEditProfile}>
        <div className="row between" style={{ alignItems: 'center' }}>
          <div className="row gap-3" style={{ alignItems: 'center' }}>
            <div className="avatar" style={{ width: 54, height: 54, fontSize: 20 }}>
              {userName.charAt(0)}
            </div>
            <div>
              <div className="h-title" style={{ fontSize: 17, color: 'var(--ink-900)' }}>{userName} Álvarez</div>
              <div className="t-meta">Resumen de salud</div>
            </div>
          </div>
          <Icon name="chevron-right" size={18} color="var(--ink-300)" />
        </div>

        {/* Stats row — tonal block, no borders */}
        <div style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          background: 'var(--surface-sunk)',
          borderRadius: 'var(--r-md)',
          padding: '12px 4px',
        }}>
          <Stat label="Altura" value="1,68" unit="m" />
          <Stat label="Peso" value="62" unit="kg" divider />
          <Stat label="Grupo" value="0+" unit="" divider />
        </div>

        {/* Chips — condiciones & alergias */}
        <div style={{ marginTop: 12 }} className="row gap-2" style={{ flexWrap: 'wrap', rowGap: 8 }}>
          <span className="chip teal">Hipertensión</span>
          <span className="chip violet">SIBO · temporal</span>
          <span className="chip rose">Penicilina</span>
          <span className="chip rose">Lactosa</span>
        </div>
      </div>

      {/* === Today progress card — the emotional centerpiece === */}
      <div onClick={onNavToRutina} style={{
        background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 60%, #155e75 100%)',
        borderRadius: 'var(--r-md)',
        padding: 18,
        color: '#fff',
        boxShadow: '0 14px 36px rgba(8,145,178,0.28)',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
      }}>
        {/* Decorative ring */}
        <svg style={{ position: 'absolute', top: -30, right: -30, opacity: 0.18 }} width="180" height="180" viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="70" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="90" cy="90" r="50" stroke="#fff" strokeWidth="1" fill="none"/>
          <circle cx="90" cy="90" r="30" stroke="#fff" strokeWidth="1" fill="none"/>
        </svg>

        <div className="row between" style={{ alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.8 }}>Hoy</div>
            <div className="h-display" style={{ fontSize: 22, marginTop: 4, lineHeight: 1.15 }}>
              {taken} de {total} medicamentos
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.82, marginTop: 4 }}>
              <Icon name="flame" size={13} /> Llevás 12 días sin saltarte ninguno
            </div>
          </div>
          <ProgressRing pct={pct} />
        </div>
      </div>

      {/* === Próximos turnos === */}
      <div>
        <div className="row between" style={{ padding: `0 2px 10px` }}>
          <div className="h-section">Próximos turnos</div>
          <span className="link" onClick={onNavToRutina}>Ver todos →</span>
        </div>
        <div className="hscroll" style={{ padding: `0 ${pad}px 4px`, margin: `0 -${pad}px` }}>
          {turnos.map(t => <TurnoCard key={t.id} {...t} />)}
          <AddTurnoCard onClick={onAddTurno} />
        </div>
      </div>

      {/* === Medicamentos de hoy === */}
      <div>
        <div className="row between" style={{ padding: `0 2px 10px` }}>
          <div className="h-section">Medicamentos de hoy</div>
          <span className="link" onClick={onNavToRutina}>Ver rutina →</span>
        </div>

        <div className="card stack-3" style={{ padding: 8 }}>
          {meds.map((m, i) => (
            <MedRow key={m.id} med={m} onToggle={() => toggleMed(m.id)} divider={i < meds.length - 1} />
          ))}
        </div>
      </div>

      {/* vita nudge — subtle conversational hook */}
      <div style={{
        background: 'var(--surface-sunk)',
        borderRadius: 'var(--r-md)',
        padding: 14,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}>
        <VitaAvatar size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--ink-900)' }}>
            ¿Cómo te sentís hoy?
          </div>
          <div className="t-meta">Contame y lo registro en tu historial.</div>
        </div>
        <Icon name="chevron-right" size={18} color="var(--ink-400)" />
      </div>
    </div>
  );
};

const Stat = ({ label, value, unit, divider }) => (
  <div style={{
    padding: '6px 12px',
    borderLeft: divider ? '1px solid rgba(15,33,54,0.06)' : 'none',
    textAlign: 'center',
  }}>
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, color: 'var(--ink-900)', letterSpacing: '-0.02em' }}>
      {value}<span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-400)', marginLeft: 2 }}>{unit}</span>
    </div>
    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--ink-400)', fontWeight: 500, letterSpacing: '0.03em', textTransform: 'uppercase', marginTop: 2 }}>
      {label}
    </div>
  </div>
);

const ProgressRing = ({ pct, size = 68 }) => {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth="6" fill="none"/>
        <circle cx={size/2} cy={size/2} r={r}
          stroke="#fff" strokeWidth="6" fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: '#fff',
        letterSpacing: '-0.02em',
      }}>
        {pct}%
      </div>
    </div>
  );
};

const TurnoCard = ({ spec, doctor, day, time, tint }) => (
  <div className="card" style={{ width: 200, padding: 14, position: 'relative', paddingLeft: 18 }}>
    <div style={{
      position: 'absolute', left: 8, top: 16, bottom: 16, width: 3,
      background: tint, borderRadius: 3,
    }}/>
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>
      {spec}
    </div>
    <div className="t-meta" style={{ marginTop: 2 }}>{doctor}</div>
    <div className="row gap-2" style={{ marginTop: 10, alignItems: 'center' }}>
      <div style={{
        background: 'var(--surface-sunk)', padding: '4px 10px', borderRadius: 'var(--r-pill)',
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, color: 'var(--ink-700)',
      }}>{day}</div>
      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, color: 'var(--ink-500)',
      }}>{time} hs</div>
    </div>
  </div>
);

const AddTurnoCard = ({ onClick }) => (
  <div onClick={onClick} style={{
    width: 120, minHeight: 86, borderRadius: 'var(--r-md)',
    background: 'var(--surface-sunk)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
    cursor: 'pointer', color: 'var(--ink-500)',
  }}>
    <Icon name="plus" size={22} />
    <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12 }}>Agregar</span>
  </div>
);

const MedRow = ({ med, onToggle, divider }) => {
  const tintMap = {
    teal: 'var(--chip-teal-bg)',
    violet: 'var(--chip-violet-bg)',
    amber: 'var(--chip-amber-bg)',
    rose: 'var(--chip-rose-bg)',
  };
  const inkMap = {
    teal: 'var(--chip-teal-ink)',
    violet: 'var(--chip-violet-ink)',
    amber: 'var(--chip-amber-ink)',
    rose: 'var(--chip-rose-ink)',
  };
  return (
    <div className="row" style={{
      padding: '10px 10px',
      borderBottom: divider ? '1px solid rgba(15,33,54,0.05)' : 'none',
      gap: 12,
      alignItems: 'center',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--r-pill)',
        background: tintMap[med.color] || 'var(--chip-teal-bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: inkMap[med.color] || 'var(--chip-teal-ink)',
      }}>
        <Icon name="pill" size={19} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5,
          color: 'var(--ink-900)',
          textDecoration: med.taken ? 'line-through' : 'none',
          opacity: med.taken ? 0.55 : 1,
          transition: 'opacity 0.2s ease',
        }}>
          {med.name}
        </div>
        <div className="t-meta" style={{ opacity: med.taken ? 0.6 : 1 }}>
          {med.dose} · {med.time} hs · {med.moment}
        </div>
      </div>
      <div className={`check ${med.taken ? 'on' : ''}`} onClick={onToggle}>
        {med.taken && <Icon name="check" size={16} />}
      </div>
    </div>
  );
};

window.HomeScreen = HomeScreen;
