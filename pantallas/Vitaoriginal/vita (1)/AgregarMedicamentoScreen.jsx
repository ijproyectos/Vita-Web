// AgregarMedicamentoScreen.jsx — Create a new medication
const AgregarMedicamentoScreen = ({ onBack, onSave, onOpenChat }) => {
  const [form, setForm] = useState({
    nombre: '',
    dosis: '',
    unidad: 'mg',
    frecuencia: '1xdia',
    momentos: [], // 'manana' | 'mediodia' | 'tarde' | 'noche'
    conComida: 'no-importa', // 'antes' | 'con' | 'despues' | 'no-importa'
    duracion: 'indefinido',
    inicio: 'hoy',
    notas: '',
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleMomento = (m) => setForm(f => ({
    ...f,
    momentos: f.momentos.includes(m) ? f.momentos.filter(x => x !== m) : [...f.momentos, m],
  }));

  const unidades = ['mg', 'ml', 'gotas', 'UI', 'comp.'];
  const frecuencias = [
    { v: '1xdia', label: '1 vez al día' },
    { v: '2xdia', label: '2 veces al día' },
    { v: '3xdia', label: '3 veces al día' },
    { v: 'cada8h', label: 'Cada 8 hs' },
    { v: 'cada12h', label: 'Cada 12 hs' },
    { v: 'segun', label: 'Según necesidad' },
  ];
  const momentos = [
    { key: 'manana', label: 'Mañana', hora: '08:00', icon: 'sun' },
    { key: 'mediodia', label: 'Mediodía', hora: '13:00', icon: 'sun' },
    { key: 'tarde', label: 'Tarde', hora: '18:00', icon: 'sun' },
    { key: 'noche', label: 'Noche', hora: '22:00', icon: 'moon' },
  ];
  const comidas = [
    { v: 'antes',      label: 'Antes' },
    { v: 'con',        label: 'Con' },
    { v: 'despues',    label: 'Después' },
    { v: 'no-importa', label: 'Cualquier momento' },
  ];
  const duraciones = [
    { v: '7d', label: '7 días' },
    { v: '14d', label: '14 días' },
    { v: '30d', label: '30 días' },
    { v: 'indefinido', label: 'Indefinido' },
  ];

  const canSave = form.nombre && form.dosis && form.momentos.length > 0;

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
            <div className="h-display" style={{ fontSize: 22, color: 'var(--ink-900)', marginTop: 2 }}>Agregar medicamento</div>
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
          <div className="t-meta">"Metformina 500 mg, 2 veces al día con comida"</div>
        </div>
        <Icon name="chevron-right" size={18} color="var(--teal-600)" />
      </div>

      {/* Nombre */}
      <MedField label="Nombre del medicamento" required
        placeholder="Metformina, Losartán, Omeprazol…"
        value={form.nombre} onChange={v => update('nombre', v)} />

      {/* Dosis + unidad */}
      <div>
        <MedLabel text="Dosis" required />
        <div style={{
          display: 'flex', gap: 8, alignItems: 'stretch',
        }}>
          <div style={{
            flex: 1,
            background: 'var(--surface-sunk)',
            borderRadius: 'var(--r-md)',
          }}>
            <input
              value={form.dosis}
              onChange={e => update('dosis', e.target.value)}
              placeholder="500"
              inputMode="decimal"
              style={{
                width: '100%', border: 'none', outline: 'none', background: 'transparent',
                padding: '12px 14px',
                fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--ink-900)',
                boxSizing: 'border-box',
              }}/>
          </div>
          <div style={{
            display: 'flex', gap: 4,
            background: 'var(--surface-sunk)',
            borderRadius: 'var(--r-md)',
            padding: 3,
          }}>
            {unidades.map(u => (
              <button key={u} onClick={() => update('unidad', u)} style={{
                border: 'none',
                background: form.unidad === u ? 'var(--surface-raised)' : 'transparent',
                padding: '6px 10px', borderRadius: 8,
                fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                color: form.unidad === u ? 'var(--teal-700)' : 'var(--ink-500)',
                cursor: 'pointer',
                boxShadow: form.unidad === u ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
              }}>{u}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Frecuencia */}
      <div>
        <MedLabel text="Frecuencia" required />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {frecuencias.map(f => {
            const sel = form.frecuencia === f.v;
            return (
              <button key={f.v} onClick={() => update('frecuencia', f.v)} style={{
                border: 'none', padding: '9px 14px', borderRadius: 'var(--r-pill)',
                background: sel ? 'var(--teal-600)' : 'var(--surface-sunk)',
                color: sel ? '#fff' : 'var(--ink-700)',
                fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer',
                boxShadow: sel ? '0 6px 14px rgba(8,145,178,0.25)' : 'none',
              }}>{f.label}</button>
            );
          })}
        </div>
      </div>

      {/* Momentos del día */}
      <div>
        <MedLabel text="¿Cuándo tomarlo?" required />
        <div className="t-meta" style={{ marginTop: -4, marginBottom: 10, fontSize: 12 }}>
          Podés elegir más de uno
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8,
        }}>
          {momentos.map(m => {
            const sel = form.momentos.includes(m.key);
            return (
              <div key={m.key} onClick={() => toggleMomento(m.key)} style={{
                padding: '14px 14px',
                borderRadius: 'var(--r-md)',
                background: sel ? 'var(--teal-600)' : 'var(--surface-raised)',
                color: sel ? '#fff' : 'var(--ink-800)',
                boxShadow: sel ? '0 8px 18px rgba(8,145,178,0.25)' : 'var(--shadow-soft)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all 0.15s',
              }}>
                <Icon name={m.icon} size={18} color={sel ? '#fff' : 'var(--teal-700)'} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13.5 }}>{m.label}</div>
                  <div style={{
                    fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 500,
                    opacity: sel ? 0.85 : 1, color: sel ? '#fff' : 'var(--ink-500)',
                  }}>{m.hora} hs</div>
                </div>
                {sel && <Icon name="check" size={16} color="#fff" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Relación con comida */}
      <div>
        <MedLabel text="En relación a la comida" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {comidas.map(c => {
            const sel = form.conComida === c.v;
            return (
              <button key={c.v} onClick={() => update('conComida', c.v)} style={{
                border: 'none', padding: '9px 13px', borderRadius: 'var(--r-pill)',
                background: sel ? 'var(--teal-600)' : 'var(--surface-sunk)',
                color: sel ? '#fff' : 'var(--ink-700)',
                fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer',
                boxShadow: sel ? '0 6px 14px rgba(8,145,178,0.25)' : 'none',
              }}>{c.label}</button>
            );
          })}
        </div>
      </div>

      {/* Duración */}
      <div>
        <MedLabel text="Duración del tratamiento" />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {duraciones.map(d => {
            const sel = form.duracion === d.v;
            return (
              <button key={d.v} onClick={() => update('duracion', d.v)} style={{
                border: 'none', padding: '9px 13px', borderRadius: 'var(--r-pill)',
                background: sel ? 'var(--teal-600)' : 'var(--surface-sunk)',
                color: sel ? '#fff' : 'var(--ink-700)',
                fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
                cursor: 'pointer',
                boxShadow: sel ? '0 6px 14px rgba(8,145,178,0.25)' : 'none',
              }}>{d.label}</button>
            );
          })}
        </div>
      </div>

      {/* Notas */}
      <div>
        <MedLabel text="Notas" />
        <textarea
          value={form.notas}
          onChange={e => update('notas', e.target.value)}
          placeholder="Recetado por Dr. Pérez, para hipertensión…"
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
          Guardar medicamento
        </button>
      </div>
    </div>
  );
};

const MedLabel = ({ text, required }) => (
  <div style={{
    fontFamily: 'var(--font-body)', fontSize: 11.5, fontWeight: 600,
    color: 'var(--ink-500)', textTransform: 'uppercase', letterSpacing: '0.04em',
    marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4,
  }}>
    {text}
    {required && <span style={{ color: 'var(--teal-600)' }}>•</span>}
  </div>
);

const MedField = ({ label, placeholder, value, onChange, required }) => (
  <div>
    <MedLabel text={label} required={required} />
    <div style={{
      background: 'var(--surface-sunk)',
      borderRadius: 'var(--r-md)',
    }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', border: 'none', outline: 'none', background: 'transparent',
          padding: '12px 14px',
          fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--ink-900)',
          fontWeight: 500,
          boxSizing: 'border-box',
        }}/>
    </div>
  </div>
);

window.AgregarMedicamentoScreen = AgregarMedicamentoScreen;
