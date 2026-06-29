import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Circle,
  ClipboardList,
  Hash,
  LogOut,
  Megaphone,
  Send,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import './styles.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

const channels = [
  {
    id: 'general',
    name: 'general-staff',
    title: 'Chat general del staff',
    description: 'Coordinacion operativa en tiempo real durante MONUR XVIII.',
  },
  {
    id: 'incidents',
    name: 'incidentes',
    title: 'Reporte de incidentes',
    description: 'Canal para documentar situaciones que requieren seguimiento.',
  },
  {
    id: 'announcements',
    name: 'avisos',
    title: 'Avisos importantes',
    description: 'Comunicaciones breves para todo el equipo.',
  },
];

const incidentTypes = ['Logistica', 'Seguridad', 'Delegacion', 'Protocolo', 'Tecnologia', 'Salud', 'Otro'];
const channelById = Object.fromEntries(channels.map((channel) => [channel.id, channel]));

function App() {
  return supabase ? <RealtimeWorkspace /> : <DemoWorkspace />;
}

function RealtimeWorkspace() {
  const profile = useStaffProfile();
  const [activeChannel, setActiveChannel] = useState('general');
  const [messages, setMessages] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    loadMessages(activeChannel).then(setMessages);
    const channel = supabase
      .channel(`monur-messages-${activeChannel}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'staff_messages',
        filter: `channel=eq.${activeChannel}`,
      }, (payload) => setMessages((current) => [...current, payload.new]))
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeChannel]);

  useEffect(() => {
    loadIncidents().then(setIncidents);
    const channel = supabase
      .channel('monur-incidents')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () =>
        loadIncidents().then(setIncidents)
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (!profile.ready) return undefined;
    const channel = supabase
      .channel('monur-message-notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_messages' }, (payload) => {
        const message = payload.new;
        if (message.staff_name === profile.name) return;
        pushNotification(setNotifications, {
          channel: message.channel,
          title: `${message.staff_name} escribio en #${getChannelName(message.channel)}`,
          body: message.body,
          onOpen: () => setActiveChannel(message.channel),
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile.name, profile.ready]);

  async function sendMessage(body) {
    await supabase.from('staff_messages').insert({
      channel: activeChannel,
      body,
      staff_name: profile.name,
      staff_role: profile.role,
      committee: profile.committee,
    });
  }

  async function createIncident(payload) {
    const { data } = await supabase
      .from('incidents')
      .insert({ ...payload, reporter_name: profile.name, reporter_role: profile.role, committee: profile.committee })
      .select()
      .single();

    if (data) {
      await supabase.from('staff_messages').insert({
        channel: 'incidents',
        body: `Incidente reportado: ${data.title}. Prioridad ${data.priority}.`,
        staff_name: profile.name,
        staff_role: profile.role,
        committee: profile.committee,
        incident_id: data.id,
      });
      pushNotification(setNotifications, {
        channel: 'incidents',
        title: `Incidente publicado en #${getChannelName('incidents')}`,
        body: data.title,
        onOpen: () => setActiveChannel('incidents'),
      });
    }
  }

  async function updateIncidentStatus(id, status) {
    await supabase.from('incidents').update({ status }).eq('id', id);
  }

  if (!profile.ready) return <StaffEntry onSave={profile.save} />;

  return (
    <Workspace
      profile={profile}
      activeChannel={activeChannel}
      setActiveChannel={setActiveChannel}
      messages={messages}
      incidents={incidents}
      onSend={sendMessage}
      onCreateIncident={createIncident}
      onUpdateIncidentStatus={updateIncidentStatus}
      notifications={notifications}
      onDismissNotification={(id) => setNotifications((current) => current.filter((n) => n.id !== id))}
    />
  );
}

function DemoWorkspace() {
  const profile = useStaffProfile();
  const [activeChannel, setActiveChannel] = useState('general');
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([
    {
      id: 'demo-1',
      channel: 'general',
      body: 'Bienvenidos al canal operativo de MONUR XVIII.',
      staff_name: 'Coordinacion General',
      staff_role: 'Direccion',
      committee: 'Secretaria',
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-2',
      channel: 'incidents',
      body: 'Incidente reportado: retraso en acreditacion. Prioridad media.',
      staff_name: 'Equipo Logistico',
      staff_role: 'Staff',
      committee: 'Logistica',
      created_at: new Date().toISOString(),
    },
  ]);
  const [incidents, setIncidents] = useState([
    {
      id: 'incident-demo-1',
      title: 'Retraso en acreditacion',
      type: 'Logistica',
      priority: 'media',
      status: 'abierto',
      location: 'Area de registro',
      description: 'Fila con alto volumen de participantes.',
      reporter_name: 'Equipo Logistico',
      reporter_role: 'Staff',
      committee: 'Logistica',
      created_at: new Date().toISOString(),
    },
    {
      id: 'incident-demo-2',
      title: 'Solicitud de apoyo medico',
      type: 'Salud',
      priority: 'critica',
      status: 'en_revision',
      location: 'Salon principal',
      description: 'Participante requiere asistencia inmediata.',
      reporter_name: 'Equipo Salud',
      reporter_role: 'Staff',
      committee: 'Salud',
      created_at: new Date().toISOString(),
    },
  ]);

  function sendMessage(body) {
    setMessages((current) => [...current, {
      id: `demo-message-${Date.now()}`,
      channel: activeChannel,
      body,
      staff_name: profile.name,
      staff_role: profile.role,
      committee: profile.committee,
      created_at: new Date().toISOString(),
    }]);
    pushNotification(setNotifications, {
      channel: activeChannel,
      title: `Mensaje enviado en #${getChannelName(activeChannel)}`,
      body,
      onOpen: () => setActiveChannel(activeChannel),
    });
  }

  function createIncident(payload) {
    const incident = {
      id: `demo-incident-${Date.now()}`,
      ...payload,
      status: 'abierto',
      reporter_name: profile.name,
      reporter_role: profile.role,
      committee: profile.committee,
      created_at: new Date().toISOString(),
    };
    setIncidents((current) => [incident, ...current]);
    setMessages((current) => [...current, {
      id: `demo-message-${Date.now()}`,
      channel: 'incidents',
      body: `Incidente reportado: ${incident.title}. Prioridad ${incident.priority}.`,
      staff_name: profile.name,
      staff_role: profile.role,
      committee: profile.committee,
      created_at: new Date().toISOString(),
    }]);
    pushNotification(setNotifications, {
      channel: 'incidents',
      title: `Incidente publicado en #${getChannelName('incidents')}`,
      body: incident.title,
      onOpen: () => setActiveChannel('incidents'),
    });
  }

  function updateIncidentStatus(id, status) {
    setIncidents((current) => current.map((incident) => (incident.id === id ? { ...incident, status } : incident)));
  }

  if (!profile.ready) return <StaffEntry onSave={profile.save} demo />;

  return (
    <Workspace
      profile={profile}
      activeChannel={activeChannel}
      setActiveChannel={setActiveChannel}
      messages={messages.filter((message) => message.channel === activeChannel)}
      incidents={incidents}
      onSend={sendMessage}
      onCreateIncident={createIncident}
      onUpdateIncidentStatus={updateIncidentStatus}
      notifications={notifications}
      onDismissNotification={(id) => setNotifications((current) => current.filter((n) => n.id !== id))}
      demo
    />
  );
}

function Workspace(props) {
  const { profile, activeChannel, setActiveChannel, messages, incidents, onSend, onCreateIncident, onUpdateIncidentStatus, notifications = [], onDismissNotification, demo = false } = props;
  const active = channels.find((channel) => channel.id === activeChannel);

  return (
    <main className="workspace">
      <aside className="server-panel">
        <div className="server-brand">
          <ShieldCheck size={30} />
          <div><strong>MONUR XVIII</strong><span>Centro de mando</span></div>
        </div>
        <nav className="channel-list" aria-label="Canales">
          {channels.map((channel) => (
            <button key={channel.id} className={activeChannel === channel.id ? 'channel active' : 'channel'} onClick={() => setActiveChannel(channel.id)}>
              <Hash size={18} /><span>{channel.name}</span>
            </button>
          ))}
        </nav>
        <div className="profile-box">
          <div className="avatar">{initials(profile.name)}</div>
          <div><strong>{profile.name}</strong><span>{profile.role} - {profile.committee}</span></div>
          <button className="icon-button" onClick={profile.clear} title="Salir del perfil"><LogOut size={17} /></button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div><h1><Hash size={22} /> {active.title}</h1><p>{active.description}</p></div>
          {demo && <span className="mode-pill">Demo sin Supabase</span>}
        </header>
        {activeChannel === 'general' && <CommandOverview incidents={incidents} messages={messages} profile={profile} />}
        <MessageList messages={messages} currentName={profile.name} />
        <Composer channelName={active.name} onSend={onSend} />
      </section>

      <aside className="incident-panel">
        <IncidentForm onCreate={onCreateIncident} />
        <IncidentList incidents={incidents} onUpdateStatus={onUpdateIncidentStatus} />
      </aside>
      <NotificationStack notifications={notifications} onDismiss={onDismissNotification} />
    </main>
  );
}

function CommandOverview({ incidents, messages, profile }) {
  const stats = useMemo(() => buildIncidentStats(incidents), [incidents]);
  const latestCritical = incidents.find((incident) => incident.priority === 'critica' && incident.status !== 'cerrado');

  return (
    <section className="command-overview" aria-label="Resumen operativo">
      <div className="hero-brief">
        <span className="eyebrow"><Activity size={15} /> Centro de mando activo</span>
        <h2>Bienvenido al canal general, {profile.name.split(' ')[0] || 'Staff'}.</h2>
        <p>Coordina al equipo, monitorea reportes y mantente al tanto de las incidencias mas importantes desde una vista preparada para escritorio, tablet y telefono.</p>
        <div className="hero-actions">
          <span><Circle size={10} fill="currentColor" /> {stats.open} abiertos</span>
          <span><TrendingUp size={15} /> {stats.total} reportes totales</span>
          <span><BarChart3 size={15} /> {messages.length} mensajes en este canal</span>
        </div>
      </div>
      <div className="metric-grid">
        <MetricCard label="Incidencias" value={stats.total} tone="blue" />
        <MetricCard label="Activas" value={stats.open} tone="amber" />
        <MetricCard label="Criticas" value={stats.critical} tone="red" />
        <MetricCard label="Resueltas" value={stats.resolved} tone="green" />
      </div>
      <div className="charts-grid">
        <PriorityChart counts={stats.byPriority} total={Math.max(stats.total, 1)} />
        <TypeChart counts={stats.byType} total={Math.max(stats.total, 1)} />
      </div>
      <div className="ops-note">
        <strong>{latestCritical ? latestCritical.title : 'Sin alertas criticas activas'}</strong>
        <span>{latestCritical ? `${latestCritical.location} - ${latestCritical.type}` : 'El equipo puede continuar operando desde el canal general.'}</span>
      </div>
    </section>
  );
}

function MetricCard({ label, value, tone }) {
  return <article className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function PriorityChart({ counts, total }) {
  const priorities = [['critica', 'Critica'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
  return (
    <article className="chart-card">
      <h3>Reportes por prioridad</h3>
      <div className="bar-chart">
        {priorities.map(([key, label]) => (
          <div className="bar-row" key={key}>
            <span>{label}</span><div className="bar-track"><i style={{ width: `${(counts[key] / total) * 100}%` }} /></div><strong>{counts[key]}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function TypeChart({ counts, total }) {
  const topTypes = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <article className="chart-card">
      <h3>Incidencias por area</h3>
      <div className="type-chart">
        {(topTypes.length ? topTypes : [['Sin reportes', 0]]).map(([type, count]) => (
          <div className="type-row" key={type}>
            <div><strong>{type}</strong><span>{count} reportes</span></div>
            <div className="type-meter"><i style={{ width: `${(count / total) * 100}%` }} /></div>
          </div>
        ))}
      </div>
    </article>
  );
}

function StaffEntry({ onSave, demo = false }) {
  const [form, setForm] = useState({ name: '', role: '', committee: '' });
  function submit(event) {
    event.preventDefault();
    onSave(form);
  }
  return (
    <main className="entry-page">
      <form className="entry-card" onSubmit={submit}>
        <div className="brand-icon"><UsersRound size={32} /></div>
        <h1>MONUR XVIII Staff Chat</h1>
        <p>Ingrese su informacion para entrar al canal de comunicacion operativo.</p>
        {demo && <div className="demo-banner">Modo demo. Al completar el .env usara Supabase en tiempo real.</div>}
        <TextInput label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
        <TextInput label="Rol o cargo" value={form.role} onChange={(role) => setForm({ ...form, role })} required />
        <TextInput label="Comite o area" value={form.committee} onChange={(committee) => setForm({ ...form, committee })} required />
        <button className="primary-button">Entrar al canal</button>
      </form>
    </main>
  );
}

function MessageList({ messages, currentName }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  return (
    <div className="message-list">
      {messages.map((message) => (
        <article key={message.id} className={message.staff_name === currentName ? 'staff-message mine' : 'staff-message'}>
          <div className="message-avatar">{initials(message.staff_name)}</div>
          <div className="message-content">
            <header><strong>{message.staff_name}</strong><span>{message.staff_role} - {message.committee}</span><time>{formatDateTime(message.created_at)}</time></header>
            <p>{message.body}</p>
          </div>
        </article>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

function Composer({ channelName, onSend }) {
  const [body, setBody] = useState('');
  function submit(event) {
    event.preventDefault();
    const cleanBody = body.trim();
    if (!cleanBody) return;
    onSend(cleanBody);
    setBody('');
  }
  return (
    <form className="composer" onSubmit={submit}>
      <input value={body} onChange={(event) => setBody(event.target.value)} placeholder={`Enviar mensaje a #${channelName}`} />
      <button className="send-button" title="Enviar"><Send size={18} /></button>
    </form>
  );
}

function IncidentForm({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', type: incidentTypes[0], priority: 'media', location: '', description: '' });
  function submit(event) {
    event.preventDefault();
    onCreate(form);
    setForm({ title: '', type: incidentTypes[0], priority: 'media', location: '', description: '' });
    setOpen(false);
  }
  return (
    <section className="incident-card">
      <button className="incident-toggle" onClick={() => setOpen((value) => !value)}><AlertTriangle size={18} />Reportar incidente</button>
      {open && (
        <form className="incident-form" onSubmit={submit}>
          <TextInput label="Titulo" value={form.title} onChange={(title) => setForm({ ...form, title })} required />
          <label className="field"><span>Tipo</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{incidentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="field"><span>Prioridad</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Critica</option></select></label>
          <TextInput label="Ubicacion" value={form.location} onChange={(location) => setForm({ ...form, location })} required />
          <label className="field"><span>Descripcion</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required /></label>
          <button className="primary-button">Guardar incidente</button>
        </form>
      )}
    </section>
  );
}

function IncidentList({ incidents, onUpdateStatus }) {
  const openIncidents = incidents.filter((incident) => incident.status !== 'cerrado');
  return (
    <section className="incident-feed">
      <h2><ClipboardList size={18} /> Incidentes activos</h2>
      {openIncidents.length === 0 && <p className="muted">No hay incidentes activos.</p>}
      {openIncidents.map((incident) => (
        <article key={incident.id} className={`incident-item ${incident.priority}`}>
          <div className="incident-top"><strong>{incident.title}</strong><span>{incident.priority}</span></div>
          <p>{incident.description}</p>
          <small>{incident.type} - {incident.location}</small>
          <small>Reportado por {incident.reporter_name}</small>
          <select value={incident.status} onChange={(event) => onUpdateStatus(incident.id, event.target.value)}>
            <option value="abierto">Abierto</option>
            <option value="en_revision">En revision</option>
            <option value="resuelto">Resuelto</option>
            <option value="cerrado">Cerrado</option>
          </select>
        </article>
      ))}
    </section>
  );
}

function NotificationStack({ notifications, onDismiss }) {
  if (notifications.length === 0) return null;
  return (
    <div className="notification-stack" aria-live="polite" aria-label="Notificaciones">
      {notifications.map((notification) => (
        <article key={notification.id} className="notification-toast">
          <button className="notification-body" onClick={notification.onOpen}>
            <span className="notification-channel"><Megaphone size={15} />#{getChannelName(notification.channel)}</span>
            <strong>{notification.title}</strong><span>{notification.body}</span>
          </button>
          <button className="notification-close" onClick={() => onDismiss(notification.id)} aria-label="Cerrar notificacion">x</button>
        </article>
      ))}
    </div>
  );
}

function useStaffProfile() {
  const [profile, setProfile] = useState(() => {
    const saved = localStorage.getItem('monur_staff_profile');
    return saved ? JSON.parse(saved) : null;
  });
  return useMemo(() => ({
    ready: Boolean(profile?.name && profile?.role && profile?.committee),
    name: profile?.name || '',
    role: profile?.role || '',
    committee: profile?.committee || '',
    save(nextProfile) {
      localStorage.setItem('monur_staff_profile', JSON.stringify(nextProfile));
      setProfile(nextProfile);
    },
    clear() {
      localStorage.removeItem('monur_staff_profile');
      setProfile(null);
    },
  }), [profile]);
}

async function loadMessages(channel) {
  const { data } = await supabase.from('staff_messages').select('*').eq('channel', channel).order('created_at', { ascending: true }).limit(300);
  return data || [];
}

async function loadIncidents() {
  const { data } = await supabase.from('incidents').select('*').order('created_at', { ascending: false });
  return data || [];
}

function TextInput({ label, value, onChange, type = 'text', required = false }) {
  return <label className="field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} /></label>;
}

function initials(name) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'ST';
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function getChannelName(channelId) {
  return channelById[channelId]?.name || channelId;
}

function cleanPreview(value) {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function pushNotification(setNotifications, notification) {
  const nextNotification = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, ...notification, body: cleanPreview(notification.body || '') };
  setNotifications((current) => [nextNotification, ...current].slice(0, 4));
  window.setTimeout(() => {
    setNotifications((current) => current.filter((currentNotification) => currentNotification.id !== nextNotification.id));
  }, 6500);
}

function buildIncidentStats(incidents) {
  return incidents.reduce((stats, incident) => {
    const status = incident.status || 'abierto';
    const priority = incident.priority || 'media';
    const type = incident.type || 'Otro';
    stats.total += 1;
    stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
    stats.byType[type] = (stats.byType[type] || 0) + 1;
    if (status !== 'cerrado') stats.open += 1;
    if (priority === 'critica' && status !== 'cerrado') stats.critical += 1;
    if (status === 'resuelto' || status === 'cerrado') stats.resolved += 1;
    return stats;
  }, {
    total: 0,
    open: 0,
    critical: 0,
    resolved: 0,
    byPriority: { baja: 0, media: 0, alta: 0, critica: 0 },
    byType: {},
  });
}

createRoot(document.getElementById('root')).render(<App />);
