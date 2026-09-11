// ResumenSaludScreen.jsx — Full editable health profile, opened from Home card
const ResumenSaludScreen = ({ userName = 'Mica', onBack, onOpenChat }) => {
  const [data, setData] = useState({
    nombreCompleto: `${userName} Álvarez`,
    email: 'sofia.alvarez@gmail.com',
    nacimiento: '14 de julio, 1991',
    edad: 34,
    genero: 'Femenino',
    grupo: '0 +',
    altura: '1,68 m',
    peso: '62,4 kg',
    condiciones: [
      { label: 'Hipertensión', tipo: 'permanente', color: 'teal', desde: '2022' },
      { label: 'SIBO', tipo: 'temporal', color: 'amber', desde: 'Mar 2026' },
    ],
    alergias: ['Penicilina', 'Polen de gramíneas', 'Intolerancia a la lactosa'],
    medicamentos: 4,
    contactoEmergencia: 'Laura Álvarez · mamá',
    contactoTel: '+54 9 11 5432 1234',
    obraSocial: 'OSDE · Plan 310',
    numeroAfiliado: '62-8490-23-01',
  });

  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (field, current) => {
    setEditingField(field);
    setEditValue(current);
  };
  const saveEdit = () => {
    if (editingField) {
      setData(d => ({ ...d, [editingField]: editValue }));
    }
    setEditingField(null);
  };

  return (
    <div className="screen-enter" style={{ padding: '8px 18px 120px', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Header con back */}
      <div className="row between" style={{ marginTop: 6, alignItems: 'center' }}>
        <div className="row gap-3" style={{ alignItems: 'center' }}>
          <div className="icon-btn" onClick={onBack} aria-label="Volver">
            <Icon name="chevron-left" size={18} />
          </div>
          <div>
            <div className="t-label" style={{ color: 'var(--teal-700)' }}>Perfil</div>
            <div className="h-display" style={{ fontSize: 22, color: 'var(--ink-900)', marginTop: 2 }}>Resumen de salud</div>
          </div>
        </div>
        <div className="icon-btn" onClick={onOpenChat} style={{
          background: 'linear-gradient(135deg, var(--teal-500), var(--teal-700))',
          color: '#fff', boxShadow: '0 6px 14px rgba(8,145,178,0.3)',
        }}>
          <Icon name="sparkle" size={16} color="#fff" />
        </div>
      </div>

      {/* Hero */}
      <div className="card" style={{ padding: 20, textAlign: 'center' }}>
        <div className="avatar" style={{ width: 72, height: 72, fontSize: 26, margin: '0 auto' }}>
          {userName.charAt(0)}
        </div>
        <div className="h-title" style={{ fontSize: 19, marginTop: 12 }}>{data.nombreCompleto}</div>
        <div className="t-meta" style={{ marginTop: 3 }}>{data.edad} años · {data.genero} · Grupo {data.grupo}</div>
        <div className="row gap-2" style={{ justifyContent: 'center', marginTop: 14, flexWrap: 'wrap', rowGap: 6 }}>
          <span className="chip teal">{data.medicamentos} medicamentos</span>
          <span className="chip violet">{data.condiciones.length} condiciones</span>
          <span className="chip rose">{data.alergias.length} alergias</span>
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
            Actualizar con vita
          </div>
          <div className="t-meta">Contame qué cambió y lo actualizo.</div>
        </div>
        <Icon name="chevron-right" size={18} color="var(--teal-600)" />
      </div>

      {/* Datos personales */}
      <Section title="Datos personales">
        <EditRow label="Nombre completo" value={data.nombreCompleto} field="nombreCompleto" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} />
        <EditRow label="Email" value={data.email} field="email" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} />
        <EditRow label="Fecha de nacimiento" value={`${data.nacimiento} · ${data.edad} años`} field="nacimiento" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} />
        <EditRow label="Género" value={data.genero} field="genero" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} last />
      </Section>

      {/* Medidas */}
      <Section title="Medidas">
        <EditRow label="Altura" value={data.altura} field="altura" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} />
        <EditRow label="Peso" value={data.peso} field="peso" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} />
        <EditRow label="Grupo sanguíneo" value={data.grupo} field="grupo" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} last />
      </Section>

      {/* Condiciones */}
      <div>
        <div className="row between" style={{ padding: '0 6px 10px' }}>
          <div className="h-section">Condiciones</div>
          <span className="link">+ Agregar</span>
        </div>
        <div className="card" style={{ padding: 0 }}>
          {data.condiciones.map((c, i) => (
            <div key={c.label} style={{
              padding: '14px 18px',
              borderBottom: i < data.condiciones.length - 1 ? '1px solid rgba(15,33,54,0.05)' : 'none',
              display: 'flex', gap: 12, alignItems: 'center',
            }}>
              <span className={`chip ${c.color}`} style={{ flexShrink: 0 }}>{c.label}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-meta" style={{ fontSize: 11.5, textTransform: 'capitalize' }}>
                  {c.tipo} · desde {c.desde}
                </div>
              </div>
              <Icon name="chevron-right" size={16} color="var(--ink-300)" />
            </div>
          ))}
        </div>
      </div>

      {/* Alergias */}
      <div>
        <div className="row between" style={{ padding: '0 6px 10px' }}>
          <div className="h-section">Alergias</div>
          <span className="link">+ Agregar</span>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div className="row gap-2" style={{ flexWrap: 'wrap', rowGap: 8 }}>
            {data.alergias.map(a => (
              <span key={a} className="chip rose" style={{ paddingRight: 4 }}>
                {a}
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
        </div>
      </div>

      {/* Obra social */}
      <Section title="Cobertura médica">
        <EditRow label="Obra social / prepaga" value={data.obraSocial} field="obraSocial" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} />
        <EditRow label="N° afiliado" value={data.numeroAfiliado} field="numeroAfiliado" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} last />
      </Section>

      {/* Contacto emergencia */}
      <Section title="Contacto de emergencia" subtitle="Alguien a quien llamar en caso de urgencia">
        <EditRow label="Nombre y relación" value={data.contactoEmergencia} field="contactoEmergencia" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} />
        <EditRow label="Teléfono" value={data.contactoTel} field="contactoTel" onEdit={startEdit} editingField={editingField} editValue={editValue} setEditValue={setEditValue} onSave={saveEdit} last />
      </Section>

      {/* Acciones */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 20px' }}>
        <button className="btn btn-oauth btn-block">
          <Icon name="upload" size={16} /> Exportar mis datos
        </button>
        <button className="btn btn-ghost btn-block" style={{ color: 'var(--danger)' }}>
          Eliminar mi cuenta
        </button>
      </div>
    </div>
  );
};

const Section = ({ title, subtitle, children }) => (
  <div>
    <div style={{ padding: '0 6px 10px' }}>
      <div className="h-section">{title}</div>
      {subtitle && <div className="t-meta" style={{ marginTop: 2 }}>{subtitle}</div>}
    </div>
    <div className="card" style={{ padding: 0 }}>{children}</div>
  </div>
);

const EditRow = ({ label, value, field, onEdit, editingField, editValue, setEditValue, onSave, last }) => {
  const editing = editingField === field;
  return (
    <div style={{
      padding: '14px 18px',
      borderBottom: last ? 'none' : '1px solid rgba(15,33,54,0.05)',
      cursor: editing ? 'default' : 'pointer',
    }} onClick={() => !editing && onEdit(field, value)}>
      <div className="t-meta" style={{ fontSize: 11.5 }}>{label}</div>
      {editing ? (
        <div className="row gap-2" style={{ marginTop: 6, alignItems: 'center' }}>
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSave(); }}
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'var(--surface-sunk)',
              padding: '8px 12px', borderRadius: 10,
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
              color: 'var(--ink-900)',
            }}/>
          <button onClick={onSave} style={{
            border: 'none', padding: '8px 14px', borderRadius: 'var(--r-pill)',
            background: 'linear-gradient(135deg, var(--teal-500), var(--teal-700))',
            color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12.5,
            cursor: 'pointer',
          }}>Guardar</button>
        </div>
      ) : (
        <div className="row between" style={{ marginTop: 3, alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600, color: 'var(--ink-900)' }}>{value}</span>
          <Icon name="edit" size={14} color="var(--ink-300)" />
        </div>
      )}
    </div>
  );
};

window.ResumenSaludScreen = ResumenSaludScreen;
