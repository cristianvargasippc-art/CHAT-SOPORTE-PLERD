import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import DOMPurify from 'dompurify';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
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
    description: 'Coordinación operativa en tiempo real durante MONUR XVIII.',
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

const incidentTypes = ['Logística', 'Seguridad', 'Delegación', 'Protocolo', 'Tecnología', 'Salud', 'Otro'];
const channelById = Object.fromEntries(channels.map((channel) => [channel.id, channel]));
const FIELD_LIMITS = {
  profile: 70,
  message: 1500,
  incidentTitle: 120,
  incidentLocation: 120,
  incidentDescription: 1200,
};

function App() {
  return supabase ? <RealtimeWorkspace /> : <DemoWorkspace />;
}

function RealtimeWorkspace() {
  const profile = useStaffProfile();
  const [activeChannel, setActiveChannel] = useState('general');
  const [messages, setMessages] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadByChannel, setUnreadByChannel] = useState({});

  function openChannel(channelId) {
    setActiveChannel(channelId);
    setUnreadByChannel((current) => ({ ...current, [channelId]: 0 }));
  }

  useEffect(() => {
    loadMessages(activeChannel).then(setMessages);
    setUnreadByChannel((current) => ({ ...current, [activeChannel]: 0 }));
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
        if (message.channel !== activeChannel) {
          setUnreadByChannel((current) => ({
            ...current,
            [message.channel]: (current[message.channel] || 0) + 1,
          }));
        }
        pushNotification(setNotifications, {
          channel: message.channel,
          title: `${message.staff_name} escribió en #${getChannelName(message.channel)}`,
          body: message.body,
          onOpen: () => openChannel(message.channel),
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeChannel, profile.name, profile.ready]);

  async function sendMessage(body) {
    const cleanBody = sanitizePlainText(body, FIELD_LIMITS.message);
    if (!cleanBody) return;
    const { error } = await supabase.from('staff_messages').insert({
      channel: activeChannel,
      body: cleanBody,
      staff_name: profile.name,
      staff_role: profile.role,
      committee: profile.committee,
    });
    if (error) throw error;
  }

  async function createIncident(payload) {
    const cleanPayload = sanitizeIncidentPayload(payload);
    if (!cleanPayload) return;
    const { data } = await supabase
      .from('incidents')
      .insert({ ...cleanPayload, reporter_name: profile.name, reporter_role: profile.role, committee: profile.committee })
      .select()
      .single();

    if (data) {
      await supabase.from('staff_messages').insert({
        channel: 'incidents',
        body: sanitizePlainText(`Incidente reportado: ${data.title}. Prioridad ${data.priority}.`, FIELD_LIMITS.message),
        staff_name: profile.name,
        staff_role: profile.role,
        committee: profile.committee,
        incident_id: data.id,
      });
      pushNotification(setNotifications, {
        channel: 'incidents',
        title: `Incidente publicado en #${getChannelName('incidents')}`,
        body: data.title,
        onOpen: () => openChannel('incidents'),
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
      setActiveChannel={openChannel}
      messages={messages}
      incidents={incidents}
      onSend={sendMessage}
      onCreateIncident={createIncident}
      onUpdateIncidentStatus={updateIncidentStatus}
      notifications={notifications}
      unreadByChannel={unreadByChannel}
      onDismissNotification={(id) => setNotifications((current) => current.filter((n) => n.id !== id))}
    />
  );
}

function DemoWorkspace() {
  const profile = useStaffProfile();
  const [activeChannel, setActiveChannel] = useState('general');
  const [notifications, setNotifications] = useState([]);
  const [unreadByChannel, setUnreadByChannel] = useState({ incidents: 1 });
  const [messages, setMessages] = useState([
    {
      id: 'demo-1',
      channel: 'general',
      body: 'Bienvenidos al canal operativo de MONUR XVIII.',
      staff_name: 'Coordinación General',
      staff_role: 'Dirección',
      committee: 'Secretaría',
      created_at: new Date().toISOString(),
    },
    {
      id: 'demo-2',
      channel: 'incidents',
      body: 'Incidente reportado: retraso en acreditación. Prioridad media.',
      staff_name: 'Equipo Logístico',
      staff_role: 'Staff',
      committee: 'Logística',
      created_at: new Date().toISOString(),
    },
  ]);
  const [incidents, setIncidents] = useState([
    {
      id: 'incident-demo-1',
      title: 'Retraso en acreditación',
      type: 'Logística',
      priority: 'media',
      status: 'abierto',
      location: 'Área de registro',
      description: 'Fila con alto volumen de participantes.',
      reporter_name: 'Equipo Logístico',
      reporter_role: 'Staff',
      committee: 'Logística',
      created_at: new Date().toISOString(),
    },
    {
      id: 'incident-demo-2',
      title: 'Solicitud de apoyo médico',
      type: 'Salud',
      priority: 'critica',
      status: 'en_revision',
      location: 'Salón principal',
      description: 'Participante requiere asistencia inmediata.',
      reporter_name: 'Equipo Salud',
      reporter_role: 'Staff',
      committee: 'Salud',
      created_at: new Date().toISOString(),
    },
  ]);

  function openChannel(channelId) {
    setActiveChannel(channelId);
    setUnreadByChannel((current) => ({ ...current, [channelId]: 0 }));
  }

  function sendMessage(body) {
    const cleanBody = sanitizePlainText(body, FIELD_LIMITS.message);
    if (!cleanBody) return;
    setMessages((current) => [...current, {
      id: `demo-message-${Date.now()}`,
      channel: activeChannel,
      body: cleanBody,
      staff_name: profile.name,
      staff_role: profile.role,
      committee: profile.committee,
      created_at: new Date().toISOString(),
    }]);
    pushNotification(setNotifications, {
      channel: activeChannel,
      title: `Mensaje enviado en #${getChannelName(activeChannel)}`,
      body: cleanBody,
      onOpen: () => openChannel(activeChannel),
    });
  }

  function createIncident(payload) {
    const cleanPayload = sanitizeIncidentPayload(payload);
    if (!cleanPayload) return;
    const incident = {
      id: `demo-incident-${Date.now()}`,
      ...cleanPayload,
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
      body: sanitizePlainText(`Incidente reportado: ${incident.title}. Prioridad ${incident.priority}.`, FIELD_LIMITS.message),
      staff_name: profile.name,
      staff_role: profile.role,
      committee: profile.committee,
      created_at: new Date().toISOString(),
    }]);
    if (activeChannel !== 'incidents') {
      setUnreadByChannel((current) => ({ ...current, incidents: (current.incidents || 0) + 1 }));
    }
    pushNotification(setNotifications, {
      channel: 'incidents',
      title: `Incidente publicado en #${getChannelName('incidents')}`,
      body: incident.title,
      onOpen: () => openChannel('incidents'),
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
      setActiveChannel={openChannel}
      messages={messages.filter((message) => message.channel === activeChannel)}
      incidents={incidents}
      onSend={sendMessage}
      onCreateIncident={createIncident}
      onUpdateIncidentStatus={updateIncidentStatus}
      notifications={notifications}
      unreadByChannel={unreadByChannel}
      onDismissNotification={(id) => setNotifications((current) => current.filter((n) => n.id !== id))}
      demo
    />
  );
}

function Workspace(props) {
  const {
    profile,
    activeChannel,
    setActiveChannel,
    messages,
    incidents,
    onSend,
    onCreateIncident,
    onUpdateIncidentStatus,
    notifications = [],
    unreadByChannel = {},
    onDismissNotification,
    demo = false,
  } = props;
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
              <span className="channel-main"><Hash size={18} /><span>{channel.name}</span></span>
              {Boolean(unreadByChannel[channel.id]) && <span className="unread-badge">{unreadByChannel[channel.id]}</span>}
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
          <div className="topbar-actions">
            <span className="channel-status"><Bell size={15} /> {notifications.length || 'Sin'} alertas</span>
            {demo && <span className="mode-pill">Demo sin Supabase</span>}
          </div>
        </header>
        <ChannelOverview channelId={activeChannel} incidents={incidents} messages={messages} profile={profile} />
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

function ChannelOverview({ channelId, incidents, messages, profile }) {
  const stats = useMemo(() => buildIncidentStats(incidents), [incidents]);
  const latestCritical = incidents.find((incident) => incident.priority === 'critica' && incident.status !== 'cerrado');
  const channelConfig = {
    general: {
      eyebrow: 'Centro de mando activo',
      title: `Bienvenido al canal general, ${profile.name.split(' ')[0] || 'Staff'}.`,
      copy: 'Coordina al equipo, monitorea reportes y mantente al tanto de las incidencias más importantes desde una vista preparada para escritorio, tablet y teléfono.',
      noteTitle: latestCritical ? latestCritical.title : 'Sin alertas críticas activas',
      noteText: latestCritical ? `${latestCritical.location} - ${latestCritical.type}` : 'El equipo puede continuar operando desde el canal general.',
    },
    incidents: {
      eyebrow: 'Seguimiento de incidentes',
      title: 'Reporte, contexto y cierre de incidentes.',
      copy: 'Registra novedades operativas, revisa prioridades y deja trazabilidad clara para que todo el staff pueda actuar rápido.',
      noteTitle: latestCritical ? latestCritical.title : `${stats.open} incidentes activos`,
      noteText: latestCritical ? `${latestCritical.location} - ${latestCritical.type}` : 'No hay incidentes críticos pendientes en este momento.',
    },
    announcements: {
      eyebrow: 'Avisos para el equipo',
      title: 'Comunicaciones breves y visibles.',
      copy: 'Publica cambios de agenda, instrucciones generales y recordatorios importantes con el mismo formato del chat del staff.',
      noteTitle: `${messages.length} avisos visibles`,
      noteText: 'Mantén este canal reservado para mensajes que todo el equipo necesita leer.',
    },
  }[channelId];

  return (
    <section className="command-overview" aria-label="Resumen operativo">
      <div className="hero-brief">
        <span className="eyebrow"><Activity size={15} /> {channelConfig.eyebrow}</span>
        <h2>{channelConfig.title}</h2>
        <p>{channelConfig.copy}</p>
        <div className="hero-actions">
          <span><Circle size={10} fill="currentColor" /> {stats.open} abiertos</span>
          <span><TrendingUp size={15} /> {stats.total} reportes totales</span>
          <span><BarChart3 size={15} /> {messages.length} mensajes en este canal</span>
        </div>
      </div>
      <div className="metric-grid">
        <MetricCard label="Incidencias" value={stats.total} tone="blue" />
        <MetricCard label="Activas" value={stats.open} tone="amber" />
        <MetricCard label="Críticas" value={stats.critical} tone="red" />
        <MetricCard label="Resueltas" value={stats.resolved} tone="green" />
      </div>
      <div className="charts-grid">
        <PriorityChart counts={stats.byPriority} total={Math.max(stats.total, 1)} />
        <TypeChart counts={stats.byType} total={Math.max(stats.total, 1)} />
      </div>
      <div className="ops-note">
        <strong>{channelConfig.noteTitle}</strong>
        <span>{channelConfig.noteText}</span>
      </div>
    </section>
  );
}

function MetricCard({ label, value, tone }) {
  return <article className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong></article>;
}

function PriorityChart({ counts, total }) {
  const priorities = [['critica', 'Crítica'], ['alta', 'Alta'], ['media', 'Media'], ['baja', 'Baja']];
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
      <h3>Incidencias por área</h3>
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
        <p>Ingrese su información para entrar al canal de comunicación operativo.</p>
        {demo && <div className="demo-banner">Modo demo. Al completar el .env usará Supabase en tiempo real.</div>}
        <TextInput label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} maxLength={FIELD_LIMITS.profile} required />
        <TextInput label="Rol o cargo" value={form.role} onChange={(role) => setForm({ ...form, role })} maxLength={FIELD_LIMITS.profile} required />
        <TextInput label="Comité o área" value={form.committee} onChange={(committee) => setForm({ ...form, committee })} maxLength={FIELD_LIMITS.profile} required />
        <button className="primary-button entry-submit">Entrar al canal</button>
      </form>
    </main>
  );
}

function MessageList({ messages, currentName }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);
  return (
    <div className="message-list">
      {messages.length === 0 && <div className="empty-chat">Todavía no hay mensajes en este canal.</div>}
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
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const cleanBody = sanitizePlainText(body, FIELD_LIMITS.message);
    if (!cleanBody || sending) return;
    setSending(true);
    setError('');
    try {
      await onSend(cleanBody);
      setBody('');
    } catch {
      setError('No se pudo enviar el mensaje. Inténtalo nuevamente.');
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <div className="composer-input">
        <textarea
          value={body}
          onChange={(event) => setBody(sanitizeEditableText(event.target.value, FIELD_LIMITS.message))}
          maxLength={FIELD_LIMITS.message}
          onKeyDown={handleKeyDown}
          placeholder={`Enviar mensaje a #${channelName}`}
          aria-label={`Enviar mensaje a ${channelName}`}
          rows={1}
        />
        {error && <span className="composer-error">{error}</span>}
      </div>
      <button className="send-button" title="Enviar" aria-label="Enviar mensaje" disabled={!body.trim() || sending}><Send size={18} /></button>
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
          <TextInput label="Título" value={form.title} onChange={(title) => setForm({ ...form, title })} maxLength={FIELD_LIMITS.incidentTitle} required />
          <label className="field"><span>Tipo</span><select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{incidentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label className="field"><span>Prioridad</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
          <TextInput label="Ubicación" value={form.location} onChange={(location) => setForm({ ...form, location })} maxLength={FIELD_LIMITS.incidentLocation} required />
          <label className="field"><span>Descripción</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: sanitizeEditableText(event.target.value, FIELD_LIMITS.incidentDescription) })} maxLength={FIELD_LIMITS.incidentDescription} required /></label>
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
            <option value="en_revision">En revisión</option>
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
          <button className="notification-close" onClick={() => onDismiss(notification.id)} aria-label="Cerrar notificación">x</button>
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
      const cleanProfile = sanitizeProfile(nextProfile);
      localStorage.setItem('monur_staff_profile', JSON.stringify(cleanProfile));
      setProfile(cleanProfile);
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

function TextInput({ label, value, onChange, type = 'text', required = false, maxLength = FIELD_LIMITS.profile }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(sanitizeEditableText(event.target.value, maxLength))}
        maxLength={maxLength}
        required={required}
      />
    </label>
  );
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

function sanitizePlainText(value, maxLength = 500) {
  return sanitizeEditableText(value, maxLength).replace(/\s+/g, ' ').trim();
}

function sanitizeEditableText(value, maxLength = 500) {
  return DOMPurify
    .sanitize(String(value ?? ''), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .slice(0, maxLength);
}

function sanitizeProfile(profile) {
  return {
    name: sanitizePlainText(profile.name, FIELD_LIMITS.profile),
    role: sanitizePlainText(profile.role, FIELD_LIMITS.profile),
    committee: sanitizePlainText(profile.committee, FIELD_LIMITS.profile),
  };
}

function sanitizeIncidentPayload(payload) {
  const cleanPayload = {
    title: sanitizePlainText(payload.title, FIELD_LIMITS.incidentTitle),
    type: incidentTypes.includes(payload.type) ? payload.type : 'Otro',
    priority: ['baja', 'media', 'alta', 'critica'].includes(payload.priority) ? payload.priority : 'media',
    location: sanitizePlainText(payload.location, FIELD_LIMITS.incidentLocation),
    description: sanitizePlainText(payload.description, FIELD_LIMITS.incidentDescription),
  };
  return cleanPayload.title && cleanPayload.location && cleanPayload.description ? cleanPayload : null;
}

function pushNotification(setNotifications, notification) {
  const nextNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...notification,
    title: sanitizePlainText(notification.title, 140),
    body: cleanPreview(sanitizePlainText(notification.body, 180)),
  };
  setNotifications((current) => [nextNotification, ...current].slice(0, 4));
  showBrowserNotification(nextNotification);
  window.setTimeout(() => {
    setNotifications((current) => current.filter((currentNotification) => currentNotification.id !== nextNotification.id));
  }, 6500);
}

function showBrowserNotification(notification) {
  if (!('Notification' in window)) return;
  const notify = () => {
    const browserNotification = new Notification(notification.title, {
      body: notification.body,
      tag: notification.channel,
      silent: false,
    });
    browserNotification.onclick = () => {
      window.focus();
      notification.onOpen?.();
      browserNotification.close();
    };
  };
  if (Notification.permission === 'granted') {
    notify();
  } else if (Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') notify();
    });
  }
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
