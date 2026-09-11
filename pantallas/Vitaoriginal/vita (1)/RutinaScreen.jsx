// RutinaScreen.jsx — Rutina unificada: medicamentos + turnos por momento del día
const RutinaScreen = ({ density = 'comfortable', onOpenItem }) => {
  const pad = density === 'compact' ? 14 : 18;
  const [view, setView] = useState('hoy'); // 'hoy' | 'proximos'
  const [showAdd, setShowAdd] = useState(false);

  const [items, setItems] = useState([
    // Mañana
    { id: 1, type: 'med', name: 'Metformina', dose: '500 mg', time: '08:00', moment: 'manana', taken: true, color: 'teal' },
    { id: 2, type: 'med', name: 'Losartán',   dose: '50 mg',  time: '08:00', moment: 'manana', taken: true, color: 'violet' },
    { id: 3, type: 'apt', title: 'Cardiología', who: 'Dr. R. Méndez', where: 'Sanatorio Norte', time: '10:30', moment: 'manana', status: 'upcoming' },
    // Mediodía
    { id: 4, type: 'med', name: 'Vitamina D', dose: '1 cáps.', time: '13:00', moment: 'mediodia', taken: false, color: 'amber' },
    // Tarde
    { id: 5, type: 'apt', title: 'Kinesiología', who: 'Lic. Páez', where: 'Centro rehab.', time: '17:00', moment: 'tarde', status: 'upcoming' },
    // Noche
    { id: 6, type: 'med', name: 'Omega 3', dose: '1 cáps.', time: '21:00', moment: 'noche', taken: false, color: 'teal' },
    { id: 7, type: 'med', name: 'Losartán', dose: '50 mg', time: '21:00', moment: 'noche', taken: false, color: 'violet' },
  ]);

  const toggleMed = (id) => setItems(xs => xs.map(x => x.id === id ? { ...x, taken: !x.taken } : x));

  const meds = items.filter(i => i.type === 'med');
  const apts = items.filter(i => i.type === 'apt');
  const medsTaken = meds.filter(m => m.taken).length;
  const medsTotal = meds.length;
  const pct = Math.round((medsTaken / medsTotal) * 100);

  const moments = [
    { key: 'manana',   label: 'Mañana',   icon: 'sunrise', range: '06 – 11' },
    { key: 'mediodia', label: 'Mediodía', icon: 'sun',     range: '11 – 15' },
    { key: 'tarde',    label: 'Tarde',    icon: 'sunset',  range: '15 – 19' },
    { key: 'noche',    label: 'Noche',    icon: 'moon',    range: '19 – 24' },
  ];

  return (
    <div className="screen-enter" style={{ padding: `8px ${pad}px 120px`, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div className="row between" style={{ marginTop: 6 }}>
        <div>
          <div className="t-label" style={{ color: 'var(--teal-700)' }}>Tu día de salud</div>
          <div className="h-display" style={{ fontSize: 26, color: 'var(--ink-900)', marginTop: 2 }}>Rutina</div>
        </div>
        <div className="icon-btn" onClick={() => setShowAdd(true)} aria-label="Agregar">
          <Icon name="plus" size={20} />
        </div>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', background: 'var(--surface-sunk)', borderRadius: 'var(--r-pill)', padding: 4 }}>
        {[['hoy','Hoy'],['proximos','Próximos días']].map(([k,l]) => (
          <button key={k} onClick={() => setView(k)} style={{
            flex: 1, border: 'none', background: view === k ? 'var(--surface)' : 'transparent',
            padding: '10px 14px', borderRadius: 'var(--r-pill)',
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5,
            color: view === k ? 'var(--teal-700)' : 'var(--ink-400)', cursor: 'pointer',
            boxShadow: view === k ? '0 2px 6px rgba(15,33,54,0.06)' : 'none',
            transition: 'all 0.15s ease',
          }}>{l}</button>
        ))}
      </div>

      {view === 'hoy' ? (
        <>
          {/* Progress card */}
          <div style={{
            background: 'linear-gradient(135deg, #0891b2 0%, #0e7490 60%, #155e75 100%)',
            borderRadius: 'var(--r-md)', padding: 18, color: '#fff',
            boxShadow: '0 14px 36px rgba(8,145,178,0.28)',
            position: 'relative', overflow: 'hidden',
          }}>
            <svg style={{ position: 'absolute', top: -30, right: -30, opacity: 0.18 }} width="180" height="180" viewBox="0 0 180 180">
              <circle cx="90" cy="90" r="70" stroke="#fff" strokeWidth="1" fill="none"/>
              <circle cx="90" cy="90" r="50" stroke="#fff" strokeWidth="1" fill="none"/>
            </svg>
            <div className="row between" style={{ alignItems: 'center' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.8 }}>Hoy · mié 17 abr</div>
                <div className="h-display" style={{ fontSize: 22, marginTop: 4, lineHeight: 1.15 }}>
                  {medsTaken}/{medsTotal} medicamentos
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, opacity: 0.88, marginTop: 4 }}>
                  + {apts.length} turno{apts.length !== 1 ? 's' : ''} hoy
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, opacity: 0.82, marginTop: 6 }}>
                  <Icon name="flame" size={12} /> Llevás 12 días sin saltarte ninguno
                </div>
              </div>
              <ProgressRingR pct={pct} />
            </div>
          </div>

          {/* Timeline por momento */}
          {moments.map(m => {
            const mItems = items
              .filter(x => x.moment === m.key)
              .sort((a,b) => a.time.localeCompare(b.time));
            if (mItems.length === 0) return <EmptyMoment key={m.key} moment={m} onAdd={() => setShowAdd(true)} />;

            return (
              <div key={m.key}>
                <div className="row" style={{ padding: '0 4px 10px', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: 'var(--surface-sunk)', color: 'var(--ink-500)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name={m.icon} size={17} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="h-section" style={{ fontSize: 15 }}>{m.label}</div>
                    <div className="t-meta" style={{ fontSize: 11 }}>{m.range} hs · {mItems.length} item{mItems.length !== 1 ? 's' : ''}</div>
                  </div>
                </div>

                <div className="stack-3" style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', paddingLeft: 14 }}>
                  {/* Vertical rail */}
                  <div style={{
                    position: 'absolute', left: 4, top: 10, bottom: 10,
                    width: 2, background: 'var(--surface-sunk)', borderRadius: 2,
                  }}/>
                  {mItems.map(item => (
                    item.type === 'med'
                      ? <MedItem key={item.id} item={item} onToggle={() => toggleMed(item.id)} />
                      : <AptItem key={item.id} item={item} onClick={() => onOpenItem && onOpenItem('appointment', item)} />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <ProximosDiasView items={items} onOpen={onOpenItem} />
      )}

      {showAdd && <AddSheet onClose={() => setShowAdd(false)} onPick={(k) => { setShowAdd(false); onOpenItem && onOpenItem(k); }} />}
    </div>
  );
};

const ProgressRingR = ({ pct, size = 68 }) => {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth="6" fill="none"/>
        <circle cx={size/2} cy={size/2} r={r}
          stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={off}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </svg>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: '#fff',
      }}>{pct}%</div>
    </div>
  );
};

const MedItem = ({ item, onToggle }) => {
  const tintMap = { teal: 'var(--chip-teal-bg)', violet: 'var(--chip-violet-bg)', amber: 'var(--chip-amber-bg)', rose: 'var(--chip-rose-bg)' };
  const inkMap  = { teal: 'var(--chip-teal-ink)', violet: 'var(--chip-violet-ink)', amber: 'var(--chip-amber-ink)', rose: 'var(--chip-rose-ink)' };
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', left: -12, top: 22, width: 10, height: 10,
        borderRadius: '50%', background: item.taken ? 'var(--teal-600)' : 'var(--surface)',
        boxShadow: 'inset 0 0 0 2px var(--ink-200)',
      }}/>
      <div className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 'var(--r-pill)',
          background: tintMap[item.color], color: inkMap[item.color],
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name="pill" size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--ink-900)',
            textDecoration: item.taken ? 'line-through' : 'none',
            opacity: item.taken ? 0.55 : 1,
          }}>{item.name}</div>
          <div className="t-meta" style={{ opacity: item.taken ? 0.6 : 1 }}>{item.dose} · {item.time} hs</div>
        </div>
        <div className={`check ${item.taken ? 'on' : ''}`} onClick={onToggle}>
          {item.taken && <Icon name="check" size={16} />}
        </div>
      </div>
    </div>
  );
};

const AptItem = ({ item, onClick }) => (
  <div style={{ position: 'relative' }}>
    <div style={{
      position: 'absolute', left: -12, top: 22, width: 10, height: 10,
      borderRadius: '50%', background: 'var(--teal-500)',
      boxShadow: '0 0 0 4px rgba(8,145,178,0.15)',
    }}/>
    <div className="card" onClick={onClick} style={{
      padding: 12, display: 'flex', gap: 12, alignItems: 'center',
      paddingLeft: 16, cursor: 'pointer', position: 'relative',
    }}>
      <div style={{
        position: 'absolute', left: 6, top: 14, bottom: 14, width: 3,
        background: 'var(--teal-600)', borderRadius: 3,
      }}/>
      <div style={{
        width: 40, height: 40, borderRadius: 'var(--r-pill)',
        background: '#ecfeff', color: '#155e75',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon name="stethoscope" size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row gap-2" style={{ alignItems: 'baseline' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5, color: 'var(--ink-900)' }}>{item.title}</div>
          <span className="micro-badge" style={{ fontSize: 10, padding: '2px 6px' }}>turno</span>
        </div>
        <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.who} · {item.time} hs
        </div>
        <div className="t-meta" style={{ fontSize: 11, marginTop: 2, opacity: 0.8 }}>{item.where}</div>
      </div>
      <Icon name="chevron-right" size={16} color="var(--ink-300)" />
    </div>
  </div>
);

const EmptyMoment = ({ moment, onAdd }) => (
  <div>
    <div className="row" style={{ padding: '0 4px 10px', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: 'var(--surface-sunk)', color: 'var(--ink-300)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={moment.icon} size={17} />
      </div>
      <div style={{ flex: 1 }}>
        <div className="h-section" style={{ fontSize: 15, color: 'var(--ink-400)' }}>{moment.label}</div>
        <div className="t-meta" style={{ fontSize: 11 }}>{moment.range} hs · sin items</div>
      </div>
      <span className="link" style={{ fontSize: 13 }} onClick={onAdd}>+ Agregar</span>
    </div>
  </div>
);

const ProximosDiasView = ({ items, onOpen }) => {
  const apts = items.filter(i => i.type === 'apt');
  const days = [
    { day: 'Jue 18 abr', items: [{ type:'apt', title:'Laboratorio', sub:'Perfil tiroideo', time:'08:00' }] },
    { day: 'Vie 19 abr', items: [{ type:'med', title:'Nueva receta', sub:'Metformina — retirar farmacia' }] },
    { day: 'Mar 22 abr', items: [{ type:'apt', title:'Odontología', sub:'Dra. Lopez', time:'16:00' }] },
    { day: 'Vie 25 abr', items: [{ type:'apt', title:'Control anual', sub:'Dr. Méndez — cardio', time:'11:00' }] },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="t-meta" style={{ padding: '0 4px' }}>
        Turnos agendados y cambios en tu medicación.
      </div>
      {days.map(d => (
        <div key={d.day}>
          <div className="t-label" style={{ padding: '0 4px 8px' }}>{d.day}</div>
          <div className="stack-3" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.items.map((it, i) => (
              <div key={i} className="card" style={{ padding: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--r-pill)',
                  background: it.type === 'apt' ? '#ecfeff' : 'var(--chip-amber-bg)',
                  color: it.type === 'apt' ? '#155e75' : 'var(--chip-amber-ink)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon name={it.type === 'apt' ? 'stethoscope' : 'pill'} size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14.5 }}>{it.title}</div>
                  <div className="t-meta">{it.sub}{it.time ? ` · ${it.time} hs` : ''}</div>
                </div>
                <Icon name="chevron-right" size={16} color="var(--ink-300)" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const AddSheet = ({ onClose, onPick }) => (
  <div onClick={onClose} style={{
    position: 'absolute', inset: 0, background: 'rgba(11,21,34,0.35)',
    zIndex: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    animation: 'screen-in 0.2s ease',
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      width: '100%', background: 'var(--surface)',
      borderRadius: '28px 28px 0 0', padding: '14px 16px 110px',
      boxShadow: '0 -20px 60px rgba(0,0,0,0.2)',
      animation: 'screen-in 0.3s ease',
    }}>
      <div style={{ width: 40, height: 4, background: 'var(--ink-200)', borderRadius: 4, margin: '0 auto 14px' }}/>
      <div className="h-section" style={{ padding: '0 4px 8px' }}>Agregar a tu rutina</div>
      <div className="t-meta" style={{ padding: '0 4px 12px' }}>¿Qué querés guardar hoy?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AddOption icon="pill" tint="var(--chip-teal-bg)" ink="var(--chip-teal-ink)"
          title="Medicamento" sub="Dosis, horario y duración"
          onClick={() => onPick('add-med')} />
        <AddOption icon="stethoscope" tint="#ecfeff" ink="#155e75"
          title="Turno médico" sub="Especialidad, profesional, fecha"
          onClick={() => onPick('add-apt')} />
        <AddOption icon="sparkle" tint="linear-gradient(135deg, #0891b2, #0e7490)" ink="#fff"
          title="Pedírselo a vita" sub="Contame con tus palabras y lo agendo"
          onClick={() => onPick('ask-vita')} vita />
      </div>
    </div>
  </div>
);

const AddOption = ({ icon, tint, ink, title, sub, onClick, vita }) => (
  <div className="card" onClick={onClick} style={{
    padding: 14, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer',
  }}>
    <div style={{
      width: 44, height: 44, borderRadius: 14,
      background: tint, color: ink,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <Icon name={icon} size={20} />
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15, color: 'var(--ink-900)' }}>
        {title} {vita && <span style={{ color: 'var(--teal-600)', fontSize: 12, marginLeft: 4 }}>✨</span>}
      </div>
      <div className="t-meta" style={{ marginTop: 2 }}>{sub}</div>
    </div>
    <Icon name="chevron-right" size={16} color="var(--ink-300)" />
  </div>
);

window.RutinaScreen = RutinaScreen;
