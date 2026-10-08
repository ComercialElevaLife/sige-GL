import { useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { QRCodeSVG } from 'qrcode.react';
import { Camera, Check, ChevronLeft, CircleAlert, ClipboardCheck, LayoutDashboard, Plus, QrCode, ScanLine, UserRoundPlus, Users, X } from 'lucide-react';
import { verifyFace } from './biometrics';

const defaultParticipants = [
  { id: 'GL-0001', name: 'Ana Clara Souza', sector: 'Administrativo', active: true },
  { id: 'GL-0002', name: 'Bruno Henrique Lima', sector: 'Administrativo', active: true },
  { id: 'GL-0003', name: 'Carla Mendes', sector: 'Produção', active: true },
  { id: 'GL-0004', name: 'Diego Santos', sector: 'Produção', active: true },
  { id: 'GL-0005', name: 'Elisa Ferreira', sector: 'Logística', active: true },
];

const session = { id: 'aula-2026-10-08-0900', company: 'Empresa demonstração', place: 'Administrativo', teacher: 'Professor(a) GL', time: 'Hoje, 09:00' };
const storageKey = `sige-gl-attendance-${session.id}`;
const participantsKey = 'sige-gl-participants';

function getStoredAttendance() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { return {}; }
}

function getStoredParticipants() {
  try {
    const stored = JSON.parse(localStorage.getItem(participantsKey));
    return Array.isArray(stored) && stored.length ? stored : defaultParticipants;
  } catch { return defaultParticipants; }
}

function statusLabel(status) {
  return { present: 'Presença confirmada', manual_review: 'Aguardando revisão facial', absent: 'Falta' }[status] || status;
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
  const submit = (event) => {
    event.preventDefault();
    onSave({ id: `GL-${String(Date.now()).slice(-6)}`, name: name.trim(), sector: sector.trim(), active: true });
  };
  return <Modal title="Novo participante" onClose={onClose}>
    <form className="form" onSubmit={submit}>
      <label>Nome completo<input value={name} onChange={(event) => setName(event.target.value)} required autoFocus /></label>
      <label>Setor ou local de trabalho<input value={sector} onChange={(event) => setSector(event.target.value)} required /></label>
      <p className="hint"><CircleAlert size={16} /> O QR Code será criado automaticamente após o cadastro.</p>
      <button className="primary full" type="submit"><UserRoundPlus size={18} /> Cadastrar participante</button>
    </form>
  </Modal>;
}

export default function App() {
  const [participants, setParticipants] = useState(getStoredParticipants);
  const [attendance, setAttendance] = useState(getStoredAttendance);
  const [page, setPage] = useState('attendance');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [faceParticipant, setFaceParticipant] = useState(null);
  const [selectedQr, setSelectedQr] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const presentCount = useMemo(() => Object.values(attendance).filter((item) => item.status === 'present').length, [attendance]);

  useEffect(() => localStorage.setItem(storageKey, JSON.stringify(attendance)), [attendance]);
  useEffect(() => localStorage.setItem(participantsKey, JSON.stringify(participants)), [participants]);

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
    setAttendance((current) => ({ ...current, [participant.id]: { status, method: 'qr_face', at: new Date().toISOString() } }));
    setNotice(status === 'present' ? `${participant.name}: presença confirmada.` : `${participant.name}: captura registrada para revisão manual.`);
  };
  const markPresent = (participant) => setAttendance((current) => ({ ...current, [participant.id]: { status: 'present', method: 'manual', at: new Date().toISOString() } }));
  const addParticipant = (participant) => {
    setParticipants((current) => [...current, participant]);
    setFormOpen(false);
    setNotice(`${participant.name} foi cadastrado. O QR Code já está disponível.`);
  };

  return <main>
    <nav><div className="brand"><ClipboardCheck /> <span>SIGE <b>GL</b></span></div><span className="offline"><span /> Dados salvos neste dispositivo</span></nav>
    <div className="container">
      <div className="app-tabs"><button className={page === 'attendance' ? 'active' : ''} onClick={() => setPage('attendance')}><LayoutDashboard size={17} /> Coleta da aula</button><button className={page === 'participants' ? 'active' : ''} onClick={() => setPage('participants')}><Users size={17} /> Participantes</button></div>
      {notice && <div className="notice"><Check size={18} /> {notice}<button onClick={() => setNotice('')}><X size={16} /></button></div>}
      {page === 'attendance' ? <>
        <button className="back"><ChevronLeft size={18} /> Aulas</button>
        <section className="heading"><div><p className="eyebrow">COLETA DE ADESÃO</p><h1>{session.place}</h1><p>{session.company} · {session.time} · {session.teacher}</p></div><div className="counter"><Users size={21} /><strong>{presentCount}/{participants.length}</strong><span>presentes</span></div></section>
        <section className="actions"><button className="primary" onClick={() => setScannerOpen(true)}><ScanLine /> Ler QR Code</button><button className="secondary" onClick={() => setFormOpen(true)}><UserRoundPlus /> Novo participante</button></section>
        <section className="card"><div className="card-heading"><div><h2>Participantes previstos</h2><p>Leia o QR e valide o rosto, ou marque manualmente.</p></div></div>
          <div className="participants">{participants.map((participant) => {
          const entry = attendance[participant.id];
          return <article className="participant" key={participant.id}><div className="avatar">{participant.name.split(' ').map((name) => name[0]).slice(0, 2).join('')}</div><div className="person"><strong>{participant.name}</strong><span>{participant.id} · {participant.sector}</span></div>{entry ? <span className={`badge ${entry.status}`}>{statusLabel(entry.status)}</span> : <div className="row-actions"><button onClick={() => setSelectedQr(participant)} aria-label="Ver QR Code"><QrCode size={19} /></button><button className="check-button" onClick={() => markPresent(participant)} aria-label="Marcar presença"><Check size={19} /></button></div>}</article>;
          })}</div>
        </section>
        <section className="privacy"><CircleAlert size={18} /><div><strong>Privacidade biométrica</strong><p>As imagens são enviadas ao provedor biométrico somente para a validação e não ficam guardadas neste aplicativo.</p></div></section>
      </> : <section className="directory"><div className="heading"><div><p className="eyebrow">CADASTRO</p><h1>Participantes</h1><p>Cadastre as pessoas que podem participar das aulas de GL.</p></div><button className="primary" onClick={() => setFormOpen(true)}><Plus size={18} /> Adicionar</button></div><section className="card"><div className="card-heading"><div><h2>{participants.length} participantes ativos</h2><p>O QR Code identifica somente o código interno de cada participante.</p></div></div><div className="participants">{participants.map((participant) => <article className="participant" key={participant.id}><div className="avatar">{participant.name.split(' ').map((name) => name[0]).slice(0, 2).join('')}</div><div className="person"><strong>{participant.name}</strong><span>{participant.id} · {participant.sector}</span></div><button className="qr-action" onClick={() => setSelectedQr(participant)}><QrCode size={18} /> QR Code</button></article>)}</div></section></section>}
    </div>
    {scannerOpen && <QrScanner onResult={scanned} onClose={() => setScannerOpen(false)} />}
    {faceParticipant && <FaceCapture participant={faceParticipant} onCaptured={applyFaceResult} onClose={() => setFaceParticipant(null)} />}
    {formOpen && <ParticipantForm onSave={addParticipant} onClose={() => setFormOpen(false)} />}
    {selectedQr && <Modal title="QR Code do participante" onClose={() => setSelectedQr(null)}><div className="qr-modal"><QRCodeSVG value={`SIGEGL:${selectedQr.id}`} size={260} includeMargin /><h3>{selectedQr.name}</h3><p>{selectedQr.id}</p></div></Modal>}
  </main>;
}
