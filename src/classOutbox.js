import { centralSaveClass } from "./api";

// Fila offline das aulas encerradas: cada aula é um registro com id gerado no aparelho.
// Só sai da fila depois que o servidor confirma. Fica fora do conjunto de chaves apagadas no logout,
// para não perder aula não enviada; só é enviada pelo mesmo usuário que a registrou.
const KEY = "gl-aulas-outbox";
const REJECTED = "gl-aulas-rejeitadas";

const load = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
};
const save = (key, list) => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
};

export const pendingClasses = (userId) => load(KEY).filter((item) => item.userId === userId).length;
export const rejectedClasses = (userId) => load(REJECTED).filter((item) => item.userId === userId).length;

export function queueClass(item) {
  const list = load(KEY).filter((x) => x.aula?.id !== item.aula.id);
  list.push(item);
  return save(KEY, list);
}

// Envia as aulas pendentes do usuário. Erro de rede mantém na fila; recusa definitiva do servidor
// (4xx, exceto sessão/tempo/limite) move para a lista de rejeitadas para não travar as demais.
export async function flushClasses(token, userId) {
  let sent = 0;
  let rejected = 0;
  for (const item of load(KEY)) {
    if (item.userId !== userId) continue;
    try {
      await centralSaveClass(token, { aula: item.aula, presencas: item.presencas, photo: item.photo, photoSkipped: item.photoSkipped });
      save(KEY, load(KEY).filter((x) => x.aula?.id !== item.aula.id));
      sent += 1;
    } catch (error) {
      const permanent = error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status);
      if (!permanent) break;
      save(KEY, load(KEY).filter((x) => x.aula?.id !== item.aula.id));
      save(REJECTED, [...load(REJECTED), { ...item, photo: "", error: error.message }]);
      rejected += 1;
    }
  }
  return { sent, rejected };
}
