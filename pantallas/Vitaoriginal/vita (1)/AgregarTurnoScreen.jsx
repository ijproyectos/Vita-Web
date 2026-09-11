// AgregarTurnoScreen.jsx — Create a new medical appointment
const AgregarTurnoScreen = ({ onBack, onSave, onOpenChat }) => {
  const [form, setForm] = useState({
    especialidad: '',
    profesional: '',
    lugar: '',
    fecha: '',
    hora: '',
    motivo: '',
    recordatorio: '1d',
    acompanado: false,
    notas: '',
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const especialidades = [
    { label: 'Clínica', icon: 'stethoscope', color: 'teal' },
    { label: 'Cardiología', icon: 'heart', color: 'rose' },
    { label: 'Gastroenterología', icon: 'pill', color: 'amber' },
    { label: 'Ginecología', icon: 'heart-plus', color: 'violet' },
    { label: 'Endocrinología', icon: 'flame', color: 'amber' },
    { label: 'Laboratorio', icon: 'activity', color: 'teal' },
    { label: 'Imágenes', icon: 'camera', color: 'violet' },
    { label: 'Otro', icon: 'plus', color: 'slate' },
  ];

  const recordatorios = [
    { value: '1h', label: '1 hora antes' },
    { value: '1d', label: '1 día antes' },
    { value: '2d', label: '2 días antes' },
    { value: '1w', label: '1 semana antes' },
  ];

  const canSave = form.especialidad && form.fecha && form.hora;

  return (
    <div className="screen-enter" style={{ padding: '8px 18px 140px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header */}
      <div className="row between" style={{ marginTop: 6, alignItems: 'center' }}>
        <div className="row gap-3" style={{ alignItems: 'center' }}>
          <div className="icon-btn" onClick={onBack} aria-label="Volver">
            <Icon name="chevron-left" size={18} />
          </div>
          <div>
            <div className="t-label" style={{ color: 'var(--teal-700)' }}>Rutina</div>
            <div className="h-display" style={{ fontSize: 22, color: 'var(--ink-900)', marginTop: 2 }}>Agregar turno</div>
          </div>
        </div>
        <div className="icon-btn" onClick={onOpenChat} style={{
          background: 'linear-gradient(135deg, var(--teal-500), var(--teal-700))',
          color: '#fff', boxShadow: '0 6px 14px rgba(8,145,178,0.3)',
        }} aria-label="Pedirle a vita">
          <Icon name="sparkle" size={16} color="#fff" />
        </div>
      </div>

      {/* vita shortcut */}
      <div onClick={onOpenChat} style={{
        background: 'linear-gradient(135deg, rgba(8,145,178,0.08), rgba(14,116,144,0.04))',
        borderRadius: 'var(--r-md)', padding: 14,
        display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer',
        boxShadow: 'inset 0 0 0 1px rgba(8,145,178,0.15)',
      }}>
        <VitaAvatar size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--ink-900)' }}>
            Agregar por voz con vita
          </div>
          <div className="t-meta">"Tengo turno con la cardióloga el martes 10hs"</div>
        </div>
        <Icon name="chevron-right" size={18} color="var(--teal-600)" />
      </div>

      {/* Especialidad */}
      <div>
        <Label text="Especialidad" required />
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        }}>
          {especialidades.map(e => {
            const selected = form.especialidad === e.label;
            return (
              <div key={e.label} onClick={() => update('especialidad', e.label)} style={{
                padding: '14px 6px 10px',
                borderRadius: 'var(--r-md)',
                background: selected ? 'var(--teal-600)' : 'var(--surface-raised)',
                color: selected ? '#fff' : 'var(--ink-800)',
                boxShadow: selected ? '0 8px 18px rgba(8,145,178,0.25)' : 'var(--shadow-soft)',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                transition: 'all 0.15s',
              }}>
                <Icon name={e.icon} size={20} color={selected ? '#fff' : 'var(--teal-700)'} />
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 600,
                  textAlign: 'center', lineHeight: 1.1,
                }}>{e.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Profesional */}
      <Field label="Profesional" placeholder="Dra. Laura Méndez"
        value={form.profesional} onChange={v => update('profesional', v)} />

      {/* Lugar */}
      <Field label="Lugar / institución" placeholder="Hospital Italiano · sede Perón"
        value={form.lugar} onChange={v => update('lugar', v)}
        icon="location" />

      {/* Fecha + Hora */}
      <div className="row gap-3" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <Label text="Fecha" required />
          <DateInput value={form.fecha} onChange={v => update('fecha', v)} />
        </div>
        <div style={{ flex: 1 }}>
          <Label text="Hora" required />
          <TimeInput value={form.hora} onChange={v => update('hora', v)} />
        </div>
      </div>

      {/* Motivo */}
      <Field label="Motivo" placeholder="Control anual, seguimiento…"
        value={form.motivo} onChange={v => update('motivo', v)} />

      {/* Recordatorio */}
      <div>
        <Label text="Recordarme" />
        <div style={{
          display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          {recordatorios.map(r => {
            const sel = form.recordatorio === r.value;
            return (
              <button key={r.value} onClick={() => update('recordatorio', r.value)} style={{
                border: 'none', padding: '9px 14px', borderRadius: 'var(--r-pill)',
                background: sel ? 'var(--teal-600)' : 'var(--surface-sunk)',
                color: sel ? '#fff' : 'var(--ink-700)',
                fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer',
                boxShadow: sel ? '0 6px 14px rgba(8,145,178,0.25)' : 'none',
              }}>{r.label}</button>
            );
          })}
        </div>
      </div>

      {/* Toggle acompañado */}
      <div className="card" style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
      }} onClick={() => update('acompanado', !form.acompanado)}>
        <Icon name="user" size={18} color="var(--teal-700)" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5, color: 'var(--ink-900)' }}>
            Voy a ir acompañada
          </div>
          <div className="t-meta">Para que vita se lo recuerde también a esa persona</div>
        </div>
        <Toggle on={form.acompanado} />
      </div>

      {/* Notas */}
      <div>
        <Label text="Notas" />
        <textarea
          value={form.notas}
          onChange={e => update('notas', e.target.value)}
          placeholder="Llevar estudios previos, ayunar 8hs, etc."
          rows={3}
          style={{
            width: '100%', border: 'none', outline: 'none',
            background: 'var(--surface-sunk)',
            padding: '12px 14px', borderRadius: 'var(--r-md)',
            fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-900)',
            resize: 'none', boxSizing: 'border-box',
          }}/>
      </div>

      {/* Sticky save bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(to top, var(--surface-base) 70%, rgba(255,255,255,0))',
        padding: '16px 18px 24px',
        display: 'flex', gap: 10,
      }}>
        <button onClick={onBack} style={{
          flex: '0 0 auto', padding: '14px 18px', borderRadius: 'var(--r-pill)',
          border: 'none', background: 'var(--surface-sunk)',
          color: 'var(--ink-700)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14,
          cursor: 'pointer',
        }}>Cancelar</button>
        <button
          disabled={!canSave}
          onClick={() => canSave && onSave(form)}
          style={{
            flex: 1, padding: '14px 18px', borderRadius: 'var(--r-pill)',
            border: 'none',
            background: canSave
              ? 'linear-gradient(135deg, var(--teal-500), var(--teal-700))'
              : 'var(--surface-sunk)',
            color: canSave ? '#fff' : 'var(--ink-300)',
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14,
            cursor: canSave ? 'pointer' : 'not-allowed',
            boxShadow: canSave ? '0 10px 24px rgba(8,145,178,0.35)' : 'none',
            transition: 'all 0.15s',
          }}>
          Guardar turno
        </button>
      </div>
    </div>
  );
};

const Label = ({ text, required }) => (
  <div style={{
    fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600,
    color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.04em',
    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4,
  }}>
    {text}
    {required && <span style={{ color: 'var(--teal-600)' }}>•</span>}
  </div>
);

const Field = ({ label, placeholder, value, onChange, icon }) => (
  <div>
    <Label text={label} />
    <div style={{
      background: 'var(--surface-sunk)',
      borderRadius: 'var(--r-md)',
      display: 'flex', alignItems: 'center', gap: 10,
      padding: icon ? '0 14px' : 0,
    }}>
      {icon && <Icon name={icon} size={16} color="var(--ink-500)" />}
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          flex: 1, border: 'none', outline: 'none', background: 'transparent',
          padding: icon ? '12px 0' : '12px 14px',
          fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-900)',
          fontWeight: 500,
        }}/>
    </div>
  </div>
);

const DateInput = ({ value, onChange }) => {
  const chips = [
    { label: 'Hoy',    offset: 0 },
    { label: 'Mañana', offset: 1 },
    { label: '+3 días', offset: 3 },
  ];
  const fmt = (d) => {
    const dias = ['dom','lun','mar','mié','jue','vie','sáb'];
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]}`;
  };
  const pick = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    onChange(fmt(d));
  };
  return (
    <div>
      <div style={{
        background: 'var(--surface-sunk)', borderRadius: 'var(--r-md)',
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Icon name="routine" size={16} color="var(--teal-700)" />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="mar 22 abr"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--ink-900)',
          }}/>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        {chips.map(c => (
          <button key={c.label} onClick={() => pick(c.offset)} style={{
            border: 'none', background: 'transparent',
            padding: '4px 10px', borderRadius: 'var(--r-pill)',
            fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600,
            color: 'var(--teal-700)', cursor: 'pointer',
            boxShadow: 'inset 0 0 0 1px rgba(8,145,178,0.2)',
          }}>{c.label}</button>
        ))}
      </div>
    </div>
  );
};

const TimeInput = ({ value, onChange }) => {
  const chips = ['08:00', '10:00', '14:00', '17:00'];
  return (
    <div>
      <div style={{
        background: 'var(--surface-sunk)', borderRadius: 'var(--r-md)',
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Icon name="clock" size={16} color="var(--teal-700)" />
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="10:30"
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--ink-900)',
          }}/>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {chips.map(c => (
          <button key={c} onClick={() => onChange(c)} style={{
            border: 'none', background: 'transparent',
            padding: '4px 10px', borderRadius: 'var(--r-pill)',
            fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600,
            color: 'var(--teal-700)', cursor: 'pointer',
            boxShadow: 'inset 0 0 0 1px rgba(8,145,178,0.2)',
          }}>{c}</button>
        ))}
      </div>
    </div>
  );
};

const Toggle = ({ on }) => (
  <div style={{
    width: 42, height: 24, borderRadius: 999,
    background: on ? 'var(--teal-600)' : 'rgba(15,33,54,0.15)',
    position: 'relative', transition: 'background 0.2s',
    flexShrink: 0,
  }}>
    <div style={{
      position: 'absolute', top: 2, left: on ? 20 : 2,
      width: 20, height: 20, borderRadius: '50%',
      background: '#fff',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      transition: 'left 0.2s',
    }}/>
  </div>
);

window.AgregarTurnoScreen = AgregarTurnoScreen;
