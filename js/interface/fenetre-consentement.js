// ==========================================================
// Fenêtre « Avant d'enregistrer » : rappel du consentement,
// affichée avant chaque capture. Il faut cocher la case pour continuer.
// ==========================================================

const $ = (id) => document.getElementById(id);

/**
 * Affiche la fenêtre et attend la réponse.
 * @returns {Promise<boolean>} vrai si l'utilisateur a coché la case et continué
 *          (la réponse arrive pendant le clic : le partage d'écran peut être demandé aussitôt)
 */
export function demanderConsentement() {
  const fenetre = $("fenetre-consentement");
  const caseAccord = $("case-consentement");
  const boutonOk = $("bouton-consentement-ok");
  const boutonAnnuler = $("bouton-consentement-annuler");

  caseAccord.checked = false;
  boutonOk.disabled = true;

  return new Promise((resoudre) => {
    const surCase = () => {
      boutonOk.disabled = !caseAccord.checked;
    };
    const finir = (reponse) => {
      caseAccord.removeEventListener("change", surCase);
      boutonOk.removeEventListener("click", surOk);
      boutonAnnuler.removeEventListener("click", surAnnuler);
      fenetre.removeEventListener("cancel", surAnnuler);
      fenetre.close();
      resoudre(reponse);
    };
    const surOk = () => finir(caseAccord.checked);
    const surAnnuler = (e) => {
      e?.preventDefault?.();
      finir(false);
    };

    caseAccord.addEventListener("change", surCase);
    boutonOk.addEventListener("click", surOk);
    boutonAnnuler.addEventListener("click", surAnnuler);
    fenetre.addEventListener("cancel", surAnnuler); // touche Échap
    fenetre.showModal();
  });
}
