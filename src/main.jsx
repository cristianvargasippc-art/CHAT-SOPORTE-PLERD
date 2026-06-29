import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Circle,
  ClipboardList,
  Hash,
  LogOut,
  Megaphone,
  Send,
  ShieldCheck,
  UserRound,
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

const incidentTypes = [
  'Logística',
  'Seguridad',
  'Delegación',
  'Protocolo',
  'Tecnología',
  'Salud',
  'Otro',
];

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
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'staff_messages',
          filter: `channel=eq.${activeChannel}`,
        },
        (payload) => setMessages((current) => [...current, payload.new])
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeChannel]);

  useEffect(() => {
    loadIncidents().then(setIncidents);

    const channel = supabase
      .channel('monur-incidents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        () => loadIncidents().then(setIncidents)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  useEffect(() => {
    if (!profile.ready) return undefined;

    const channel = supabase
      .channel('monur-message-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'staff_messages' },
        (payload) => {
          const message = payload.new;
          if (message.staff_name === profile.name) return;

          pushNotification(setNotifications, {
            channel: message.channel,
            title: `${message.staff_name} escribió en #${getChannelName(message.channel)}`,
            body: message.body,
            onOpen: () => setActiveChannel(message.channel),
          });
        }
      )
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
      .insert({
        ...payload,
        reporter_name: profile.name,
        reporter_role: profile.role,
        committee: profile.committee,
      })
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
      onDismissNotification={(id) =>
        setNotifications((current) => current.filter((notification) => notification.id !== id))
      }
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
  ]);

  function sendMessage(body) {
    setMessages((current) => [
      ...current,
      {
        id: `demo-message-${Date.now()}`,
        channel: activeChannel,
        body,
        staff_name: profile.name,
        staff_role: profile.role,
        committee: profile.committee,
        created_at: new Date().toISOString(),
      },
    ]);
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
    setMessages((current) => [
      ...current,
      {
        id: `demo-message-${Date.now()}`,
        channel: 'incidents',
        body: `Incidente reportado: ${incident.title}. Prioridad ${incident.priority}.`,
        staff_name: profile.name,
        staff_role: profile.role,
        committee: profile.committee,
        created_at: new Date().toISOString(),
      },
    ]);
    pushNotification(setNotifications, {
      channel: 'incidents',
      title: `Incidente publicado en #${getChannelName('incidents')}`,
      body: incident.title,
      onOpen: () => setActiveChannel('incidents'),
    });
  }

  function updateIncidentStatus(id, status) {
    setIncidents((current) =>
      current.map((incident) => (incident.id === id ? { ...incident, status } : incident))
    );
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
      onDismissNotification={(id) =>
        setNotifications((current) => current.filter((notification) => notification.id !== id))
      }
      demo
    />
  );
}

function Workspace({
  profile,
  activeChannel,
  setActiveChannel,
  messages,
  incidents,
  onSend,
  onCreateIncident,
  onUpdateIncidentStatus,
  notifications = [],
  onDismissNotification,
  demo = false,
}) {
  const active = channels.find((channel) => channel.id === activeChannel);

  return (
    <main className="workspace">
      <aside className="server-panel">
        <div className="server-brand">
          <ShieldCheck size={30} />
          <div>
            <strong>MONUR XVIII</strong>
            <span>Centro de mando</span>
          </div>
        </div>

        <nav className="channel-list" aria-label="Canales">
          {channels.map((channel) => (
            <button
              key={channel.id}
              className={activeChannel === channel.id ? 'channel active' : 'channel'}
              onClick={() => setActiveChannel(channel.id)}
            >
              <Hash size={18} />
              <span>{channel.name}</span>
            </button>
          ))}
        </nav>

        <div className="profile-box">
          <div className="avatar">{initials(profile.name)}</div>
          <div>
            <strong>{profile.name}</strong>
            <span>{profile.role} · {profile.committee}</span>
          </div>
          <button className="icon-button" onClick={profile.clear} title="Salir del perfil">
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div>
            <h1><Hash size={22} /> {active.title}</h1>
            <p>{active.description}</p>
          </div>
          {demo && <span className="mode-pill">Demo sin Supabase</span>}
        </header>

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

function StaffEntry({ onSave, demo = false }) {
  const [form, setForm] = useState({
    name: '',
    role: '',
    committee: '',
  });

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
        <TextInput label="Nombre" value={form.name} onChange={(name) => setForm({ ...form, name })} required />
        <TextInput label="Rol o cargo" value={form.role} onChange={(role) => setForm({ ...form, role })} required />
        <TextInput label="Comité o área" value={form.committee} onChange={(committee) => setForm({ ...form, committee })} required />
        <button className="primary-button">Entrar al canal</button>
      </form>
    </main>
  );
}

function MessageList({ messages, currentName }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="message-list">
      {messages.map((message) => (
        <article
          key={message.id}
          className={message.staff_name === currentName ? 'staff-message mine' : 'staff-message'}
        >
          <div className="message-avatar">{initials(message.staff_name)}</div>
          <div className="message-content">
            <header>
              <strong>{message.staff_name}</strong>
              <span>{message.staff_role} · {message.committee}</span>
              <time>{formatDateTime(message.created_at)}</time>
            </header>
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
      <input
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={`Enviar mensaje a #${channelName}`}
      />
      <button className="send-button" title="Enviar">
        <Send size={18} />
      </button>
    </form>
  );
}

function IncidentForm({ onCreate }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    type: incidentTypes[0],
    priority: 'media',
    location: '',
    description: '',
  });

  function submit(event) {
    event.preventDefault();
    onCreate(form);
    setForm({
      title: '',
      type: incidentTypes[0],
      priority: 'media',
      location: '',
      description: '',
    });
    setOpen(false);
  }

  return (
    <section className="incident-card">
      <button className="incident-toggle" onClick={() => setOpen((value) => !value)}>
        <AlertTriangle size={18} />
        Reportar incidente
      </button>

      {open && (
        <form className="incident-form" onSubmit={submit}>
          <TextInput label="Título" value={form.title} onChange={(title) => setForm({ ...form, title })} required />
          <label className="field">
            <span>Tipo</span>
            <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
              {incidentTypes.map((type) => <option key={type}>{type}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Prioridad</span>
            <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
              <option value="baja">Baja</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </select>
          </label>
          <TextInput label="Ubicación" value={form.location} onChange={(location) => setForm({ ...form, location })} required />
          <label className="field">
            <span>Descripción</span>
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
          </label>
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
          <div className="incident-top">
            <strong>{incident.title}</strong>
            <span>{incident.priority}</span>
          </div>
          <p>{incident.description}</p>
          <small>{incident.type} · {incident.location}</small>
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
            <span className="notification-channel">
              <Megaphone size={15} />
              #{getChannelName(notification.channel)}
            </span>
            <strong>{notification.title}</strong>
            <span>{notification.body}</span>
          </button>
          <button
            className="notification-close"
            onClick={() => onDismiss(notification.id)}
            aria-label="Cerrar notificación"
          >
            ×
          </button>
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
  const { data } = await supabase
    .from('staff_messages')
    .select('*')
    .eq('channel', channel)
    .order('created_at', { ascending: true })
    .limit(300);
  return data || [];
}

async function loadIncidents() {
  const { data } = await supabase
    .from('incidents')
    .select('*')
    .order('created_at', { ascending: false });
  return data || [];
}

function TextInput({ label, value, onChange, type = 'text', required = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
    </label>
  );
}

function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'ST';
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat('es-DO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getChannelName(channelId) {
  return channelById[channelId]?.name || channelId;
}

function cleanPreview(value) {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function pushNotification(setNotifications, notification) {
  const nextNotification = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...notification,
    body: cleanPreview(notification.body || ''),
  };

  setNotifications((current) => [nextNotification, ...current].slice(0, 4));
  window.setTimeout(() => {
    setNotifications((current) =>
      current.filter((currentNotification) => currentNotification.id !== nextNotification.id)
    );
  }, 6500);
}

createRoot(document.getElementById('root')).render(<App />);
