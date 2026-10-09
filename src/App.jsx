import { useEffect, useMemo, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { QRCodeSVG } from "qrcode.react";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Building2,
  Camera,
  Check,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  FileSpreadsheet,
  LogOut,
  MapPin,
  Plus,
  QrCode,
  ScanLine,
  Trash2,
  Pencil,
  UserRoundPlus,
  Users,
  Upload,
  X,
} from "lucide-react";
import { verifyFace } from "./biometrics";
import { generateDashboardReport } from "./report";
import { plannedClassesForMonth, weekdays } from "./scheduling";
import {
  centralActivate,
  centralBootstrap,
  centralCreateUser,
  centralDeleteUser,
  centralLogin,
  centralRequestReset,
  centralResetPassword,
  centralReinviteUser,
  centralSync,
  centralUpdateUser,
  centralUsers,
} from "./api";

const K = {
  users: "gl-users",
  clients: "gl-clients",
  units: "gl-units",
  sectors: "gl-sectors",
  locations: "gl-locations",
  workShifts: "gl-work-shifts",
  routines: "gl-routines",
  schedules: "gl-schedules",
  people: "gl-people",
  classes: "gl-classes",
  attendance: "gl-attendance",
  audit: "gl-audit",
  auth: "gl-auth",
  token: "gl-token",
  outbox: "gl-outbox",
};
const roles = {
  admin: "Administrador",
  professor: "Professor",
  client: "Cliente",
};
const shifts = ["Administrativo", "1º turno", "2º turno", "3º turno"];
const scaleOptions = ["Sem escala definida", "5x2", "5x3", "6x1", "12x36", "Escala de letras", "Outra"];
const inactiveReasons = ["Férias", "Desligamento", "Afastamento", "Outro"];
const cancelReasons = {
  client: [
    "Ausência de pessoal no setor",
    "Treinamento",
    "Reunião",
    "Solicitada pelo responsável da área",
  ],
  eleva: ["Ausência do professor"],
};
const seed = {
  clients: [{ id: "C-1", name: "LIBBS" }],
  units: [{ id: "U-1", clientId: "C-1", name: "Unidade Farmacêutica" }],
  sectors: [
    { id: "S-1", unitId: "U-1", name: "Administrativo" },
    { id: "S-2", unitId: "U-1", name: "Produção" },
    { id: "S-3", unitId: "U-1", name: "Logística" },
  ],
  locations: [
    { id: "L-1", unitId: "U-1", name: "Sala de treinamento" },
    { id: "L-2", unitId: "U-1", name: "Área de produção" },
    { id: "L-3", unitId: "U-1", name: "Área de expedição" },
  ],
  workShifts: [
    { id: "T-1", clientId: "C-1", name: "Administrativo", start: "08:00", end: "17:00", scale: "5x2" },
    { id: "T-2", clientId: "C-1", name: "1º turno", start: "06:00", end: "14:00", scale: "6x1" },
    { id: "T-3", clientId: "C-1", name: "2º turno", start: "14:00", end: "22:00", scale: "6x1" },
    { id: "T-4", clientId: "C-1", name: "3º turno", start: "22:00", end: "06:00", scale: "6x1" },
  ],
  routines: [
    { id: "R-1", name: "Alongamento e mobilidade" },
    { id: "R-2", name: "Postura e conscientização corporal" },
    { id: "R-3", name: "Relaxamento e respiração" },
    { id: "R-4", name: "Fortalecimento leve" },
  ],
  people: [
    ["P-1", "Ana Clara Souza", "M-1001", "S-1", "L-1", "Administrativo"],
    ["P-2", "Bruno Henrique Lima", "M-1002", "S-1", "L-1", "Administrativo"],
    ["P-3", "Carla Mendes", "M-1003", "S-2", "L-2", "1º turno"],
    ["P-4", "Diego Santos", "M-1004", "S-2", "L-2", "1º turno"],
    ["P-5", "Elisa Ferreira", "M-1005", "S-2", "L-2", "2º turno"],
    ["P-6", "Felipe Rocha", "M-1006", "S-2", "L-2", "2º turno"],
    ["P-7", "Gabriela Alves", "M-1007", "S-3", "L-3", "3º turno"],
    ["P-8", "Hugo Martins", "M-1008", "S-3", "L-3", "3º turno"],
  ].map(([id, name, registration, sectorId, locationId, shift]) => ({
    id,
    name,
    registration,
    document: "",
    active: true,
    clientId: "C-1",
    unitId: "U-1",
    sectorId,
    locationId,
    shift,
  })),
  users: [
    {
      id: "A-1",
      name: "Administrador Eleva",
      email: "admin@elevalife.com.br",
      password: "eleva123",
      role: "admin",
    },
    {
      id: "PR-1",
      name: "Mariana Costa",
      email: "mariana@elevalife.com.br",
      password: "eleva123",
      role: "professor",
      clientId: "C-1",
      unitId: "U-1",
    },
    {
      id: "CL-1",
      name: "Gestor LIBBS",
      email: "gestor@libbs.com.br",
      password: "eleva123",
      role: "client",
      clientId: "C-1",
      unitId: "U-1",
    },
  ],
  schedules: [
    { id: "PL-1", clientId: "C-1", unitId: "U-1", sectorId: "S-1", locationId: "L-1", shift: "Administrativo", weekday: 1, time: "09:00" },
    { id: "PL-2", clientId: "C-1", unitId: "U-1", sectorId: "S-1", locationId: "L-1", shift: "Administrativo", weekday: 3, time: "09:00" },
    { id: "PL-3", clientId: "C-1", unitId: "U-1", sectorId: "S-2", locationId: "L-2", shift: "1º turno", weekday: 2, time: "06:30" },
    { id: "PL-4", clientId: "C-1", unitId: "U-1", sectorId: "S-2", locationId: "L-2", shift: "2º turno", weekday: 4, time: "14:00" },
  ],
};
function demoScenario() {
  const companies = [
    {
      id: "C-DEMO-1", name: "Aurum Alimentos", unit: "Unidade Paulista",
      sectorNames: ["Administrativo", "Operação"], locationNames: ["Auditório", "Área de produção"],
      people: ["Anitta", "Lázaro Ramos", "Taís Araújo", "Wagner Moura", "Fernanda Torres", "Seu Jorge", "Ingrid Guimarães", "Juliette Freire", "Cauã Reymond", "Iza"],
      weekdays: [1, 3, 5], times: ["08:00", "14:00", "17:30"],
    },
    {
      id: "C-DEMO-2", name: "Horizonte Logística", unit: "Centro de Distribuição Guarulhos",
      sectorNames: ["Expedição", "Armazenagem"], locationNames: ["Pátio logístico", "Sala operacional"],
      people: ["Paulo Vieira", "Alice Braga", "Rodrigo Santoro", "Dira Paes", "Emicida", "Sabrina Sato", "Daniel Kaluuya", "Viola Davis", "Lupita Nyong'o", "Zendaya"],
      weekdays: [2, 4, 5], times: ["06:30", "13:30", "21:00"],
    },
    {
      id: "C-DEMO-3", name: "Vértice Tecnologia", unit: "Campus Vila Olímpia",
      sectorNames: ["Produto e Tecnologia", "Atendimento"], locationNames: ["Hub de inovação", "Sala de convivência"],
      people: ["Selton Mello", "Débora Nascimento", "Marcos Palmeira", "Adriana Esteves", "Fábio Porchat", "Linn da Quebrada", "Lázaro Ramos Filho", "Rihanna", "Pedro Pascal", "Lupita Amondi"],
      weekdays: [1, 2, 4, 5], times: ["09:30", "12:30", "16:30", "18:00"],
    },
  ];
  const result = { clients: [], units: [], sectors: [], locations: [], workShifts: [], people: [], schedules: [], classes: [], attendance: {}, audit: [] };
  companies.forEach((company, companyIndex) => {
    const unitId = `U-DEMO-${companyIndex + 1}`;
    const sectorIds = [`S-DEMO-${companyIndex + 1}-1`, `S-DEMO-${companyIndex + 1}-2`];
    const locationIds = [`L-DEMO-${companyIndex + 1}-1`, `L-DEMO-${companyIndex + 1}-2`];
    result.clients.push({ id: company.id, name: company.name });
    result.workShifts.push({ id: `T-DEMO-${companyIndex + 1}-1`, clientId: company.id, name: "Administrativo", start: "08:00", end: "17:00", scale: "5x2" });
    result.workShifts.push({ id: `T-DEMO-${companyIndex + 1}-2`, clientId: company.id, name: "Operacional", start: "06:00", end: "14:00", scale: "6x1" });
    result.units.push({ id: unitId, clientId: company.id, name: company.unit });
    company.sectorNames.forEach((name, index) => result.sectors.push({ id: sectorIds[index], unitId, name }));
    company.locationNames.forEach((name, index) => result.locations.push({ id: locationIds[index], unitId, name }));
    company.people.forEach((name, index) => {
      const personId = `P-DEMO-${companyIndex + 1}-${index + 1}`;
      const status = index < 7 ? "present" : index < 9 ? "absent" : "missing";
      const sectorIndex = index % 2;
      result.people.push({
        id: personId, name, registration: `DEM${companyIndex + 1}${String(index + 1).padStart(3, "0")}`,
        document: "", clientId: company.id, unitId, sectorId: sectorIds[sectorIndex],
        locationId: locationIds[sectorIndex], shift: shifts[index % shifts.length],
      });
      result.attendance[personId] = {
        status, method: index < 7 ? (index % 2 ? "qr_face" : "manual") : "manual",
        at: new Date(Date.now() - (index + companyIndex) * 86400000).toISOString(),
        teacherId: "PR-1", sectorId: sectorIds[sectorIndex], locationId: locationIds[sectorIndex],
        shift: shifts[index % shifts.length], roteiro: "Alongamento e mobilidade",
      };
    });
    company.weekdays.forEach((weekday, index) => result.schedules.push({
      id: `PL-DEMO-${companyIndex + 1}-${index + 1}`, clientId: company.id, unitId,
      sectorId: sectorIds[index % 2], locationId: locationIds[index % 2],
      shift: shifts[index % shifts.length], weekday, time: company.times[index],
    }));
    Array.from({ length: companyIndex === 2 ? 10 : 8 }, (_, index) => {
      const applied = index % 5 !== 4;
      const sectorIndex = index % 2;
      const at = new Date(Date.now() - (index * 2 + companyIndex) * 86400000).toISOString();
      const id = `AULA-DEMO-${companyIndex + 1}-${index + 1}`;
      const certificate = `GL-DEMO${companyIndex + 1}${String(index + 1).padStart(2, "0")}-VALIDADO`;
      result.classes.push({
        id, clientId: company.id, unitId, sectorId: sectorIds[sectorIndex], locationId: locationIds[sectorIndex],
        shift: shifts[index % shifts.length], roteiro: "Alongamento e mobilidade", status: applied ? "applied" : "cancelled",
        cancelledBy: applied ? undefined : (index % 2 ? "client" : "eleva"),
        reason: applied ? undefined : (index % 2 ? cancelReasons.client[index % cancelReasons.client.length] : cancelReasons.eleva[0]),
        at, teacherId: "PR-1", representativeRegistration: applied ? `RESP${companyIndex + 1}${index + 1}` : undefined,
        certificate: applied ? certificate : undefined,
      });
      result.audit.push({
        id: `LOG-DEMO-${companyIndex + 1}-${index + 1}`, event: applied ? "Aula encerrada e validada pelo representante" : "Aula cancelada",
        teacherId: "PR-1", teacherName: "Mariana Costa", at,
        location: { latitude: "-23.55052", longitude: "-46.63331", accuracy: 18 },
        representativeRegistration: applied ? `RESP${companyIndex + 1}${index + 1}` : undefined, certificate: applied ? certificate : undefined,
      });
    });
  });
  return result;
}
const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const newid = (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const nameOf = (list, id) => list.find((x) => x.id === id)?.name || "—";
const personLabel = (person) => person.name?.trim() || `Colaborador ${person.registration || "sem identificação"}`;
const rate = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "0%");
const clientIdsFor = (user) => {
  if (user.role === "admin") return [];
  if (user.role === "professor")
    return user.clientIds?.length
      ? user.clientIds
      : user.clientId
        ? [user.clientId]
        : [];
  return user.clientId ? [user.clientId] : [];
};
const normalizeUser = (user) => {
  if (user.role === "admin") {
    const { clientId, clientIds, unitId, ...admin } = user;
    return admin;
  }
  if (user.role === "professor") {
    const { clientId, ...professor } = user;
    return { ...professor, clientIds: [...new Set(user.clientIds || (clientId ? [clientId] : []))] };
  }
  const { clientIds, ...client } = user;
  return { ...client, clientId: user.clientId || user.clientIds?.[0] || "" };
};
const userCompaniesLabel = (user, clients) => {
  if (user.role === "admin") return "Sem empresa vinculada";
  const names = clientIdsFor(user).map((id) => nameOf(clients, id)).filter((name) => name !== "—");
  return names.join(", ") || "Empresa não definida";
};
const certificateFor = async (payload) => {
  const source = JSON.stringify(payload);
  if (crypto?.subtle && window.TextEncoder) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    const hash = [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, "0")).join("").toUpperCase();
    return `GL-${hash.slice(0, 8)}-${hash.slice(8, 16)}-${hash.slice(16, 24)}`;
  }
  return `GL-${btoa(source).replace(/[^A-Z0-9]/gi, "").slice(0, 24).toUpperCase()}`;
};

function Modal({ title, onClose, children }) {
  return (
    <div className="overlay">
      <section className="modal">
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose}>
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Login({ users, onLogin, onCentralLogin, onActivate, onRequestReset, onResetPassword, setUsers }) {
  const accessLink = new URLSearchParams(window.location.search),
    invitation = accessLink.get("invite"),
    resetToken = accessLink.get("reset"),
    linkedPassword = Boolean(invitation || resetToken);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [mode, setMode] = useState(linkedPassword ? "first" : "login"),
    [message, setMessage] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (navigator.onLine) {
      try {
        const session = await onCentralLogin(email, password);
        if (session) return;
      } catch (remoteError) {
        setError(remoteError.message);
        return;
      }
    }
    const user = users.find(
      (x) =>
        x.email.toLowerCase() === email.toLowerCase() &&
        x.password === password,
    );
    if (!user) return setError("E-mail ou senha inválidos.");
    onLogin(user);
  };
  const firstAccess = async (e) => {
    e.preventDefault();
    if (linkedPassword) {
      try {
        if (invitation) await onActivate(invitation, password);
        else await onResetPassword(resetToken, password);
        window.history.replaceState({}, "", window.location.pathname);
        setMessage("Senha definida. Entre com o seu e-mail.");
        setMode("login");
        setPassword("");
      } catch (remoteError) {
        setError(remoteError.message);
      }
      return;
    }
    const user = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (!user) return setError("Não localizamos este e-mail.");
    if (password.length < 8) return setError("Crie uma senha com pelo menos 8 caracteres.");
    setUsers((current) => current.map((x) => x.id === user.id ? {
      ...x,
      password,
      activationStatus: "active",
      activatedAt: new Date().toISOString(),
    } : x));
    setError("");
    setMessage("Senha criada. Entre com seu e-mail e a nova senha.");
    setMode("login");
    setPassword("");
  };
  const resetPassword = async (e) => {
    e.preventDefault();
    if (navigator.onLine) {
      try {
        await onRequestReset(email);
        setError("");
        setMessage("Se o e-mail estiver cadastrado, você receberá as instruções.");
      } catch (remoteError) {
        setError(remoteError.message);
      }
      return;
    }
    const user = users.find((x) => x.email.toLowerCase() === email.toLowerCase());
    if (user) setUsers((current) => current.map((x) => x.id === user.id ? {
      ...x,
      resetRequestedAt: new Date().toISOString(),
    } : x));
    setError("");
    setMessage("Solicitação registrada. As instruções serão entregues quando o serviço de e-mail estiver configurado.");
  };
  const action = mode === "first" ? firstAccess : mode === "reset" ? resetPassword : submit;
  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <ClipboardCheck />
          <span>
            <b>ElevaLife</b> · SIGE GL
          </span>
        </div>
        <p className="eyebrow">ACESSO SEGURO</p>
        <h1>{mode === "login" ? "Gestão de Ginástica Laboral." : mode === "first" ? (resetToken ? "Redefina sua senha." : "Crie sua senha.") : "Redefina sua senha."}</h1>
        <p className="muted">
          {mode === "login" ? "Acesso por perfil de administrador, professor ou cliente." : mode === "first" ? "Defina uma senha segura para continuar." : "Informe seu e-mail para receber as instruções."}
        </p>
        <form className="form" onSubmit={action}>
          {!linkedPassword && <label>
            E-mail
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>}
          {mode !== "reset" && <label>
            {mode === "first" ? "Nova senha" : "Senha"}
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required={mode !== "reset"}
            />
          </label>}
          {error && <p className="error">{error}</p>}
          {message && <p className="notice">{message}</p>}
          <button className="primary full">{mode === "login" ? "Entrar" : mode === "first" ? "Definir senha" : "Enviar instruções"}</button>
        </form>
        <div className="login-links">
          {mode !== "login" && <button onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Voltar para entrar</button>}
          {mode === "login" && <><button onClick={() => { setMode("first"); setError(""); setMessage(""); }}>Primeiro acesso</button><button onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Esqueci minha senha</button></>}
        </div>
        {mode === "login" && <p className="login-note">Use o e-mail e a senha definidos para o seu acesso.</p>}
      </section>
    </main>
  );
}

function Scanner({ onRead, onClose, onIssue, onManual }) {
  const used = useRef(false),
    [error, setError] = useState("");
  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader"),
      ok = async (value) => {
        if (used.current) return;
        used.current = true;
        await scanner.stop().catch(() => {});
        onRead(value);
      };
    (async () => {
      try {
        await scanner.start(
          { facingMode: { exact: "environment" } },
          { fps: 10, qrbox: 240 },
          ok,
          () => {},
        );
      } catch {
        try {
          const cameras = await Html5Qrcode.getCameras();
          await scanner.start(
            cameras[0].id,
            { fps: 10, qrbox: 240 },
            ok,
            () => {},
          );
        } catch {
          setError("Permita o acesso à câmera para ler o QR Code.");
          onIssue?.();
        }
      }
    })();
    return () => scanner.stop().catch(() => {});
  }, [onRead]);
  return (
    <Modal title="Ler QR Code" onClose={onClose}>
      <p className="muted">A câmera traseira é aberta automaticamente.</p>
      <div id="qr-reader" />
      {error && <p className="error">{error}</p>}
      <button className="secondary full" onClick={onManual}>
        Não conseguiu ler? Usar lançamento manual
      </button>
    </Modal>
  );
}
function Face({ person, onDone, onClose }) {
  const video = useRef(),
    stream = useRef(),
    [error, setError] = useState("");
  useEffect(() => {
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" } })
      .then((s) => {
        stream.current = s;
        video.current.srcObject = s;
      })
      .catch(() => setError("Não foi possível abrir a câmera frontal."));
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, []);
  const capture = () => {
    if (!video.current?.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d").drawImage(video.current, 0, 0);
    canvas.toBlob(async (image) => {
      try {
        onDone(
          await verifyFace({
            participantId: person.id,
            sessionId: "aula",
            image,
          }),
        );
      } catch (e) {
        setError(e.message);
      }
    }, "image/jpeg");
  };
  return (
    <Modal title="Validação facial" onClose={onClose}>
      <p className="muted">{person.name}</p>
      <video className="camera" ref={video} autoPlay playsInline muted />
      {error && <p className="error">{error}</p>}
      <button className="primary full" onClick={capture}>
        <Camera size={17} /> Capturar e validar
      </button>
    </Modal>
  );
}

function Filters({
  value,
  setValue,
  clients,
  units,
  sectors,
  locations,
  scopeIds = [],
}) {
  const isRestricted = scopeIds.length > 0;
  return (
    <section className="filters card">
      <select
        value={value.clientId}
        disabled={scopeIds.length === 1}
        onChange={(e) =>
          setValue({
            ...value,
            clientId: e.target.value,
            unitId: "",
            sectorId: "",
            locationId: "",
          })
        }
      >
        <option value="">Todos os clientes</option>
        {clients
          .filter((x) => !isRestricted || scopeIds.includes(x.id))
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
      </select>
      <select
        value={value.unitId}
        onChange={(e) =>
          setValue({
            ...value,
            unitId: e.target.value,
            sectorId: "",
            locationId: "",
          })
        }
      >
        <option value="">Todas as unidades</option>
        {units
          .filter(
            (x) =>
              (!isRestricted || scopeIds.includes(x.clientId)) &&
              (!value.clientId || x.clientId === value.clientId),
          )
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
      </select>
      <select
        value={value.sectorId}
        onChange={(e) => setValue({ ...value, sectorId: e.target.value })}
      >
        <option value="">Todos os setores</option>
        {sectors
          .filter((x) => !value.unitId || x.unitId === value.unitId)
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
      </select>
      <select
        value={value.shift}
        onChange={(e) => setValue({ ...value, shift: e.target.value })}
      >
        <option value="">Todos os turnos</option>
        {shifts.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <select
        value={value.locationId}
        onChange={(e) => setValue({ ...value, locationId: e.target.value })}
      >
        <option value="">Todos os locais</option>
        {locations
          .filter((x) => !value.unitId || x.unitId === value.unitId)
          .map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
      </select>
    </section>
  );
}

function Dashboard({ data, schedules, classes, attendance, user }) {
  const permittedClientIds = clientIdsFor(user);
  const [filter, setFilter] = useState({
      clientId: user.role === "client" ? permittedClientIds[0] || "" : "",
      unitId: "",
      sectorId: "",
      shift: "",
      locationId: "",
    }),
    [detail, setDetail] = useState(null);
  const people = data.people.filter(
    (x) =>
      (user.role === "admin" || permittedClientIds.includes(x.clientId)) &&
      (!filter.clientId || x.clientId === filter.clientId) &&
      (!filter.unitId || x.unitId === filter.unitId) &&
      (!filter.sectorId || x.sectorId === filter.sectorId) &&
      (!filter.shift || x.shift === filter.shift) &&
      (!filter.locationId || x.locationId === filter.locationId) && x.active !== false,
  );
  const done = people.filter((x) => attendance[x.id]?.status === "present"),
    missing = people.filter((x) => attendance[x.id]?.status !== "present");
  const related = classes.filter(
    (x) =>
      (user.role === "admin" || permittedClientIds.includes(x.clientId)) &&
      (!filter.clientId || x.clientId === filter.clientId) &&
      (!filter.unitId || x.unitId === filter.unitId) &&
      (!filter.sectorId || x.sectorId === filter.sectorId) &&
      (!filter.shift || x.shift === filter.shift) &&
      (!filter.locationId || x.locationId === filter.locationId),
  );
  const applied = related.filter((x) => x.status === "applied").length,
    cancelled = related.filter((x) => x.status === "cancelled").length;
  const planned = plannedClassesForMonth(schedules, {
    clientId: user.role === "client" ? permittedClientIds[0] : filter.clientId,
    unitId: filter.unitId,
    sectorId: filter.sectorId,
    shift: filter.shift,
    locationId: filter.locationId,
  });
  const adherence = people.length ? (done.length / people.length) * 100 : 0;
  const appliedRate = planned ? (applied / planned) * 100 : 0;
  const downloadPdf = () => {
    try {
      generateDashboardReport({
        data,
        people,
        classes: related,
        attendance,
        filter,
        planned,
      });
    } catch (error) {
      window.alert("Não foi possível gerar o PDF. Atualize a página e tente novamente.");
    }
  };
  const groups = (field, list, label) =>
    Object.values(
      people.reduce((out, x) => {
        const k = x[field];
        out[k] ??= { key: k, label: label(k), total: 0, present: 0 };
        out[k].total++;
        if (attendance[x.id]?.status === "present") out[k].present++;
        return out;
      }, {}),
    );
  const Group = ({ field, label, title }) => (
    <section className="card report-card">
      <div className="card-heading">
        <h2>{title}</h2>
        <p>Clique em uma linha para ver o detalhamento.</p>
      </div>
      <div className="report-rows">
        {groups(field, people, label).map((g) => (
          <button
            className="report-row interactive"
            key={g.key}
            onClick={() =>
              setDetail({
                title: g.label,
                people: people.filter((x) => x[field] === g.key),
              })
            }
          >
            <strong>{g.label}</strong>
            <span>
              {g.present} presentes · {g.total - g.present} faltantes
            </span>
            <div className="bar">
              <i
                style={{
                  width: `${g.total ? (g.present / g.total) * 100 : 0}%`,
                }}
              />
            </div>
            <b>{rate(g.present, g.total)}</b>
          </button>
        ))}
      </div>
    </section>
  );
  return (
    <section className="dashboard">
      <section className="heading">
        <div>
          <p className="eyebrow">DASHBOARD DE INDICADORES</p>
          <h1>Adesão da Ginástica Laboral</h1>
          <p>Filtros por cliente, unidade, setor, turno e local de aula.</p>
        </div>
        <button className="primary dashboard-download" onClick={downloadPdf}>
          <FileText size={18} /> Relatório em PDF
        </button>
      </section>
      <Filters
        value={filter}
        setValue={setFilter}
        clients={data.clients}
        units={data.units}
        sectors={data.sectors}
        locations={data.locations}
        scopeIds={permittedClientIds}
      />
      <div className="metrics">
        <article>
          <span>Participantes</span>
          <strong>{people.length}</strong>
          <small>Lista prevista</small>
        </article>
        <article>
          <span>Presentes</span>
          <strong>{done.length}</strong>
          <small>Presença confirmada</small>
        </article>
        <article>
          <span>Faltantes</span>
          <strong>{missing.length}</strong>
          <small>Sem registro</small>
        </article>
        <article className="accent">
          <span>Taxa de adesão</span>
          <strong>{rate(done.length, people.length)}</strong>
          <small>Meta: 75%</small>
        </article>
        <article>
          <span>Aulas aplicadas</span>
          <strong>{rate(applied, planned)}</strong>
          <small>
            {applied}/{planned} previstas · meta: 90%
          </small>
        </article>
        <article>
          <span>Cancelamentos</span>
          <strong>{cancelled}</strong>
          <small>{rate(cancelled, planned)} das aulas previstas</small>
        </article>
      </div>
      <div className="report-grid">
        <Group
          title="Adesão geral por empresa"
          field="clientId"
          label={(id) => nameOf(data.clients, id)}
        />
        <Group
          title="Adesão por unidade"
          field="unitId"
          label={(id) => nameOf(data.units, id)}
        />
        <Group
          title="Adesão por setor"
          field="sectorId"
          label={(id) => nameOf(data.sectors, id)}
        />
        <Group title="Adesão por turno" field="shift" label={(x) => x} />
        <section className="card analytics-summary">
          <div className="card-heading">
            <h2>Leitura executiva</h2>
            <p>Metas mensais e situação operacional.</p>
          </div>
          <div className="analytics-body">
            <div
              className="donut"
              style={{ "--value": `${adherence}%` }}
              aria-label={`Taxa de adesão de ${Math.round(adherence)}%`}
            >
              <strong>{Math.round(adherence)}%</strong>
              <span>adesão</span>
            </div>
            <div className="insight-list">
              <p>
                <span className={adherence >= 75 ? "ok-dot" : "warn-dot"} />
                Meta de adesão: <b>75%</b> · atual: <b>{rate(done.length, people.length)}</b>
              </p>
              <p>
                <span className={appliedRate >= 90 ? "ok-dot" : "warn-dot"} />
                Meta de aulas aplicadas: <b>90%</b> · atual: <b>{rate(applied, planned)}</b>
              </p>
              <p>
                <span className="wine-dot" />
                Cancelamentos no recorte: <b>{cancelled}</b>
              </p>
            </div>
          </div>
        </section>
      </div>
      <section className="card missing-card">
        <div className="card-heading">
          <h2>Participantes sem registro</h2>
          <p>Estão na lista, mas não tiveram presença confirmada.</p>
        </div>
        <div className="missing-list">
          {missing.map((x) => (
            <span key={x.id}>
              {x.name}
              <small>
                {nameOf(data.sectors, x.sectorId)} · {x.shift}
              </small>
            </span>
          ))}
        </div>
      </section>
      {detail && (
        <Modal
          title={`Detalhamento: ${detail.title}`}
          onClose={() => setDetail(null)}
        >
          <div className="participants">
            {detail.people.map((x) => (
              <article className="participant" key={x.id}>
                <div className="avatar">{personLabel(x)[0]}</div>
                <div className="person">
                  <strong>{personLabel(x)}</strong>
                  <span>{x.registration}</span>
                </div>
                <span
                  className={`badge ${attendance[x.id]?.status === "present" ? "present" : "manual_review"}`}
                >
                  {attendance[x.id]?.status === "present"
                    ? "Presente"
                    : "Sem registro"}
                </span>
              </article>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
}

function ExcelImport({ data, setData, setUsers, token, centralReady }) {
  const models = {
    clients: { label: "Empresas e unidades", headers: ["Empresa", "Unidade"], example: { Empresa: "Empresa Exemplo", Unidade: "Unidade Central" } },
    locations: { label: "Locais de aula", headers: ["Empresa", "Unidade", "Local da aula"], example: { Empresa: "Empresa Exemplo", Unidade: "Unidade Central", "Local da aula": "Auditório" } },
    people: { label: "Colaboradores", headers: ["Nome", "Matrícula ou CPF", "Empresa", "Unidade", "Setor", "Local da aula", "Turno"], example: { Nome: "Maria Silva", "Matrícula ou CPF": "12345", Empresa: "Empresa Exemplo", Unidade: "Unidade Central", Setor: "Administrativo", "Local da aula": "Auditório", Turno: "Administrativo" } },
    professors: { label: "Professores", headers: ["Nome", "E-mail", "Empresas"], example: { Nome: "Nome do professor", "E-mail": "professor@exemplo.com", Empresas: "Empresa Exemplo" } },
  };
  const [type, setType] = useState("people"), [preview, setPreview] = useState(null), [message, setMessage] = useState("");
  const normalize = (value) => String(value || "").trim().toLocaleLowerCase("pt-BR");
  const cell = (row, name) => row[Object.keys(row).find((key) => normalize(key) === normalize(name))] ?? "";
  const template = () => {
    const model = models[type]; const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([model.example], { header: model.headers }), "Importação");
    XLSX.writeFile(book, `modelo-sige-gl-${type}.xlsx`);
  };
  const analyze = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: "" });
    const checked = rows.map((row, index) => {
      const company = data.clients.find((item) => normalize(item.name) === normalize(cell(row, "Empresa")));
      const unit = data.units.find((item) => item.clientId === company?.id && normalize(item.name) === normalize(cell(row, "Unidade")));
      const sector = data.sectors.find((item) => item.unitId === unit?.id && normalize(item.name) === normalize(cell(row, "Setor")));
      const location = data.locations.find((item) => item.unitId === unit?.id && normalize(item.name) === normalize(cell(row, "Local da aula")));
      let error = "";
      if (type === "clients" && !cell(row, "Empresa")) error = "Empresa é obrigatória.";
      if (type === "locations" && (!company || !unit || !cell(row, "Local da aula"))) error = "Empresa, unidade ou local não localizado.";
      if (type === "people" && (!cell(row, "Matrícula ou CPF") || !company || !unit || !sector || !location || !cell(row, "Turno"))) error = "Confira matrícula/CPF, empresa, unidade, setor, local e turno.";
      if (type === "professors" && (!cell(row, "Nome") || !cell(row, "E-mail") || !cell(row, "Empresas"))) error = "Nome, e-mail e empresas são obrigatórios.";
      return { row, index: index + 2, error, company, unit, sector, location };
    });
    setPreview({ rows: checked, file: file.name }); event.target.value = "";
  };
  const apply = async () => {
    const valid = preview.rows.filter((item) => !item.error); if (!valid.length) return;
    const next = { ...data, clients: [...data.clients], units: [...data.units], locations: [...data.locations], people: [...data.people] };
    const findClient = (name) => next.clients.find((item) => normalize(item.name) === normalize(name));
    valid.forEach((item) => {
      const row = item.row;
      if (type === "clients") { let client = findClient(cell(row, "Empresa")); if (!client) { client = { id: newid("CLI"), name: String(cell(row, "Empresa")).trim() }; next.clients.push(client); } if (cell(row, "Unidade") && !next.units.some((unit) => unit.clientId === client.id && normalize(unit.name) === normalize(cell(row, "Unidade")))) next.units.push({ id: newid("UNI"), clientId: client.id, name: String(cell(row, "Unidade")).trim() }); }
      if (type === "locations") next.locations.push({ id: newid("LOC"), clientId: item.company.id, unitId: item.unit.id, name: String(cell(row, "Local da aula")).trim() });
      if (type === "people") next.people.push({ id: newid("PES"), name: String(cell(row, "Nome")).trim(), registration: String(cell(row, "Matrícula ou CPF")).trim(), document: "", active: true, clientId: item.company.id, unitId: item.unit.id, sectorId: item.sector.id, locationId: item.location.id, shift: String(cell(row, "Turno")).trim() });
    });
    if (type === "professors") {
      if (!centralReady || !token) return setMessage("Conecte-se à internet como administrador para importar professores.");
      const imported = await Promise.all(valid.map(async (item) => {
        const ids = String(cell(item.row, "Empresas")).split(";").map((name) => data.clients.find((client) => normalize(client.name) === normalize(name))?.id).filter(Boolean);
        return centralCreateUser(token, { name: String(cell(item.row, "Nome")).trim(), email: String(cell(item.row, "E-mail")).trim(), role: "professor", clientIds: ids });
      }));
      setUsers((current) => [...current, ...imported.map((item) => normalizeUser(item.user))]);
    } else setData(next);
    setMessage(`${valid.length} registro(s) importado(s) com sucesso.`); setPreview(null);
  };
  return <section className="directory"><section className="heading"><div><p className="eyebrow">IMPORTAÇÃO ASSISTIDA</p><h1>Importar planilha</h1><p>Baixe o modelo, preencha e confira todos os dados antes de gravar.</p></div></section><section className="card" style={{ padding: 22 }}><div className="form"><label>O que deseja importar?<select value={type} onChange={(e) => { setType(e.target.value); setPreview(null); }}>{Object.entries(models).map(([key, model]) => <option key={key} value={key}>{model.label}</option>)}</select></label><button className="secondary" onClick={template}><Download size={17}/> Baixar modelo</button><label>Escolha a planilha preenchida<input type="file" accept=".xlsx,.xls,.csv" onChange={analyze}/></label></div>{message && <p className="notice">{message}</p>}</section>{preview && <Modal title="Conferir importação" onClose={() => setPreview(null)}><p className="muted">Arquivo: {preview.file}. Linhas verdes serão importadas; linhas com aviso ficam de fora.</p><div className="participants">{preview.rows.map((item) => <article className="participant" key={item.index}><div className="avatar">{item.index}</div><div className="person"><strong>{item.error ? "Revisar linha" : "Pronta para importar"}</strong><span>{item.error || Object.values(item.row).filter(Boolean).join(" · ")}</span></div></article>)}</div><button className="primary full" onClick={apply}><Upload size={17}/> Importar linhas corretas</button></Modal>}</section>;
}

function ShiftSettings({ data, setData }) {
  const [clientId, setClientId] = useState(data.clients[0]?.id || "");
  const [form, setForm] = useState({ name: "Administrativo", start: "08:00", end: "17:00", scale: "5x2" });
  const items = data.workShifts.filter((item) => item.clientId === clientId);
  const save = (event) => { event.preventDefault(); if (!form.name.trim()) return; setData((current) => ({ ...current, workShifts: [...current.workShifts, { id: newid("TUR"), clientId, ...form, name: form.name.trim() }] })); };
  return <section className="directory"><section className="heading"><div><p className="eyebrow">JORNADAS E ESCALAS</p><h1>Turnos e horários</h1><p>Cadastre os turnos reais de cada cliente. Você pode criar quantos forem necessários.</p></div></section><section className="planning-grid"><section className="card planning-form"><h2>Novo turno</h2><form className="form" onSubmit={save}><label>Cliente / empresa<select value={clientId} onChange={(e) => setClientId(e.target.value)}>{data.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Nome do turno<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Administrativo, A, 1º turno" /></label><div className="planning-inline"><label>Início<input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></label><label>Fim<input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label></div><label>Escala<select value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })}>{scaleOptions.map((item) => <option key={item}>{item}</option>)}</select></label><button className="primary full"><Plus size={17}/> Adicionar turno</button></form></section><section className="card"><div className="card-heading"><h2>Turnos cadastrados</h2><p>Use esta lista para a coleta e o planejamento de aulas.</p></div><div className="schedule-list">{items.map((item) => <article key={item.id}><div><strong>{item.name} · {item.start}–{item.end}</strong><span>Escala: {item.scale}</span></div><button className="danger-button" onClick={() => setData((current) => ({ ...current, workShifts: current.workShifts.filter((shift) => shift.id !== item.id) }))}><Trash2 size={17}/></button></article>)}{!items.length && <p className="empty">Nenhum turno cadastrado para este cliente.</p>}</div></section></section></section>;
}

function Registry({ kind, data, setData }) {
  const [open, setOpen] = useState(false),
    [editingId, setEditingId] = useState(null),
    [form, setForm] = useState({
      name: "",
      registration: "",
      clientId: data.clients[0]?.id || "",
      unitId: data.units[0]?.id || "",
      sectorId: data.sectors[0]?.id || "",
      locationId: data.locations[0]?.id || "",
      shift: shifts[0],
      active: true,
      inactiveReason: inactiveReasons[0],
    });
  const title = {
    clients: "Clientes",
    units: "Unidades",
    sectors: "Setores",
    locations: "Locais de aula",
    routines: "Roteiros de aula",
    people: "Colaboradores",
  }[kind];
  const blank = () => ({
    name: "", registration: "", clientId: data.clients[0]?.id || "",
    unitId: data.units[0]?.id || "", sectorId: data.sectors[0]?.id || "",
    locationId: data.locations[0]?.id || "", shift: shifts[0], active: true, inactiveReason: inactiveReasons[0],
  });
  const openCreate = () => {
    setEditingId(null);
    setForm(blank());
    setOpen(true);
  };
  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({ ...blank(), ...item });
    setOpen(true);
  };
  const create = (e) => {
    e.preventDefault();
    let item = { id: editingId || newid(kind.slice(0, 2).toUpperCase()), name: form.name };
    if (kind === "units" || kind === "people") item.clientId = form.clientId;
    if (kind === "sectors" || kind === "locations" || kind === "people")
      item.unitId = form.unitId;
    if (kind === "people")
      item = {
        ...item,
        registration: form.registration,
        document: "",
        sectorId: form.sectorId,
        locationId: form.locationId,
        shift: form.shift,
        active: form.active,
        inactiveReason: form.active ? "" : form.inactiveReason,
      };
    setData((d) => ({ ...d, [kind]: editingId
      ? d[kind].map((current) => current.id === editingId ? item : current)
      : [...d[kind], item] }));
    setOpen(false);
  };
  return (
    <section className="directory">
      <section className="heading">
        <div>
          <p className="eyebrow">CADASTRO MESTRE</p>
          <h1>{title}</h1>
          <p>Cadastre e mantenha a estrutura da operação.</p>
        </div>
        <button className="primary" onClick={openCreate}>
          <Plus size={17} /> Adicionar
        </button>
      </section>
      <section className="card">
        <div className="participants">
          {data[kind].map((x) => (
            <article className="participant" key={x.id}>
              <div className="avatar">{personLabel(x)[0]}</div>
              <div className="person">
                <strong>{personLabel(x)}</strong>
                <span>
                  {kind === "people"
                    ? `${x.registration} · ${nameOf(data.sectors, x.sectorId)} · ${x.shift} · ${x.active === false ? `Inativo: ${x.inactiveReason || "sem motivo"}` : "Ativo"}`
                    : x.id}
                </span>
              </div>
              <button className="row-edit" onClick={() => openEdit(x)} aria-label={`Editar ${x.name}`}>
                <Pencil size={16} />
              </button>
              <button
                className="danger-button"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    [kind]: d[kind].filter((y) => y.id !== x.id),
                  }))
                }
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      </section>
      {open && (
        <Modal
          title={editingId ? `Editar ${title.slice(0, -1).toLowerCase()}` : `Cadastrar ${title.slice(0, -1).toLowerCase()}`}
          onClose={() => setOpen(false)}
        >
          <form className="form" onSubmit={create}>
            <label>
              Nome
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            {kind === "people" && (
              <>
                <label>
                  Matrícula ou CPF
                  <input
                    required
                    value={form.registration}
                    onChange={(e) =>
                      setForm({ ...form, registration: e.target.value })
                    }
                  />
                </label>
                <label>
                  Situação
                  <select value={form.active ? "active" : "inactive"} onChange={(e) => setForm({ ...form, active: e.target.value === "active" })}>
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </label>
                {!form.active && <label>Motivo da inativação<select value={form.inactiveReason} onChange={(e) => setForm({ ...form, inactiveReason: e.target.value })}>{inactiveReasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>}
              </>
            )}{" "}
            {(kind === "units" || kind === "people") && (
              <label>
                Cliente
                <select
                  value={form.clientId}
                  onChange={(e) =>
                    setForm({ ...form, clientId: e.target.value })
                  }
                >
                  {data.clients.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            )}{" "}
            {(kind === "sectors" ||
              kind === "locations" ||
              kind === "people") && (
              <label>
                Unidade
                <select
                  value={form.unitId}
                  onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                >
                  {data.units
                    .filter(
                      (x) => kind !== "people" || x.clientId === form.clientId,
                    )
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </select>
              </label>
            )}{" "}
            {kind === "people" && (
              <>
                <label>
                  Setor
                  <select
                    value={form.sectorId}
                    onChange={(e) =>
                      setForm({ ...form, sectorId: e.target.value })
                    }
                  >
                    {data.sectors
                      .filter((x) => x.unitId === form.unitId)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Local de aula
                  <select
                    value={form.locationId}
                    onChange={(e) =>
                      setForm({ ...form, locationId: e.target.value })
                    }
                  >
                    {data.locations
                      .filter((x) => x.unitId === form.unitId)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Turno
                  <select
                    value={form.shift}
                    onChange={(e) =>
                      setForm({ ...form, shift: e.target.value })
                    }
                  >
                    {shifts.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <button className="primary full">{editingId ? "Salvar alterações" : "Salvar"}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function UsersPanel({ users, setUsers, data, token, centralReady }) {
  const blank = () => ({
    name: "",
    email: "",
    role: "professor",
    clientIds: [],
    clientId: data.clients[0]?.id || "",
  });
  const [open, setOpen] = useState(false),
    [editingId, setEditingId] = useState(null),
    [f, setF] = useState(blank),
    [feedback, setFeedback] = useState(""),
    [accessLink, setAccessLink] = useState("");
  const openCreate = () => {
    setEditingId(null);
    setF(blank());
    setAccessLink("");
    setOpen(true);
  };
  const openEdit = (user) => {
    setEditingId(user.id);
    setF({
      name: user.name,
      email: user.email,
      role: user.role,
      clientIds: clientIdsFor(user),
      clientId: user.clientId || clientIdsFor(user)[0] || "",
    });
    setOpen(true);
  };
  const selectRole = (role) => setF((current) => ({
    ...current,
    role,
    clientIds: role === "professor" ? current.clientIds : [],
    clientId: role === "client" ? current.clientId || current.clientIds[0] || data.clients[0]?.id || "" : "",
  }));
  const toggleProfessorClient = (clientId) => setF((current) => ({
    ...current,
    clientIds: current.clientIds.includes(clientId)
      ? current.clientIds.filter((id) => id !== clientId)
      : [...current.clientIds, clientId],
  }));
  const save = async (e) => {
    e.preventDefault();
    if (f.role === "professor" && !f.clientIds.length)
      return setFeedback("Selecione ao menos uma empresa para o professor.");
    if (f.role === "client" && !f.clientId)
      return setFeedback("Selecione a empresa do usuário cliente.");
    const existing = users.find((user) => user.id === editingId);
    const base = {
      id: editingId || newid("USR"),
      name: f.name.trim(),
      email: f.email.trim().toLowerCase(),
      role: f.role,
    };
    const access = f.role === "admin"
      ? {}
      : f.role === "professor"
        ? { clientIds: f.clientIds }
        : { clientId: f.clientId };
    try {
      let account;
      let invitationUrl;
      if (centralReady && token) {
        const payload = {
          ...base,
          clientIds: f.role === "admin" ? [] : f.role === "professor" ? f.clientIds : [f.clientId],
          active: existing?.active,
        };
        const remote = editingId
          ? await centralUpdateUser(token, editingId, payload)
          : await centralCreateUser(token, payload);
        account = normalizeUser(remote.user);
        invitationUrl = remote.invitationUrl;
      } else {
        account = editingId
          ? { ...existing, ...base, ...access }
          : {
            ...base,
            ...access,
            password: "",
            activationStatus: "pending",
            invitationSentAt: new Date().toISOString(),
          };
        account = normalizeUser(account);
      }
      setUsers((current) => editingId
        ? current.map((user) => user.id === editingId ? account : user)
        : [...current, account]);
      setOpen(false);
      if (invitationUrl) {
        navigator.clipboard?.writeText(invitationUrl).catch(() => {});
        setAccessLink(invitationUrl);
        setFeedback(`Usuário criado. O e-mail ainda não está configurado; o link de convite foi copiado.`);
      } else setFeedback(editingId ? `Usuário ${account.name} atualizado.` : `Convite de primeiro acesso enviado para ${account.email}.`);
    } catch (remoteError) {
      setFeedback(remoteError.message);
    }
  };
  const remove = async (account) => {
    if (!window.confirm(`Excluir o acesso de ${account.name}?`)) return;
    try {
      if (centralReady && token) await centralDeleteUser(token, account.id);
      setUsers((current) => current.filter((item) => item.id !== account.id));
      setFeedback(`Usuário ${account.name} excluído.`);
    } catch (remoteError) {
      setFeedback(remoteError.message);
    }
  };
  const reinvite = async (account) => {
    try {
      const remote = await centralReinviteUser(token, account.id);
      if (remote.invitationUrl) {
        navigator.clipboard?.writeText(remote.invitationUrl).catch(() => {});
        setAccessLink(remote.invitationUrl);
      }
      setFeedback(remote.invitationUrl ? "E-mail não configurado; novo link copiado." : "Novo convite enviado por e-mail.");
    } catch (remoteError) {
      setFeedback(remoteError.message);
    }
  };
  return (
    <section className="directory">
      <section className="heading">
        <div>
          <p className="eyebrow">ACESSOS</p>
          <h1>Usuários</h1>
          <p>
            Administrador: gestão completa. Professor: coleta vinculada.
            Cliente: dashboards.
          </p>
        </div>
        <button className="primary" onClick={openCreate}>
          <UserRoundPlus size={17} /> Novo usuário
        </button>
      </section>
      {feedback && <div className="notice">{feedback}</div>}
      {accessLink && <section className="card" style={{ padding: 14, marginBottom: 18 }}>
        <strong>Link de convite de contingência</strong>
        <p className="muted">Use somente enquanto o serviço de e-mail não estiver configurado.</p>
        <button className="secondary" onClick={() => navigator.clipboard?.writeText(accessLink)}>Copiar link</button>
      </section>}
      <section className="card">
        <div className="participants">
          {users.map((x) => (
            <article className="participant" key={x.id}>
              <div className="avatar">{personLabel(x)[0]}</div>
              <div className="person">
                <strong>{personLabel(x)}</strong>
                <span>
                  {roles[x.role]} · {x.email} ·{" "}
                  {userCompaniesLabel(x, data.clients)}
                </span>
              </div>
              <button className="row-edit" onClick={() => openEdit(x)} aria-label={`Editar ${x.name}`}>
                <Pencil size={16} />
              </button>
              {centralReady && !x.active && <button className="secondary compact" onClick={() => reinvite(x)}>Reenviar convite</button>}
              <button
                className="danger-button"
                onClick={() => remove(x)}
              >
                <Trash2 size={17} />
              </button>
            </article>
          ))}
        </div>
      </section>
      {open && (
        <Modal title={editingId ? "Editar usuário" : "Cadastrar usuário"} onClose={() => setOpen(false)}>
          <form className="form" onSubmit={save}>
            <label>
              Nome
              <input
                required
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </label>
            <label>
              E-mail
              <input
                type="email"
                required
                value={f.email}
                onChange={(e) => setF({ ...f, email: e.target.value })}
              />
            </label>
            <label>
              Perfil
              <select
                value={f.role}
                onChange={(e) => selectRole(e.target.value)}
              >
                {Object.entries(roles).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {f.role === "admin" && <p className="form-help">Administrador tem acesso a todas as empresas e não possui empresa vinculada.</p>}
            {f.role === "professor" && <fieldset className="check-list"><legend>Empresas vinculadas</legend>{data.clients.map((client) => <label key={client.id}><input type="checkbox" checked={f.clientIds.includes(client.id)} onChange={() => toggleProfessorClient(client.id)} />{client.name}</label>)}</fieldset>}
            {f.role === "client" && <label>Cliente / empresa<select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">Selecione</option>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>}
            {feedback && <p className="error">{feedback.startsWith("Selecione") ? feedback : ""}</p>}
            <p className="form-help">{editingId ? "A senha não é alterada nesta tela. Use o fluxo de redefinição de senha." : "Ao salvar, o convite de primeiro acesso fica preparado para o envio e o usuário cria a própria senha."}</p>
            <button className="primary full">{editingId ? "Salvar alterações" : "Cadastrar e enviar convite"}</button>
          </form>
        </Modal>
      )}
    </section>
  );
}

function Collect({
  data,
  user,
  classes,
  setClasses,
  attendance,
  setAttendance,
  audit,
  setAudit,
}) {
  const availableClientIds = clientIdsFor(user);
  const [stage, setStage] = useState("new"),
    [scanner, setScanner] = useState(false),
    [entryMode, setEntryMode] = useState(""),
    [scanFailures, setScanFailures] = useState(0),
    [face, setFace] = useState(null),
    [notice, setNotice] = useState(""),
    [cancelledBy, setCancelledBy] = useState("client"),
    [reason, setReason] = useState(cancelReasons.client[0]),
    [location, setLocation] = useState(null),
    [representativeRegistration, setRepresentativeRegistration] = useState(""),
    [representativeConfirmed, setRepresentativeConfirmed] = useState(false),
    [classInfo, setClassInfo] = useState({
      sectorId: data.sectors[0]?.id || "",
      locationId: data.locations[0]?.id || "",
      shift: shifts[0],
      roteiro: "Alongamento e mobilidade",
    }),
    [clientId, setClientId] = useState(availableClientIds[0] || data.clients[0]?.id || "");
  const unitId = data.units.find((x) => x.clientId === clientId)?.id;
  const clientShiftNames = data.workShifts.filter((item) => item.clientId === clientId).map((item) => item.name);
  const availableShiftNames = clientShiftNames.length ? clientShiftNames : shifts;
  useEffect(() => {
    const unit = data.units.find((x) => x.clientId === clientId);
    const sector = data.sectors.find((x) => x.unitId === unit?.id);
    const classLocation = data.locations.find((x) => x.unitId === unit?.id);
    setClassInfo((current) => ({
      ...current,
      sectorId: sector?.id || "",
      locationId: classLocation?.id || "",
      shift: clientShiftNames[0] || shifts[0],
    }));
  }, [clientId]);
  const scoped = data.people.filter(
    (x) => x.clientId === clientId && (!unitId || x.unitId === unitId),
  );
  const classPeople = scoped.filter(
    (x) =>
      x.sectorId === classInfo.sectorId &&
      x.locationId === classInfo.locationId &&
      x.shift === classInfo.shift && x.active !== false,
  );
  const start = (given) => {
    if (!given) {
      setStage("cancel");
      return;
    }
    if (!navigator.geolocation)
      return setNotice("Geolocalização não disponível.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const loc = {
          latitude: p.coords.latitude.toFixed(5),
          longitude: p.coords.longitude.toFixed(5),
          accuracy: p.coords.accuracy,
        };
        setLocation(loc);
        setStage("collect");
        setEntryMode("");
        setScanFailures(0);
        setRepresentativeRegistration("");
        setRepresentativeConfirmed(false);
        setAudit((a) => [
          {
            id: newid("LOG"),
            event: "Início de aula",
            teacherId: user.id,
            teacherName: user.name,
            at: new Date().toISOString(),
            location: loc,
          },
          ...a,
        ]);
      },
      () => setNotice("Permita a geolocalização para iniciar a aula."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const cancel = (e) => {
    e.preventDefault();
    setClasses((c) => [
      ...c,
      {
        id: newid("AULA"),
        clientId,
        unitId,
        ...classInfo,
        status: "cancelled",
        cancelledBy,
        reason,
        at: new Date().toISOString(),
        teacherId: user.id,
      },
    ]);
    setStage("saved");
    setNotice("Cancelamento registrado.");
  };
  const register = (person, method, status = "present") =>
    setAttendance((a) => ({
      ...a,
      [person.id]: {
        status,
        method,
        at: new Date().toISOString(),
        teacherId: user.id,
        location,
        ...classInfo,
      },
    }));
  const read = (value) => {
    setScanner(false);
    const person = classPeople.find(
      (x) => x.id === (value.startsWith("SIGEGL:") ? value.slice(7) : value),
    );
    if (!person) {
      const attempts = scanFailures + 1;
      setScanFailures(attempts);
      if (attempts >= 2) {
        setEntryMode("manual");
        return setNotice("Não foi possível validar o QR Code após duas tentativas. Use o lançamento manual.");
      }
      return setNotice("QR Code não localizado nesta lista. Tente novamente ou use o lançamento manual.");
    }
    setScanFailures(0);
    setFace(person);
  };
  const registerManual = (person, status) => {
    register(person, "manual", status);
  };
  const reportScannerIssue = () => {
    const attempts = scanFailures + 1;
    setScanFailures(attempts);
    if (attempts >= 2) {
      setScanner(false);
      setEntryMode("manual");
      setNotice("A câmera não pôde concluir duas leituras. Continue pelo lançamento manual.");
    }
  };
  const finish = async () => {
    if (!representativeRegistration.trim()) {
      setNotice("Informe a matrícula do representante do local para encerrar a aula.");
      return;
    }
    if (!representativeConfirmed) {
      setNotice("Peça ao representante do local para confirmar a realização da aula.");
      return;
    }
    const at = new Date().toISOString();
    const id = newid("AULA");
    const certificate = await certificateFor({
      id,
      teacherId: user.id,
      clientId,
      unitId,
      classInfo,
      representativeRegistration: representativeRegistration.trim(),
      representativeConfirmed,
      at,
      location,
    });
    setClasses((c) => [
      ...c,
      {
        id,
        clientId,
        unitId,
        ...classInfo,
        status: "applied",
        at,
        teacherId: user.id,
        representativeRegistration: representativeRegistration.trim(),
        certificate,
      },
    ]);
    setAudit((current) => [{
      id: newid("LOG"),
      event: "Aula encerrada e validada pelo representante",
      teacherId: user.id,
      teacherName: user.name,
      at,
      location,
      representativeRegistration: representativeRegistration.trim(),
      certificate,
    }, ...current]);
    setStage("saved");
    setNotice(`Aula registrada. Certificado ${certificate}.`);
  };
  return (
    <section>
      <section className="heading">
        <div>
          <p className="eyebrow">COLETA DE AULA</p>
          <h1>{user.name}</h1>
          <p>Unidade: {nameOf(data.units, unitId)}.</p>
        </div>
      </section>
      {availableClientIds.length > 1 && stage === "new" && (
        <section className="card selection-card">
          <label>
            Empresa da aula
            <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
              {data.clients.filter((client) => availableClientIds.includes(client.id)).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </label>
        </section>
      )}
      {notice && (
        <div className="notice">
          <Check size={17} />
          {notice}
          <button onClick={() => setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {stage === "new" && (
        <section className="decision card">
          <h2>Abrir aula</h2>
          <p>Defina o setor, turno, local e roteiro antes de registrar a realização.</p>
          <div className="class-fields">
            <label>
              Setor
              <select value={classInfo.sectorId} onChange={(e) => setClassInfo({ ...classInfo, sectorId: e.target.value })}>
                {data.sectors.filter((item) => item.unitId === unitId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              Turno
              <select value={classInfo.shift} onChange={(e) => setClassInfo({ ...classInfo, shift: e.target.value })}>
                {availableShiftNames.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label>
              Local da aula
              <select value={classInfo.locationId} onChange={(e) => setClassInfo({ ...classInfo, locationId: e.target.value })}>
                {data.locations.filter((item) => item.unitId === unitId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              Roteiro da aula
              <select value={classInfo.roteiro} onChange={(e) => setClassInfo({ ...classInfo, roteiro: e.target.value })}>
                {data.routines.map((routine) => <option key={routine.id}>{routine.name}</option>)}
              </select>
            </label>
          </div>
          <h3>A aula foi dada?</h3>
          <div>
            <button className="primary" onClick={() => start(true)}>
              Sim, iniciar aula
            </button>
            <button className="secondary" onClick={() => start(false)}>
              Não, registrar cancelamento
            </button>
          </div>
        </section>
      )}
      {stage === "cancel" && (
        <section className="card cancel-form">
          <h2>Motivo do cancelamento</h2>
          <form className="form" onSubmit={cancel}>
            <label>
              Cancelada por
              <select
                value={cancelledBy}
                onChange={(e) => {
                  setCancelledBy(e.target.value);
                  setReason(cancelReasons[e.target.value][0]);
                }}
              >
                <option value="client">Cliente</option>
                <option value="eleva">ElevaLife</option>
              </select>
            </label>
            <label>
              Motivo
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {cancelReasons[cancelledBy].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <button className="primary">Registrar cancelamento</button>
          </form>
        </section>
      )}
      {stage === "collect" && (
        <>
          <section className="checkin">
            <MapPin size={20} />
            <div>
              <strong>Aula iniciada e auditada</strong>
              <span>
                {location.latitude}, {location.longitude} · precisão{" "}
                {Math.round(location.accuracy)} m
              </span>
            </div>
          </section>
          {!entryMode ? (
            <section className="entry-choice card">
              <p className="eyebrow">REGISTRO DE PARTICIPAÇÃO</p>
              <h2>Como deseja registrar as presenças?</h2>
              <p>Escolha a leitura pelo QR Code ou o lançamento manual da lista desta aula.</p>
              <div>
                <button className="primary" onClick={() => { setEntryMode("qr"); setScanner(true); }}>
                  <ScanLine size={18} /> Ler QR Code
                </button>
                <button className="secondary" onClick={() => setEntryMode("manual")}>
                  <ClipboardList size={18} /> Lançamento manual
                </button>
              </div>
            </section>
          ) : (
            <section className="actions">
              {entryMode === "qr" ? <>
                <button className="primary" onClick={() => setScanner(true)}>
                  <ScanLine size={18} /> Ler próximo QR Code
                </button>
                <button className="secondary" onClick={() => setEntryMode("manual")}>
                  <ClipboardList size={18} /> Lançamento manual
                </button>
              </> : <button className="secondary" onClick={() => { setEntryMode("qr"); setScanner(true); }}>
                <ScanLine size={18} /> Ler QR Code
              </button>}
              <button className="primary" onClick={() => setStage("signature")}>
                Validar e encerrar
              </button>
            </section>
          )}
          <section className="card">
            <div className="card-heading">
              <h2>{entryMode === "manual" ? "Lançamento manual" : "Colaboradores vinculados"}</h2>
              <p>{entryMode === "manual" ? "Marque P (presente), A (ausente) ou F (faltante) para cada pessoa desta lista." : "A lista foi filtrada pelo setor, local e turno da aula."}</p>
            </div>
            <div className="participants">
              {classPeople.map((x) => (
                <article className="participant" key={x.id}>
                  <div className="avatar">{personLabel(x)[0]}</div>
                  <div className="person">
                    <strong>{personLabel(x)}</strong>
                    <span>
                      {x.registration} · {nameOf(data.sectors, x.sectorId)} ·{" "}
                      {x.shift}
                    </span>
                  </div>
                  {entryMode === "manual" ? (
                    <div className="attendance-actions">
                      {[["present", "P", "Presente"], ["absent", "A", "Ausente"], ["missing", "F", "Faltante"]].map(([status, short, label]) => <button key={status} className={attendance[x.id]?.status === status ? `attendance-${status} selected` : `attendance-${status}`} title={label} onClick={() => registerManual(x, status)}>{short}</button>)}
                    </div>
                  ) : attendance[x.id]?.status === "present" ? (
                    <span className="badge present">Presença confirmada</span>
                  ) : (
                    <div className="row-actions">
                      <span className="badge manual_review">Aguardando QR Code</span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
      {stage === "signature" && (
        <section className="card representative-confirmation">
          <p className="eyebrow">CONFIRMAÇÃO DO LOCAL</p>
          <h2>Validação do representante</h2>
          <p>Antes de fechar a aula, peça ao representante do setor para informar a matrícula. Esse registro gera um certificado de autenticação para a auditoria.</p>
          <label>
            Matrícula do representante
            <input autoFocus value={representativeRegistration} onChange={(event) => setRepresentativeRegistration(event.target.value)} placeholder="Digite a matrícula" />
          </label>
          <label className="confirmation-check">
            <input type="checkbox" checked={representativeConfirmed} onChange={(event) => setRepresentativeConfirmed(event.target.checked)} />
            Confirmo que a aula foi realizada neste local.
          </label>
          <div>
            <button className="secondary" onClick={() => setStage("collect")}>Voltar à lista</button>
            <button className="primary" onClick={finish}><Check size={17} /> Confirmar e fechar aula</button>
          </div>
        </section>
      )}
      {stage === "saved" && (
        <section className="decision card">
          <h2>Registro concluído.</h2>
          <p>O status da aula já foi enviado aos indicadores locais.</p>
          <button className="primary" onClick={() => setStage("new")}>
            Abrir nova aula
          </button>
        </section>
      )}
      {scanner && <Scanner onRead={read} onClose={() => { setScanner(false); if (entryMode === "qr" && scanFailures >= 2) setEntryMode("manual"); }} onIssue={reportScannerIssue} onManual={() => { setScanner(false); setEntryMode("manual"); }} />}{" "}
      {face && (
        <Face
          person={face}
          onClose={() => setFace(null)}
          onDone={(r) => {
            const p = face;
            setFace(null);
            if (r.status === "approved") {
              register(p, "qr_face");
              setNotice(`${p.name}: presença confirmada.`);
            } else setNotice(`${p.name}: confirmação manual necessária.`);
          }}
        />
      )}
    </section>
  );
}

function Planning({ data, schedules, setSchedules }) {
  const [referenceMonth, setReferenceMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [form, setForm] = useState({
    clientId: data.clients[0]?.id || "",
    unitId: data.units[0]?.id || "",
    sectorId: data.sectors[0]?.id || "",
    locationId: data.locations[0]?.id || "",
    shift: shifts[0],
    weekday: 1,
  });
  const clientSchedules = schedules.filter((item) => item.clientId === form.clientId);
  const availableShiftNames = data.workShifts.filter((item) => item.clientId === form.clientId).map((item) => item.name);
  const referenceDate = new Date(`${referenceMonth}-01T12:00:00`);
  const planned = plannedClassesForMonth(clientSchedules, { clientId: form.clientId }, referenceDate);
  const save = (event) => {
    event.preventDefault();
    setSchedules((current) => [...current, { ...form, id: newid("PL") }]);
  };
  return <section className="directory">
    <section className="heading">
      <div><p className="eyebrow">PLANEJAMENTO MENSAL</p><h1>Aulas previstas</h1><p>Selecione o mês e o ano. O sistema conta somente os dias úteis desse período.</p></div>
      <label className="month-picker">Mês de referência<input type="month" value={referenceMonth} onChange={(e) => setReferenceMonth(e.target.value)} /></label>
      <div className="planned-counter"><strong>{planned}</strong><span>aulas previstas no mês selecionado</span></div>
    </section>
    <section className="planning-grid">
      <section className="card planning-form"><h2>Programar aula recorrente</h2><form className="form" onSubmit={save}>
        <label>Cliente / empresa<select value={form.clientId} onChange={(e) => { const clientId = e.target.value; const firstShift = data.workShifts.find((item) => item.clientId === clientId)?.name || shifts[0]; setForm({ ...form, clientId, unitId: "", sectorId: "", locationId: "", shift: firstShift }); }}>{data.clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Unidade<select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value, sectorId: "", locationId: "" })}>{data.units.filter((item) => item.clientId === form.clientId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Setor<select value={form.sectorId} onChange={(e) => setForm({ ...form, sectorId: e.target.value })}>{data.sectors.filter((item) => item.unitId === form.unitId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Local da aula<select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>{data.locations.filter((item) => item.unitId === form.unitId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Turno<select value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>{(availableShiftNames.length ? availableShiftNames : shifts).map((item) => <option key={item}>{item}</option>)}</select></label>
        <div className="planning-inline"><label>Dia útil da semana<select value={form.weekday} onChange={(e) => setForm({ ...form, weekday: Number(e.target.value) })}>{weekdays.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
        <button className="primary full"><Plus size={17}/> Adicionar aula prevista</button>
      </form><p className="planning-help">Para duas ou mais aulas no mesmo dia, adicione uma linha para cada horário.</p></section>
      <section className="card"><div className="card-heading"><h2>Grade programada</h2><p>{clientSchedules.length} dia(s) de aula cadastrado(s).</p></div><div className="schedule-list">{clientSchedules.map((item) => <article key={item.id}><div><strong>{weekdays.find((day) => day.value === Number(item.weekday))?.label}</strong><span>{nameOf(data.units, item.unitId)} · {nameOf(data.sectors, item.sectorId)} · {item.shift}</span><small>{nameOf(data.locations, item.locationId)}</small></div><button className="danger-button" onClick={() => setSchedules((current) => current.filter((schedule) => schedule.id !== item.id))}><Trash2 size={17}/></button></article>)}</div></section>
    </section>
  </section>;
}

export default function App() {
  const [data, setData] = useState(() => ({
    clients: read(K.clients, seed.clients),
    units: read(K.units, seed.units),
    sectors: read(K.sectors, seed.sectors),
    locations: read(K.locations, seed.locations),
    workShifts: read(K.workShifts, seed.workShifts),
    routines: read(K.routines, seed.routines),
    people: read(K.people, seed.people),
  }));
  const [users, setUsers] = useState(() => read(K.users, seed.users).map(normalizeUser)),
    [schedules, setSchedules] = useState(() => read(K.schedules, seed.schedules)),
    [classes, setClasses] = useState(() => read(K.classes, [])),
    [attendance, setAttendance] = useState(() => read(K.attendance, {})),
    [audit, setAudit] = useState(() => read(K.audit, [])),
    [user, setUser] = useState(() => read(K.auth, null)),
    [token, setToken] = useState(() => read(K.token, "")),
    [centralReady, setCentralReady] = useState(false),
    [syncStatus, setSyncStatus] = useState("local"),
    [page, setPage] = useState("dashboard"),
    [kind, setKind] = useState("clients"),
    [online, setOnline] = useState(() => navigator.onLine);
  const restoreStarted = useRef(false);
  const syncTimer = useRef();

  const snapshot = () => ({ data, schedules, classes, attendance, audit });
  const applySnapshot = (remote) => {
    if (!remote?.data) return;
    setData({
      clients: remote.data.clients || [],
      units: remote.data.units || [],
      sectors: remote.data.sectors || [],
      locations: remote.data.locations || [],
      workShifts: remote.data.workShifts || [],
      routines: remote.data.routines || [],
      people: remote.data.people || [],
    });
    setSchedules(remote.schedules || remote.data.schedules || []);
    setClasses(remote.classes || remote.data.classes || []);
    setAttendance(remote.attendance || remote.data.attendance || {});
    setAudit(remote.audit || []);
  };
  useEffect(() => {
    Object.entries(data).forEach(([k, v]) => write(K[k], v));
  }, [data]);
  useEffect(() => write(K.users, users), [users]);
  useEffect(() => write(K.classes, classes), [classes]);
  useEffect(() => write(K.attendance, attendance), [attendance]);
  useEffect(() => write(K.audit, audit), [audit]);
  useEffect(() => write(K.schedules, schedules), [schedules]);
  useEffect(() => {
    const demoMarker = "gl-demo-scenario-v1";
    if (localStorage.getItem(demoMarker)) return;
    const demo = demoScenario();
    const appendMissing = (current, additions) => [
      ...current,
      ...additions.filter((item) => !current.some((existing) => existing.id === item.id)),
    ];
    setData((current) => ({
      clients: appendMissing(current.clients, demo.clients),
      units: appendMissing(current.units, demo.units),
      sectors: appendMissing(current.sectors, demo.sectors),
      locations: appendMissing(current.locations, demo.locations),
      workShifts: appendMissing(current.workShifts, demo.workShifts),
      people: appendMissing(current.people, demo.people),
    }));
    setSchedules((current) => appendMissing(current, demo.schedules));
    setClasses((current) => appendMissing(current, demo.classes));
    setAttendance((current) => ({ ...demo.attendance, ...current }));
    setAudit((current) => appendMissing(current, demo.audit));
    localStorage.setItem(demoMarker, "loaded");
  }, []);
  useEffect(() => {
    if (restoreStarted.current || !token || !user || !navigator.onLine) return;
    restoreStarted.current = true;
    centralBootstrap(token)
      .then((remote) => {
        if (remote.initialized) applySnapshot(remote.data);
        setCentralReady(true);
        setSyncStatus(remote.initialized ? "sincronizado" : "pendente");
      })
      .catch(() => {
        // O cache local continua sendo a fonte de trabalho até a conexão voltar.
        setSyncStatus("offline");
      });
  }, [token, user]);
  useEffect(() => {
    const connect = () => setOnline(true);
    const disconnect = () => setOnline(false);
    window.addEventListener("online", connect);
    window.addEventListener("offline", disconnect);
    return () => {
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", disconnect);
    };
  }, []);
  useEffect(() => {
    if (!centralReady || !token || user?.role === "client" || !online) return;
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(async () => {
      try {
        await centralSync(token, snapshot());
        localStorage.removeItem(K.outbox);
        setSyncStatus("sincronizado");
      } catch {
        write(K.outbox, snapshot());
        setSyncStatus("pendente");
      }
    }, 900);
    return () => window.clearTimeout(syncTimer.current);
  }, [data, schedules, classes, attendance, audit, centralReady, token, user, online]);
  useEffect(() => {
    if (!centralReady || !token || user?.role !== "admin") return;
    centralUsers(token)
      .then((remote) => setUsers(remote.users.map(normalizeUser)))
      .catch(() => {});
  }, [centralReady, token, user?.role]);
  const startCentralSession = async (email, password) => {
    const session = await centralLogin(email, password);
    const centralUser = normalizeUser(session.user);
    write(K.token, session.token);
    setToken(session.token);
    const remote = await centralBootstrap(session.token);
    if (remote.initialized) applySnapshot(remote.data);
    else if (centralUser.role === "admin") {
      try {
        await centralSync(session.token, snapshot());
        localStorage.removeItem(K.outbox);
      } catch {
        write(K.outbox, snapshot());
      }
    }
    setCentralReady(true);
    setSyncStatus(remote.initialized ? "sincronizado" : "pendente");
    setUser(centralUser);
    write(K.auth, centralUser);
    setPage(centralUser.role === "professor" ? "collect" : "dashboard");
    return session;
  };
  if (!user)
    return (
      <Login
        users={users}
        setUsers={setUsers}
        onLogin={(u) => {
          setUser(u);
          write(K.auth, u);
          setPage(u.role === "professor" ? "collect" : "dashboard");
        }}
        onCentralLogin={startCentralSession}
        onActivate={centralActivate}
        onRequestReset={centralRequestReset}
        onResetPassword={centralResetPassword}
      />
    );
  const nav =
    user.role === "admin"
      ? [
          ["dashboard", BarChart3, "Dashboard"],
          ["collect", ScanLine, "Coleta de aula"],
          ["planning", ClipboardCheck, "Aulas previstas"],
          ["registry", Building2, "Cadastros"],
          ["import", FileSpreadsheet, "Importar Excel"],
          ["users", Users, "Usuários"],
          ["logs", ClipboardList, "Logs"],
          ["reports", FileText, "Relatórios"],
        ]
      : user.role === "professor"
        ? [["collect", ScanLine, "Coleta de aula"]]
        : [["dashboard", BarChart3, "Dashboard"]];
  const scoped = data.people.filter(
    (x) => user.role === "admin" || clientIdsFor(user).includes(x.clientId),
  );
  const report = () => {
    const csv = [
        "Nome;Matrícula;Setor;Turno;Status",
        ...scoped.map(
          (x) =>
            `${x.name};${x.registration};${nameOf(data.sectors, x.sectorId)};${x.shift};${attendance[x.id]?.status === "present" ? "Presente" : "Faltante"}`,
        ),
      ].join("\n"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "relatorio-gl.csv";
    a.click();
  };
  return (
    <main>
      <nav>
        <div className="brand">
          <ClipboardCheck />
          <span>
            <b>ElevaLife</b>
            <em> · SIGE GL</em>
          </span>
        </div>
        <div className="user-nav">
          <span className="offline">
            <span />
            {!online ? "Sem internet · dados protegidos" : centralReady ? syncStatus === "sincronizado" ? "Dados sincronizados" : "Sincronização pendente" : "Dados neste dispositivo"}
          </span>
          <span className="teacher-name">
            {user.name} · {roles[user.role]}
          </span>
          <button
            onClick={() => {
              localStorage.removeItem(K.auth);
              localStorage.removeItem(K.token);
              setToken("");
              setCentralReady(false);
              setSyncStatus("local");
              setUser(null);
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </nav>
      <div className="container">
        {nav.length > 1 && <div className="app-tabs">
          {nav.map(([v, I, l]) => (
            <button
              key={v}
              className={page === v ? "active" : ""}
              onClick={() => setPage(v)}
            >
              <I size={17} />
              {l}
            </button>
          ))}
        </div>}
        {page === "dashboard" && (
          <Dashboard
            data={data}
            schedules={schedules}
            classes={classes}
            attendance={attendance}
            user={user}
          />
        )}{" "}
        {page === "collect" && (
          <Collect
            data={data}
            user={user}
            classes={classes}
            setClasses={setClasses}
            attendance={attendance}
            setAttendance={setAttendance}
            audit={audit}
            setAudit={setAudit}
          />
        )}{" "}
        {page === "planning" && (
          <Planning data={data} schedules={schedules} setSchedules={setSchedules} />
        )}{" "}
        {page === "registry" && (
          <>
            <div className="registry-tabs">
              {[
                ["clients", "Clientes"],
                ["units", "Unidades"],
                ["sectors", "Setores"],
                ["locations", "Locais de aula"],
                ["workShifts", "Turnos e horários"],
                ["people", "Colaboradores"],
              ].map(([v, l]) => (
                <button
                  key={v}
                  className={kind === v ? "active" : ""}
                  onClick={() => setKind(v)}
                >
                  {l}
                </button>
              ))}
            </div>
            {kind === "workShifts" ? <ShiftSettings data={data} setData={setData} /> : <Registry kind={kind} data={data} setData={setData} />}
          </>
        )}{" "}
        {page === "import" && (
          <ExcelImport data={data} setData={setData} setUsers={setUsers} token={token} centralReady={centralReady} />
        )}{" "}
        {page === "users" && (
          <UsersPanel users={users} setUsers={setUsers} data={data} token={token} centralReady={centralReady} />
        )}{" "}
        {page === "logs" && (
          <section className="directory">
            <section className="heading">
              <div>
                <p className="eyebrow">CONFERÊNCIA OPERACIONAL</p>
                <h1>Log de aulas</h1>
                <p>Professor, ID, data, horário e geolocalização.</p>
              </div>
            </section>
            <section className="card">
              <div className="audit-list">
                {audit.length ? (
                  audit.map((x) => (
                    <article key={x.id}>
                      <MapPin size={19} />
                      <div>
                        <strong>
                          {x.teacherName} · {x.teacherId}
                        </strong>
                        <span>
                          {new Date(x.at).toLocaleString("pt-BR")} · {x.event}
                        </span>
                        <small>
                          {x.location
                            ? `${x.location.latitude}, ${x.location.longitude} · precisão ${Math.round(x.location.accuracy)} m`
                            : "Sem localização"}
                        </small>
                        {x.representativeRegistration && <small>Representante: matrícula {x.representativeRegistration}</small>}
                        {x.certificate && <code className="certificate">{x.certificate}</code>}
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="empty">
                    Nenhuma aula iniciada neste dispositivo.
                  </p>
                )}
              </div>
            </section>
          </section>
        )}{" "}
        {page === "reports" && (
          <section className="directory">
            <section className="heading">
              <div>
                <p className="eyebrow">RELATÓRIOS</p>
                <h1>Relatório de adesão</h1>
                <p>Exporte para conferência e envio ao cliente.</p>
              </div>
              <button className="primary" onClick={report}>
                <Download size={17} />
                Baixar CSV
              </button>
            </section>
            <section className="card report-export">
              <FileText size={34} />
              <div>
                <strong>Indicadores mensais de GL</strong>
                <p>
                  Presenças, faltas, setor e turno. O arquivo pode ser impresso
                  pelo navegador.
                </p>
              </div>
            </section>
          </section>
        )}
      </div>
    </main>
  );
}
