// MiSaludScreen.jsx — Health history hub
const MiSaludScreen = ({ onOpenMonitorDetail, onOpenStudyDetail, onAddEntry, density = 'comfortable' }) => {
  const [stateOpen, setStateOpen] = useState(true);
  const [filter, setFilter] = useState('todo');

  const condicionesPerm = [
    { label: 'Hipertensión', color: 'teal' },
    { label: 'Intolerancia lactosa', color: 'violet' },
  ];
  const condicionesTemp = [
    { label: 'SIBO', color: 'amber', since: 'Mar 2026' },
  ];
  const alergias = ['Penicilina', 'Polen de gramíneas'];

  const monitores = [
    { key: 'bp',  name: 'Presión arterial', value: '128/82', unit: 'mmHg', when: 'hoy · 10:14',
      trend: 'flat', series: [118, 122, 125, 120, 128, 124, 128], color: '#0891b2' },
    { key: 'glu', name: 'Glucemia', value: '94', unit: 'mg/dL', when: 'hoy · 08:02',
      trend: 'down', series: [108, 104, 101, 98, 96, 97, 94], color: '#7c3aed' },
    { key: 'w',   name: 'Peso', value: '62,4', unit: 'kg', when: 'ayer · 07:20',
      trend: 'down', series: [63.1, 62.9, 62.8, 62.7, 62.6, 62.5, 62.4], color: '#f59e0b' },
  ];

  const events = [
    { id: 1, cat: 'estudio', title: 'Perfil tiroideo', sub: 'TSH 2,3 · T4 1,1', when: '16 Abr', source: 'gmail', attach: 'PDF · Lab Hidalgo' },
    { id: 2, cat: 'medicion', title: 'Presión arterial', sub: '128/82 mmHg', when: '16 Abr · 10:14', source: 'vita' },
    { id: 3, cat: 'consulta', title: 'Cardiología', sub: 'Dr. R. Méndez — control anual', when: '14 Abr', source: 'manual' },
    { id: 4, cat: 'vacuna', title: 'Hepatitis B · refuerzo', sub: 'Centro médico San Isidro', when: '08 Abr', source: 'vita' },
    { id: 5, cat: 'estudio', title: 'Análisis de sangre', sub: 'Hemograma completo', when: '02 Abr', source: 'gmail', attach: 'PDF · Lab Hidalgo' },
    { id: 6, cat: 'medicion', title: 'Peso', sub: '62,5 kg', when: '01 Abr · 07:20', source: 'manual' },
    { id: 7, cat: 'estudio', title: 'Ecografía abdominal', sub: 'Hallazgos leves · sin patología', when: '27 Mar', source: 'manual', attach: 'IMG · Sanatorio Norte' },
    { id: 8, cat: 'consulta', title: 'Gastroenterología', sub: 'Dra. Arias — seguimiento SIBO', when: '22 Mar', source: 'manual' },
  ];

  const filters = [
    { k: 'todo', label: 'Todo' },
    { k: 'estudio', label: 'Estudios' },
    { k: 'vacuna', label: 'Vacunas' },
    { k: 'consulta', label: 'Consultas' },
    { k: 'medicion', label: 'Mediciones' },
  ];
  const visible = filter === 'todo' ? events : events.filter(e => e.cat === filter);

  const pad = density === 'compact' ? 14 : 18;

  return (
    <div className="screen-enter" style={{ padding: `8px ${pad}px 120px`, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div className="row between" style={{ marginTop: 6 }}>
        <div>
          <div className="t-label" style={{ color: 'var(--teal-700)' }}>Historial</div>
          <div className="h-display" style={{ fontSize: 26, color: 'var(--ink-900)', marginTop: 2 }}>Mi Salud</div>
        </div>
        <div className="icon-btn" onClick={onAddEntry} aria-label="Agregar">
          <Icon name="plus" size={20} />
        </div>
      </div>

      {/* === Capa 1 — Mi estado === */}
      <div className="card" style={{ padding: 0 }}>
        <div className="row between" style={{ padding: '16px 18px', cursor: 'pointer' }} onClick={() => setStateOpen(o => !o)}>
          <div>
            <div className="h-section">Mi estado</div>
            <div className="t-meta" style={{ marginTop: 2 }}>
              {condicionesPerm.length + condicionesTemp.length} condiciones · {alergias.length} alergias
            </div>
          </div>
          <div style={{ transition: 'transform 0.25s ease', transform: stateOpen ? 'rotate(180deg)' : 'none' }}>
            <Icon name="chevron-down" size={20} color="var(--ink-400)" />
          </div>
        </div>
        {stateOpen && (
          <div style={{ padding: '0 18px 18px' }}>
            {/* Condiciones */}
            <div className="t-label" style={{ marginBottom: 8 }}>Condiciones</div>
            <div className="row gap-2" style={{ flexWrap: 'wrap', rowGap: 8 }}>
              {condicionesPerm.map(c => <span key={c.label} className={`chip ${c.color}`}>{c.label}</span>)}
              {condicionesTemp.map(c => (
                <span key={c.label} className={`chip ${c.color}`} style={{ paddingRight: 4 }}>
                  <span>{c.label}</span>
                  <span style={{ fontSize: 10.5, opacity: 0.7, fontWeight: 500 }}>· desde {c.since}</span>
                  <span style={{
                    marginLeft: 4, width: 18, height: 18, borderRadius: '50%',
                    background: 'rgba(0,0,0,0.06)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}>
                    <Icon name="close" size={10} />
                  </span>
                </span>
              ))}
            </div>
            {/* Alergias */}
            <div className="t-label" style={{ marginTop: 14, marginBottom: 8 }}>Alergias</div>
            <div className="row gap-2" style={{ flexWrap: 'wrap', rowGap: 8 }}>
              {alergias.map(a => <span key={a} className="chip rose">{a}</span>)}
              <span className="chip" style={{ background: 'transparent', color: 'var(--ink-400)', boxShadow: 'inset 0 0 0 1px var(--ink-200)' }}>
                <Icon name="plus" size={12} /> Agregar
              </span>
            </div>
          </div>
        )}
      </div>

      {/* === Capa 2 — Monitoreo activo === */}
      <div>
        <div className="row between" style={{ padding: '0 2px 10px' }}>
          <div className="h-section">Monitoreo activo</div>
          <span className="link">Configurar →</span>
        </div>
        <div className="hscroll" style={{ padding: `0 ${pad}px 4px`, margin: `0 -${pad}px` }}>
          {monitores.map(m => (
            <MonitorCard key={m.key} m={m} onClick={() => onOpenMonitorDetail(m)} />
          ))}
          <div style={{
            width: 120, minHeight: 140, borderRadius: 'var(--r-md)',
            background: 'var(--surface-sunk)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer', color: 'var(--ink-500)',
          }}>
            <Icon name="plus" size={22} />
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, textAlign: 'center', lineHeight: 1.3 }}>Agregar<br/>métrica</span>
          </div>
        </div>
      </div>

      {/* === Capa 3 — Timeline === */}
      <div>
        <div className="row between" style={{ padding: '0 2px 10px' }}>
          <div className="h-section">Historial</div>
          <span className="t-meta">{visible.length} entradas</span>
        </div>

        {/* Filter chips */}
        <div className="hscroll" style={{ padding: `0 ${pad}px 12px`, margin: `0 -${pad}px` }}>
          {filters.map(f => (
            <div key={f.k} onClick={() => setFilter(f.k)}
              className={`chip ${filter === f.k ? 'solid-teal' : ''}`}
              style={{ cursor: 'pointer', padding: '8px 14px', fontSize: 13, background: filter === f.k ? 'var(--teal-600)' : 'var(--surface)', color: filter === f.k ? '#fff' : 'var(--ink-700)', boxShadow: filter === f.k ? 'none' : 'var(--shadow-card)' }}>
              {f.label}
            </div>
          ))}
        </div>

        <div className="stack-3" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map((e, i) => (
            <TimelineRow key={e.id} e={e} onClick={() => e.attach && onOpenStudyDetail(e)} />
          ))}
          {visible.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-400)' }}>
              <div className="t-meta">Sin entradas en esta categoría.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MonitorCard = ({ m, onClick }) => {
  const trendIcon = m.trend === 'up' ? 'trend-up' : m.trend === 'down' ? 'trend-down' : 'check';
  const trendColor = m.trend === 'up' ? 'var(--warn)' : m.trend === 'down' ? 'var(--ok)' : 'var(--ok)';
  return (
    <div className="card" onClick={onClick} style={{ width: 200, padding: 14, cursor: 'pointer' }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="t-label" style={{ color: m.color }}>{m.name}</div>
        <div style={{
          width: 22, height: 22, borderRadius: '50%',
          background: `${m.color}14`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: trendColor,
        }}>
          <Icon name={trendIcon} size={13} strokeWidth={2.2} />
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, color: 'var(--ink-900)', letterSpacing: '-0.02em' }}>
          {m.value}
        </span>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, color: 'var(--ink-400)', marginLeft: 4 }}>
          {m.unit}
        </span>
      </div>
      <div className="t-meta" style={{ fontSize: 11 }}>{m.when}</div>
      <div style={{ marginTop: 8, marginLeft: -4 }}>
        <Sparkline values={m.series} width={176} height={40} color={m.color} />
      </div>
    </div>
  );
};

const TimelineRow = ({ e, onClick }) => {
  const catMeta = {
    estudio:  { icon: 'vial',         bg: 'var(--chip-teal-bg)',   ink: 'var(--chip-teal-ink)',   label: 'Estudio' },
    medicion: { icon: 'activity',     bg: 'var(--chip-violet-bg)', ink: 'var(--chip-violet-ink)', label: 'Medición' },
    consulta: { icon: 'stethoscope',  bg: 'var(--chip-amber-bg)',  ink: 'var(--chip-amber-ink)',  label: 'Consulta' },
    vacuna:   { icon: 'syringe',      bg: 'var(--chip-rose-bg)',   ink: 'var(--chip-rose-ink)',   label: 'Vacuna' },
  }[e.cat] || {};

  const sourceMeta = {
    gmail:  { icon: 'gmail', label: 'Gmail' },
    vita:   { icon: null,    label: 'vita' },
    manual: { icon: null,    label: 'manual' },
  }[e.source] || {};

  return (
    <div className="card" onClick={onClick} style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start', cursor: e.attach ? 'pointer' : 'default' }}>
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--r-pill)',
        background: catMeta.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: catMeta.ink, flexShrink: 0,
      }}>
        <Icon name={catMeta.icon} size={19} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row between" style={{ alignItems: 'baseline', gap: 8 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5,
            color: 'var(--ink-900)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{e.title}</div>
          <div className="t-meta" style={{ fontSize: 11.5, flexShrink: 0 }}>{e.when}</div>
        </div>
        <div className="t-meta" style={{ marginTop: 2 }}>{e.sub}</div>
        <div className="row gap-2" style={{ marginTop: 8, flexWrap: 'wrap', rowGap: 6 }}>
          {e.attach && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-sunk)', padding: '4px 10px', borderRadius: 'var(--r-pill)',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11.5, color: 'var(--ink-700)',
            }}>
              <Icon name="paperclip" size={11} /> {e.attach}
            </div>
          )}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 11, color: 'var(--ink-400)',
          }}>
            {sourceMeta.icon && <Icon name={sourceMeta.icon} size={12} />}
            <span style={{ textTransform: 'lowercase' }}>· {sourceMeta.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

window.MiSaludScreen = MiSaludScreen;
