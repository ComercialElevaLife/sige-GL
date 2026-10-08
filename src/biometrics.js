/**
 * Boundary for a server-side biometric provider. The browser only captures an
 * image; it must never receive or store a biometric template or provider key.
 */
export async function verifyFace({ participantId, sessionId, image }) {
  const endpoint = import.meta.env.VITE_BIOMETRIC_VERIFY_URL;

  if (!endpoint) {
    return {
      status: 'manual_required',
      message: 'Provedor biométrico não configurado. Confirme a presença manualmente.',
    };
  }

  const body = new FormData();
  body.append('participantId', participantId);
  body.append('sessionId', sessionId);
  body.append('image', image, 'captura.jpg');

  const response = await fetch(endpoint, { method: 'POST', body });
  if (!response.ok) throw new Error('Não foi possível validar a biometria facial.');
  return response.json();
}
