// ==========================================================
// Le navigateur peut-il capturer une session en direct ?
//
// Il faut un ordinateur : sur Android (et iPhone), le navigateur n'a
// pas le droit d'écouter le son d'une autre application comme Discord.
// Android protège même tout particulièrement le son des appels.
// ==========================================================

/**
 * @returns {{possible: boolean, raison?: "telephone"|"navigateur",
 *            chromium: boolean, windows: boolean, mac: boolean}}
 */
export function verifierCompatibilite() {
  const ua = navigator.userAgent;
  const telephone = navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  // Chrome et Edge (même moteur « Chromium ») savent capter le son du système
  const chromium = Boolean(
    navigator.userAgentData?.brands?.some((m) => /Chromium|Google Chrome|Microsoft Edge/.test(m.brand))
  ) || /Chrome\//.test(ua);
  const infos = { chromium, windows: /Windows/.test(ua), mac: /Macintosh/.test(ua) };

  if (telephone) return { possible: false, raison: "telephone", ...infos };
  if (!navigator.mediaDevices?.getDisplayMedia || !window.AudioWorkletNode) {
    return { possible: false, raison: "navigateur", ...infos };
  }
  return { possible: true, ...infos };
}
