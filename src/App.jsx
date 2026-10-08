import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { BarChart3, Camera, Check, ChevronLeft, CircleAlert, ClipboardCheck, ClipboardList, LayoutDashboard, LogOut, MapPin, Plus, QrCode, ScanLine, UserRoundPlus, Users, X } from 'lucide-react';
import { verifyFace } from './biometrics';

const defaultParticipants = [
  { id: 'GL-0001', name: 'Ana Clara Souza', sector: 'Administrativo', shift: 'Administrativo', active: true },
  { id: 'GL-0002', name: 'Bruno Henrique Lima', sector: 'Administrativo', shift: 'Administrativo', active: true },
  { id: 'GL-0003', name: 'Carla Mendes', sector: 'Produção', shift: '1º turno', active: true },
  { id: 'GL-0004', name: 'Diego Santos', sector: 'Produção', shift: '1º turno', active: true },
  { id: 'GL-0005', name: 'Elisa Ferreira', sector: 'Produção', shift: '2º turno', active: true },
  { id: 'GL-0006', name: 'Felipe Rocha', sector: 'Produção', shift: '2º turno', active: true },
  { id: 'GL-0007', name: 'Gabriela Alves', sector: 'Logística', shift: '3º turno', active: true },
  { id: 'GL-0008', name: 'Hugo Martins', sector: 'Logística', shift: '3º turno', active: true },
];

const session = { id: 'aula-2026-10-08-0900', company: 'Empresa demonstração', place: 'Administrativo', teacher: 'Professor(a) GL', time: 'Hoje, 09:00' };
const storageKey = `sige-gl-attendance-${session.id}`;
const participantsKey = 'sige-gl-participants';
const loginKey = 'sige-gl-teacher';
const auditKey = 'sige-gl-audit-log';
const teachers = [
  { id: 'PROF-001', name: 'Mariana Costa' },
  { id: 'PROF-002', name: 'Rafael Lima' },
];
const classRecords = [
  { id: 'AULA-001', sector: 'Administrativo', shift: 'Administrativo', status: 'applied' },
  { id: 'AULA-002', sector: 'Produção', shift: '1º turno', status: 'applied' },
  { id: 'AULA-003', sector: 'Produção', shift: '1º turno', status: 'applied' },
  { id: 'AULA-004', sector: 'Produção', shift: '2º turno', status: 'applied' },
  { id: 'AULA-005', sector: 'Produção', shift: '2º turno', status: 'cancelled' },
  { id: 'AULA-006', sector: 'Logística', shift: '3º turno', status: 'applied' },
  { id: 'AULA-007', sector: 'Logística', shift: '3º turno', status: 'applied' },
];

function getStoredAttendance() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
}

function getStoredParticipants() {
  try {
    const stored = JSON.parse(localStorage.getItem(participantsKey));
    return Array.isArray(stored) && stored.length ? stored.map((participant) => ({ ...participant, shift: participant.shift || 'Administrativo' })) : defaultParticipants;
  } catch { return defaultParticipants; }
}

function statusLabel(status) {
  return { present: 'Presença confirmada', manual_review: 'Aguardando revisão facial', absent: 'Falta' }[status] || status;
}

function getStoredItem(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function rateText(present, total) {
  return total ? `${Math.round((present / total) * 100)}%` : '0%';
}

function QrScanner({ onResult, onClose }) {
  const handled = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader');
    const config = { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 };
    const found = async (decodedText) => {
      if (handled.current) return;
      handled.current = true;
      await scanner.stop().catch(() => {});
      onResult(decodedText);
    };
    const start = async () => {
      try {
        await scanner.start({ facingMode: { exact: 'environment' } }, config, found, () => {});
      } catch {
        try {
          const cameras = await Html5Qrcode.getCameras();
          if (!cameras.length) throw new Error('Nenhuma câmera foi encontrada.');
          const rear = cameras.find((camera) => /back|rear|traseira/i.test(camera.label)) || cameras[0];
          await scanner.start(rear.id, config, found, () => {});
        } catch (cameraError) {
          setError(cameraError.message || 'Não foi possível abrir a câmera. Permita o acesso à câmera no navegador e tente novamente.');
        }
      }
    };
    start();
    return () => scanner.stop().catch(() => {});
  }, [onResult]);
  return <Modal title="Ler QR Code" onClose={onClose}><p className="muted">A câmera traseira é aberta automaticamente. Aponte para o QR Code do participante.</p><div id="qr-reader" />{error && <p className="error">{error}</p>}</Modal>;
}

function FaceCapture({ participant, onClose, onCaptured }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador não oferece acesso à câmera. Use Chrome, Edge ou Safari atualizados.');
      return undefined;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((stream) => { streamRef.current = stream; if (videoRef.current) videoRef.current.srcObject = stream; })
      .catch(() => setError('Não foi possível acessar a câmera. Verifique a permissão do navegador.'));
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return setError('A câmera ainda está carregando.');
    setBusy(true); setError('');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      try { onCaptured(await verifyFace({ participantId: participant.id, sessionId: session.id, image: blob })); }
      catch (e) { setError(e.message); setBusy(false); }
    }, 'image/jpeg', 0.9);
  };

  return <Modal title="Validação facial" onClose={onClose}>
    <p className="muted">{participant.name}</p>
    <video className="camera" ref={videoRef} autoPlay playsInline muted />
    <p className="hint"><CircleAlert size={16} /> Olhe para a câmera, com o rosto bem iluminado e sem outra pessoa no enquadramento.</p>
    {error && <p className="error">{error}</p>}
    <button className="primary full" disabled={busy} onClick={capture}><Camera size={18} /> {busy ? 'Validando…' : 'Capturar e validar'}</button>
  </Modal>;
}

function Modal({ title, children, onClose }) {
  return <div className="overlay" role="dialog" aria-modal="true"><section className="modal"><header><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="Fechar"><X /></button></header>{children}</section></div>;
}

function ParticipantForm({ onClose, onSave }) {
  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [shift, setShift] = useState('Administrativo');
  const submit = (event) => {
    event.preventDefault();
    onSave({ id: `GL-${String(Date.now()).slice(-6)}`, name: name.trim(), sector: sector.trim(), shift, active: true });
  };
  return <Modal title="Novo participante" onClose={onClose}>
    <form className="form" onSubmit={submit}>
      <label>Nome completo<input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
      <label>Setor ou local de trabalho<input value={sector} onChange={(event) => setSector(event.target.value)} required /></label>
      <label>Turno<select value={shift} onChange={(event) => setShift(event.target.value)}><option>Administrativo</option><option>1º turno</option><option>2º turno</option><option>3º turno</option></select></label>
      <p className="hint"><CircleAlert size={16} /> O QR Code será criado automaticamente após o cadastro.</p>
      <button className="primary full" type="submit"><UserRoundPlus size={18} /> Cadastrar participante</button>
    </form>
  </Modal>;
}

function Login({ onLogin }) {
  const [teacherId, setTeacherId] = useState(teachers[0].id);
  const [password, setPassword] = useState('');
  const submit = (event) => {
    event.preventDefault();
    if (!password.trim()) return;
    onLogin(teachers.find((teacher) => teacher.id === teacherId));
  };
  return <main className="login-page"><section className="login-card"><div className="login-brand"><ClipboardCheck /><span><b>ElevaLife</b> · SIGE GL</span></div><p className="eyebrow">ACESSO DO PROFISSIONAL</p><h1>Inicie sua aula com segurança.</h1><p className="muted">A presença, horário e localização da aula ficam vinculados ao professor logado.</p><form className="form" onSubmit={submit}><label>Professor<select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.id}</option>)}</select></label><label>Senha<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite sua senha" required /></label><button className="primary full" type="submit">Entrar no SIGE GL</button></form><p className="login-note">Nesta versão independente, as credenciais são demonstrativas. A autenticação será conectada ao SIGE Ergo na integração.</p></section></main>;
}

function Dashboard({ participants, attendance }) {
  const present = (participant) => attendance[participant.id]?.status === 'present';
  const totalPresent = participants.filter(present).length;
  const missing = participants.filter((participant) => !present(participant));
  const groups = (field) => Object.entries(participants.reduce((result, participant) => {
    const key = participant[field];
    result[key] = result[key] || { name: key, total: 0, present: 0 };
    result[key].total += 1;
    if (present(participant)) result[key].present += 1;
    return result;
  }, {})).map(([, group]) => ({ ...group, missing: group.total - group.present }));
  const appliedClasses = classRecords.filter((item) => item.status === 'applied').length;
  const cancelledClasses = classRecords.filter((item) => item.status === 'cancelled').length;
  const classGroups = (field) => Object.entries(classRecords.reduce((result, item) => {
    const key = item[field];
    result[key] = result[key] || { name: key, planned: 0, applied: 0, cancelled: 0 };
    result[key].planned += 1;
    result[key][item.status] += 1;
    return result;
  }, {})).map(([, group]) => group);
  const GroupTable = ({ title, field }) => <section className="card report-card"><div className="card-heading"><h2>{title}</h2><p>Presentes, faltantes e taxa de adesão da aula atual.</p></div><div className="report-rows">{groups(field).map((group) => <div className="report-row" key={group.name}><strong>{group.name}</strong><span>{group.present} presentes · {group.missing} faltantes</span><div className="bar"><i style={{ width: `${group.total ? (group.present / group.total) * 100 : 0}%` }} /></div><b>{rateText(group.present, group.total)}</b></div>)}</div></section>;
  const ClassesTable = ({ title, field }) => <section className="card report-card"><div className="card-heading"><h2>{title}</h2><p>Taxa efetiva de aulas aplicadas e cancelamentos.</p></div><div className="report-rows">{classGroups(field).map((group) => <div className="report-row" key={group.name}><strong>{group.name}</strong><span>{group.applied} aplicadas · {group.cancelled} canceladas</span><div className="bar"><i style={{ width: `${group.planned ? (group.applied / group.planned) * 100 : 0}%` }} /></div><b>{rateText(group.applied, group.planned)}</b></div>)}</div></section>;
  return <section className="dashboard"><section className="heading"><div><p className="eyebrow">DASHBOARD DE ADESÃO</p><h1>Visão da aula</h1><p>Indicadores atualizados conforme a presença é registrada.</p></div></section><div className="metrics"><article><span>Participantes</span><strong>{participants.length}</strong><small>Lista prevista</small></article><article><span>Presentes</span><strong>{totalPresent}</strong><small>Presença confirmada</small></article><article><span>Faltantes</span><strong>{missing.length}</strong><small>Sem registro nesta aula</small></article><article className="accent"><span>Taxa de adesão</span><strong>{rateText(totalPresent, participants.length)}</strong><small>Meta mensal: 75%</small></article><article><span>Aulas aplicadas</span><strong>{rateText(appliedClasses, classRecords.length)}</strong><small>{appliedClasses}/{classRecords.length} · meta: 90%</small></article><article><span>Cancelamentos</span><strong>{cancelledClasses}</strong><small>{rateText(cancelledClasses, classRecords.length)} do cronograma</small></article></div><div className="report-grid"><GroupTable title="Adesão por setor" field="sector" /><GroupTable title="Adesão por turno" field="shift" /><ClassesTable title="Aulas aplicadas por setor" field="sector" /><ClassesTable title="Aulas aplicadas por turno" field="shift" /></div><section className="card missing-card"><div className="card-heading"><h2>Participantes sem registro</h2><p>Estas pessoas estão na lista da aula, mas ainda não tiveram presença confirmada.</p></div><div className="missing-list">{missing.length ? missing.map((participant) => <span key={participant.id}>{participant.name}<small>{participant.sector} · {participant.shift}</small></span>) : <p className="empty">Todos os participantes previstos foram registrados.</p>}</div></section></section>;
}

function AuditLog({ logs }) {
  return <section className="directory"><section className="heading"><div><p className="eyebrow">CONFERÊNCIA OPERACIONAL</p><h1>Log de aula</h1><p>Registros de início vinculados ao professor, data, horário e localização.</p></div></section><section className="card"><div className="card-heading"><h2>{logs.length} registros</h2><p>A localização é coletada somente quando o professor inicia a aula.</p></div><div className="audit-list">{logs.length ? logs.map((log) => <article key={log.id}><MapPin size={20} /><div><strong>{log.teacherName} · {log.teacherId}</strong><span>{new Date(log.at).toLocaleString('pt-BR')} · {log.event}</span><small>{log.location ? `${log.location.latitude}, ${log.location.longitude} · precisão ${Math.round(log.location.accuracy)} m` : 'Localização não capturada'}</small></div></article>) : <p className="empty">Nenhuma aula foi iniciada neste dispositivo.</p>}</div></section></section>;
}

export default function App() {
  const [participants, setParticipants] = useState(getStoredParticipants);
  const [attendance, setAttendance] = useState(getStoredAttendance);
  const [teacher, setTeacher] = useState(() => getStoredItem(loginKey, null));
  const [auditLogs, setAuditLogs] = useState(() => getStoredItem(auditKey, []));
  const [classStarted, setClassStarted] = useState(false);
  const [classLocation, setClassLocation] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [faceParticipant, setFaceParticipant] = useState(null);
  const [selectedQr, setSelectedQr] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const presentCount = useMemo(() => Object.values(attendance).filter((item) => item.status === 'present').length, [attendance]);

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(attendance)), [attendance]);
  useEffect(() => localStorage.setItem(participantsKey, JSON.stringify(participants)), [participants]);
  useEffect(() => localStorage.setItem(auditKey, JSON.stringify(auditLogs)), [auditLogs]);

  const login = (selectedTeacher) => {
    setTeacher(selectedTeacher);
    localStorage.setItem(loginKey, JSON.stringify(selectedTeacher));
  };
  const logout = () => {
    localStorage.removeItem(loginKey);
    setTeacher(null);
  };
  const startClass = () => {
    if (!navigator.geolocation) {
      setNotice('Este navegador não oferece geolocalização. Abra pelo navegador do celular e permita a localização.');
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      const location = { latitude: position.coords.latitude.toFixed(5), longitude: position.coords.longitude.toFixed(5), accuracy: position.coords.accuracy };
      const log = { id: crypto.randomUUID(), event: `Início da aula ${session.id}`, at: new Date().toISOString(), teacherId: teacher.id, teacherName: teacher.name, location };
      setClassLocation(location);
      setAuditLogs((current) => [log, ...current]);
      setClassStarted(true);
      setNotice('Aula iniciada com horário e localização registrados.');
    }, () => setNotice('A localização é necessária para iniciar a aula. Verifique a permissão do navegador e tente novamente.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  };

  const resolveParticipant = (value) => {
    const id = value.startsWith('SIGEGL:') ? value.slice(7) : value.trim();
    return participants.find((p) => p.id === id);
  };
  const scanned = (value) => {
    setScannerOpen(false);
    const participant = resolveParticipant(value);
    if (!participant) return setNotice('QR Code inválido ou participante não cadastrado nesta aula.');
    setFaceParticipant(participant);
  };
  const applyFaceResult = (result) => {
    const participant = faceParticipant;
    setFaceParticipant(null);
    if (result.status === 'manual_required') {
      setNotice(`${participant.name}: ${result.message}`);
      return;
    }
    const status = result.status === 'approved' ? 'present' : 'manual_review';
    setAttendance((current) => ({ ...current, [participant.id]: { status, method: 'qr_face', at: new Date().toISOString(), teacherId: teacher.id, location: classLocation } }));
    setNotice(status === 'present' ? `${participant.name}: presença confirmada.` : `${participant.name}: captura registrada para revisão manual.`);
  };
  const markPresent = (participant) => setAttendance((current) => ({ ...current, [participant.id]: { status: 'present', method: 'manual', at: new Date().toISOString(), teacherId: teacher.id, location: classLocation } }));
  const addParticipant = (participant) => {
    setParticipants((current) => [...current, participant]);
    setFormOpen(false);
    setNotice(`${participant.name} foi cadastrado. O QR Code já está disponível.`);
  };

  if (!teacher) return <Login onLogin={login} />;

  return <main>
    <nav><div className="brand"><ClipboardCheck /> <span><b>ElevaLife</b> <em>· SIGE GL</em></span></div><div className="user-nav"><span className="offline"><span /> Dados salvos neste dispositivo</span><span className="teacher-name">{teacher.name} · {teacher.id}</span><button onClick={logout} title="Sair"><LogOut size={17} /></button></div></nav>
    <div className="container">
      <div className="app-tabs"><button className={page === 'dashboard' ? 'active' : ''} onClick={() => setPage('dashboard')}><BarChart3 size={17} /> Dashboard</button><button className={page === 'attendance' ? 'active' : ''} onClick={() => setPage('attendance')}><LayoutDashboard size={17} /> Coleta da aula</button><button className={page === 'participants' ? 'active' : ''} onClick={() => setPage('participants')}><Users size={17} /> Participantes</button><button className={page === 'audit' ? 'active' : ''} onClick={() => setPage('audit')}><ClipboardList size={17} /> Logs</button></div>
      {notice && <div className="notice"><Check size={18} /> {notice}<button onClick={() => setNotice('')}><X size={16} /></button></div>}
      {page === 'dashboard' ? <Dashboard participants={participants} attendance={attendance} /> : page === 'audit' ? <AuditLog logs={auditLogs} /> : page === 'attendance' ? <>
        <button className="back"><ChevronLeft size={18} /> Aulas</button>
        <section className="heading"><div><p className="eyebrow">COLETA DE ADESÃO</p><h1>{session.place}</h1><p>{session.company} · {session.time} · {teacher.name}</p></div><div className="counter"><Users size={21} /><strong>{presentCount}/{participants.length}</strong><span>presentes</span></div></section>
        <section className="checkin"><MapPin size={20} /><div><strong>{classStarted ? 'Aula iniciada e auditada' : 'Inicie a aula no local'}</strong><span>{classStarted ? `Localização registrada: ${classLocation.latitude}, ${classLocation.longitude}` : 'O sistema registra professor, data, hora e geolocalização.'}</span></div>{!classStarted && <button className="primary" onClick={startClass}>Registrar início</button>}</section>
        <section className="actions"><button className="primary" disabled={!classStarted} onClick={() => setScannerOpen(true)}><ScanLine /> Ler QR Code</button><button className="secondary" onClick={() => setFormOpen(true)}><UserRoundPlus /> Novo participante</button></section>
        <section className="card"><div className="card-heading"><div><h2>Participantes previstos</h2><p>Leia o QR e valide o rosto, ou marque manualmente.</p></div></div>
          <div className="participants">{participants.map((participant) => {
          const entry = attendance[participant.id];
          return <article className="participant" key={participant.id}><div className="avatar">{participant.name.split(' ').map((name) => name[0]).slice(0, 2).join('')}</div><div className="person"><strong>{participant.name}</strong><span>{participant.id} · {participant.sector} · {participant.shift}</span></div>{entry ? <span className={`badge ${entry.status}`}>{statusLabel(entry.status)}</span> : <div className="row-actions"><button onClick={() => setSelectedQr(participant)} aria-label="Ver QR Code"><QrCode size={19} /></button><button disabled={!classStarted} className="check-button" onClick={() => markPresent(participant)} aria-label="Marcar presença"><Check size={19} /></button></div>}</article>;
          })}</div>
        </section>
        <section className="privacy"><CircleAlert size={18} /><div><strong>Privacidade biométrica</strong><p>As imagens são enviadas ao provedor biométrico somente para a validação e não ficam guardadas neste aplicativo.</p></div></section>
      </> : <section className="directory"><div className="heading"><div><p className="eyebrow">CADASTRO</p><h1>Participantes</h1><p>Cadastre as pessoas que podem participar das aulas de GL.</p></div><button className="primary" onClick={() => setFormOpen(true)}><Plus size={18} /> Adicionar</button></div><section className="card"><div className="card-heading"><div><h2>{participants.length} participantes ativos</h2><p>O QR Code identifica somente o código interno de cada participante.</p></div></div><div className="participants">{participants.map((participant) => <article className="participant" key={participant.id}><div className="avatar">{participant.name.split(' ').map((name) => name[0]).slice(0, 2).join('')}</div><div className="person"><strong>{participant.name}</strong><span>{participant.id} · {participant.sector} · {participant.shift}</span></div><button className="qr-action" onClick={() => setSelectedQr(participant)}><QrCode size={18} /> QR Code</button></article>)}</div></section></section>}
    </div>
    {scannerOpen && <QrScanner onResult={scanned} onClose={() => setScannerOpen(false)} />}
    {faceParticipant && <FaceCapture participant={faceParticipant} onCaptured={applyFaceResult} onClose={() => setFaceParticipant(null)} />}
    {formOpen && <ParticipantForm onSave={addParticipant} onClose={() => setFormOpen(false)} />}
    {selectedQr && <Modal title="QR Code do participante" onClose={() => setSelectedQr(null)}><div className="qr-modal"><QRCodeSVG value={`SIGEGL:${selectedQr.id}`} size={260} includeMargin /><h3>{selectedQr.name}</h3><p>{selectedQr.id}</p></div></Modal>}
  </main>;
}
