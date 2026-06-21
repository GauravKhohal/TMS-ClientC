'use client';
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getUser } from '@/lib/auth';

interface Message {
  id: string; channelId: string; userId: string; userName: string;
  role: string; text: string; timestamp: string; isDM?: boolean;
}
interface Channel { id: string; name: string; icon: string; description: string; tripId?: string; }
interface OnlineUser { userId: string; userName: string; role: string; }
interface UserInfo { id: string; name: string; email: string; role: string; }

const ROLE_COLORS: Record<string, string> = {
  'Super Admin': 'bg-purple-100 text-purple-700',
  'Fleet Manager': 'bg-blue-100 text-blue-700',
  'Dispatcher': 'bg-green-100 text-green-700',
  'Accountant': 'bg-orange-100 text-orange-700',
  'Viewer': 'bg-slate-100 text-slate-600',
};

function fmtTime(ts: string) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const colors = ['bg-blue-500','bg-green-500','bg-purple-500','bg-orange-500','bg-pink-500','bg-teal-500'];
  const color = colors[name.charCodeAt(0) % colors.length];
  const s = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return <div className={`${s} ${color} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}>{name.charAt(0).toUpperCase()}</div>;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:5001';

export default function ChatPage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [mounted, setMounted] = useState(false);
  const socketRef      = useRef<Socket | null>(null);
  const bottomRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);

  const [channels,     setChannels]     = useState<Channel[]>([]);
  const [tripChannels, setTripChannels] = useState<Channel[]>([]);
  const [allUsers,     setAllUsers]     = useState<UserInfo[]>([]);
  const [onlineUsers,  setOnlineUsers]  = useState<OnlineUser[]>([]);
  const [activeId,     setActiveId]     = useState('general');
  const [activeType,   setActiveType]   = useState<'channel' | 'dm'>('channel');
  const [messages,     setMessages]     = useState<Message[]>([]);
  const [text,         setText]         = useState('');
  const [connected,    setConnected]    = useState(false);
  const [search,       setSearch]       = useState('');

  // Resolve user from localStorage only on client
  useEffect(() => {
    setUser(getUser() as UserInfo | null);
    setMounted(true);
  }, []);

  // Fetch users list for DMs
  useEffect(() => {
    if (!mounted) return;
    fetch(`${API_BASE}/api/users`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('tms_token')}` }
    }).then(r => r.json()).then(setAllUsers).catch(() => {});
  }, [mounted]);

  // Socket connection
  useEffect(() => {
    if (!user) return;
    const socket = io(API_BASE, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('identify', { userId: user.id, userName: user.name, role: user.role });
      socket.emit('get_channels');
      socket.emit('get_history', { channelId: 'general' });
    });

    socket.on('disconnect', () => setConnected(false));

    socket.on('channels', ({ channels: ch, tripChannels: tc }) => {
      setChannels(ch);
      setTripChannels(tc);
    });

    socket.on('history', ({ channelId, messages: msgs }: { channelId: string; messages: Message[] }) => {
      if (channelId === activeIdRef.current) setMessages(msgs);
    });

    socket.on('new_message', (msg: Message) => {
      const key = activeIdRef.current;
      if (msg.channelId === key) {
        setMessages(prev => [...prev, msg]);
      }
    });

    socket.on('users_online', (u: OnlineUser[]) => setOnlineUsers(u));

    return () => { socket.disconnect(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep a ref to activeId for use inside socket callbacks
  const activeIdRef = useRef(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function openChannel(id: string, type: 'channel' | 'dm') {
    setActiveId(id);
    setActiveType(type);
    setMessages([]);
    const socket = socketRef.current;
    if (!socket) return;
    if (type === 'channel') {
      socket.emit('get_history', { channelId: id });
    } else {
      socket.emit('get_dm_history', { fromId: user?.id, toId: id });
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function sendMessage() {
    const socket = socketRef.current;
    if (!socket || !text.trim() || !user) return;
    if (activeType === 'channel') {
      socket.emit('send_message', {
        channelId: activeId, userId: user.id,
        userName: user.name, role: user.role, text,
      });
    } else {
      const toUser = allUsers.find(u => u.id === activeId);
      socket.emit('send_dm', {
        fromId: user.id, fromName: user.name, fromRole: user.role,
        toId: activeId, toName: toUser?.name || activeId, text,
      });
    }
    setText('');
    inputRef.current?.focus();
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  // Active channel/DM info
  const activeChannel = channels.find(c => c.id === activeId) || tripChannels.find(c => c.id === activeId);
  const activeDMUser  = allUsers.find(u => u.id === activeId);
  const activeTitle   = activeType === 'channel' ? (activeChannel?.name || activeId) : (activeDMUser?.name || activeId);
  const activeDesc    = activeType === 'channel' ? activeChannel?.description : activeDMUser?.role;

  const onlineIds = new Set(onlineUsers.map(u => u.userId));

  const filteredUsers = allUsers.filter(u =>
    u.id !== user?.id &&
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  // Group messages by date
  function dateLabel(ts: string) {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) return 'Today';
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  // Render messages grouped by sender + time proximity
  type MsgGroup = { userId: string; userName: string; role: string; messages: Message[]; dateLabel?: string; };
  const groups: MsgGroup[] = [];
  let lastDate = '';
  messages.forEach((msg, i) => {
    const dl = dateLabel(msg.timestamp);
    const prev = messages[i - 1];
    const sameAuthor = prev && prev.userId === msg.userId &&
      (new Date(msg.timestamp).getTime() - new Date(prev.timestamp).getTime()) < 5 * 60 * 1000;
    if (dl !== lastDate) {
      lastDate = dl;
      groups.push({ userId: msg.userId, userName: msg.userName, role: msg.role, messages: [msg], dateLabel: dl });
    } else if (sameAuthor && groups.length > 0) {
      groups[groups.length - 1].messages.push(msg);
    } else {
      groups.push({ userId: msg.userId, userName: msg.userName, role: msg.role, messages: [msg] });
    }
  });

  if (!mounted) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent" /></div>;
  if (!user) return <div className="flex items-center justify-center h-64 text-slate-400">Not logged in</div>;

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">

      {/* ── Left Panel: Channels & DMs ── */}
      <div className="w-64 flex-shrink-0 bg-slate-900 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold text-sm">Team Chat</h2>
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-slate-500'}`} title={connected ? 'Connected' : 'Connecting...'} />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search people..."
            className="w-full px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500" />
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* Channels */}
          <div className="px-3 mb-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1">Channels</p>
            {channels.map(ch => (
              <button key={ch.id} onClick={() => openChannel(ch.id, 'channel')}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all text-left mb-0.5 ${activeId === ch.id && activeType === 'channel' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                <span className="text-base leading-none">{ch.icon}</span>
                <span className="font-medium truncate">{ch.name}</span>
              </button>
            ))}
          </div>

          {/* Trip Discussions */}
          {tripChannels.length > 0 && (
            <div className="px-3 mb-1 mt-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1">Trip Discussions</p>
              {tripChannels.map(ch => (
                <button key={ch.id} onClick={() => openChannel(ch.id, 'channel')}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all text-left mb-0.5 ${activeId === ch.id && activeType === 'channel' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                  <span>{ch.icon}</span>
                  <span className="truncate">{ch.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Direct Messages */}
          <div className="px-3 mt-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mb-1">Direct Messages</p>
            {filteredUsers.map(u => (
              <button key={u.id} onClick={() => openChannel(u.id, 'dm')}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-all text-left mb-0.5 ${activeId === u.id && activeType === 'dm' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
                <div className="relative flex-shrink-0">
                  <Avatar name={u.name} size="sm" />
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${onlineIds.has(u.id) ? 'bg-green-400' : 'bg-slate-600'}`} />
                </div>
                <span className="truncate text-xs">{u.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Current user */}
        <div className="p-3 border-t border-slate-700 flex items-center gap-2">
          <div className="relative">
            <Avatar name={user.name} size="sm" />
            <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 bg-green-400" />
          </div>
          <div className="min-w-0">
            <div className="text-white text-xs font-medium truncate">{user.name}</div>
            <div className="text-slate-500 text-xs truncate">{user.role}</div>
          </div>
        </div>
      </div>

      {/* ── Right Panel: Messages ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Channel header */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-white">
          <div>
            <div className="flex items-center gap-2">
              {activeType === 'channel' ? (
                <span className="text-lg">{activeChannel?.icon || '💬'}</span>
              ) : (
                <div className="relative">
                  <Avatar name={activeTitle} size="sm" />
                  <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${activeDMUser && onlineIds.has(activeDMUser.id) ? 'bg-green-400' : 'bg-slate-300'}`} />
                </div>
              )}
              <h3 className="font-bold text-slate-800">{activeTitle}</h3>
              {activeType === 'dm' && activeDMUser && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[activeDMUser.role] || 'bg-slate-100 text-slate-600'}`}>{activeDMUser.role}</span>
              )}
            </div>
            {activeDesc && <p className="text-xs text-slate-400 mt-0.5">{activeDesc}</p>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-1">
              {onlineUsers.slice(0, 4).map(u => (
                <div key={u.userId} title={u.userName}>
                  <Avatar name={u.userName} size="sm" />
                </div>
              ))}
            </div>
            {onlineUsers.length > 0 && (
              <span className="text-xs text-slate-400">{onlineUsers.length} online</span>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-2">
              <div className="text-4xl">{activeType === 'channel' ? (activeChannel?.icon || '💬') : '💬'}</div>
              <p className="text-sm font-medium">
                {activeType === 'channel' ? `Start the conversation in #${activeTitle}` : `Start a direct message with ${activeTitle}`}
              </p>
              <p className="text-xs">Messages are saved and available to your team</p>
            </div>
          )}

          {groups.map((group, gi) => (
            <div key={gi}>
              {/* Date separator */}
              {group.dateLabel && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400 bg-white px-2 flex-shrink-0">{group.dateLabel}</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
              )}

              {/* Message group */}
              <div className="flex gap-3 hover:bg-slate-50 rounded-xl px-2 py-1 group transition-colors">
                <div className="flex-shrink-0 pt-0.5">
                  <Avatar name={group.userName} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-800">{group.userName}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${ROLE_COLORS[group.role] || 'bg-slate-100 text-slate-600'}`}>{group.role}</span>
                    <span className="text-xs text-slate-400">{fmtTime(group.messages[0].timestamp)}</span>
                  </div>
                  {group.messages.map((msg, mi) => (
                    <p key={msg.id} className={`text-sm text-slate-700 leading-relaxed ${mi > 0 ? 'mt-0.5' : ''}`}>
                      {msg.text.split(/(@\w+)/g).map((part, pi) =>
                        part.startsWith('@')
                          ? <span key={pi} className="text-blue-600 font-medium">{part}</span>
                          : part
                      )}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Message input */}
        <div className="px-5 py-3 border-t border-slate-100">
          <div className="flex items-center gap-3 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={handleKey}
              placeholder={activeType === 'channel' ? `Message #${activeTitle}…` : `Message ${activeTitle}…`}
              disabled={!connected}
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 focus:outline-none" />
            <button onClick={sendMessage} disabled={!text.trim() || !connected}
              className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 transition-colors">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1.5 px-1">Press Enter to send · All messages are saved</p>
        </div>
      </div>
    </div>
  );
}
