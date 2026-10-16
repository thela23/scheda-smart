/* Scheda v8 (08/10/2026) arricchita coi metadati che servono all'app e al motore del tempo.
 *
 * Campi per esercizio:
 *   n     serie piene · reps: range mostrato · r: rip medie (per stimare il tempo)
 *   hold  secondi, per gli esercizi a tenuta · side: rip per lato/gamba (tempo doppio)
 *   k     tipo: "bil" bilanciere · "man" manubri · "iso" isolamento · "corpo" corpo libero · "core"
 *   myo   true se si puo' fare in myo-reps (mai sui bilancieri: niente spotter)
 *   m     muscoli: 1 = diretto, 0.5 = indiretto (conteggio frazionario, Pelland 2025)
 *   load  carico di partenza (modificabile nell'app) · v / v2: video YouTube · cue: indicazione breve
 *   paio  quale coppia di manubri: "metallo" (impugnatura 2 kg, solo dischi normali) o "leggeri" (plastica,
 *         ~0 kg, prende anche i dischi piccoli da 2,5 e 1,25). Serve nelle superserie con due carichi diversi:
 *         si preparano tutte e due le coppie prima di partire (dal 16/10/2026)
 * Blocco: rest = recupero in secondi · ramp = secondi di ramp-up se il blocco ha il primo bilanciere
 *
 * Se cambia la scheda: aggiornare anche docs/SCHEDA_ATTUALE.md e app/scheda.html.
 * Rinominare un esercizio spezza il suo storico (la chiave e' derivata dal nome).
 */
var SCHEDA = {
  versione: "v8.2 · 16/10/2026",
  luoghi: {
    casa: {
      label: "Casa",
      prima: [
        { t: "Riscaldamento — 3 min", v: "rKpcpsvclw0", p: "Jumping jacks 30 s · skip 30 s · rotazioni braccia 20 s · rotazioni bacino 20 s · cat-cow 20 s · squat lenti 30 s · push-up leggeri 30 s. Nella versione lampo: metà di tutto." },
        { t: "Ramp-up", p: "Prima del primo bilanciere: <b>bilanciere vuoto × 5</b> → <b>× 3 al ~60%</b> → serie vere. Non contano come serie." },
        { t: "Manubri a vite", warn: true, p: "Controlla i fermi prima di ogni serie. <b>Mai un manubrio in verticale</b> (presa goblet): se il fermo cede, i dischi ti cadono addosso." }
      ],
      giorni: [
        { id: "A", nome: "Giorno A", sub: "Quadricipiti + Spinta orizzontale", hue: "a", blocchi: [
          { rest: 120, ramp: 150, ex: [
            { name: "Zercher Squat bilanciere", v: "w0dsCp3edNc", n: 4, reps: "6–8", r: 7, k: "bil", load: "60 kg", rir: "1–2",
              m: { quadricipiti: 1, glutei: 0.5, core: 0.5 } },
            { name: "Dead bug", v: "bxn9FBrt4-A", n: 4, reps: "10/lato", r: 10, side: true, k: "core", load: "corpo libero",
              m: { core: 1 } } ] },
          { rest: 90, ex: [
            { name: "Floor Press manubri", paio: "metallo", v: "AqYFvc9t_vU", n: 4, reps: "8–10", r: 9, k: "man", load: "24 kg/man", rir: "1–2",
              m: { petto: 1, tricipiti: 0.5, spalle_ant: 0.5 } },
            { name: "Rematore manubrio singolo", paio: "metallo", v: "nMFCMNKnLgQ", n: 4, reps: "8–10/lato", r: 9, side: true, k: "man", load: "24 kg", rir: "1–2",
              m: { dorsali: 1, bicipiti: 0.5, spalle_post: 0.5 } } ] },
          { rest: 60, ex: [
            { name: "Alzate laterali", paio: "leggeri", v: "nnH63icHYXY", n: 3, reps: "12–15", r: 13, k: "iso", myo: true, load: "7 kg", rir: "0–1",
              cue: "Gomiti appena piegati, sali fino alle spalle, scendi in 2 s.", m: { spalle_lat: 1 } },
            { name: "Hammer Curl", paio: "metallo", v: "8XLxfXROrTo", n: 3, reps: "10–12", r: 11, k: "iso", myo: true, load: "12 kg", rir: "0–1",
              m: { bicipiti: 1 } } ] },
          { rest: 45, ex: [
            { name: "Calf Raise in piedi", paio: "metallo", v: "H6WptvjXkgw", n: 3, reps: "15–20", r: 17, k: "iso", myo: true, load: "24 kg tot", rir: "0–1",
              cue: "Su un gradino: tallone giù fino al massimo allungamento, pausa 1 s in basso.", m: { polpacci: 1 } },
            { name: "Estensioni tricipiti sopra la testa", paio: "leggeri", v: "IJ6J7EKprsc", n: 3, reps: "10–12", r: 11, k: "iso", myo: true, load: "2 × 8 kg", rir: "0–1",
              m: { tricipiti: 1 } } ] },
          { rest: 45, ex: [
            { name: "Push-up a deficit", v: "arcOjmLeq4s", n: 3, reps: "max", r: 12, k: "corpo", myo: true, load: "corpo libero", rir: "0–1",
              cue: "Mani su 2 rialzi stabili, petto sotto il livello delle mani.", m: { petto: 1, tricipiti: 0.5, spalle_ant: 0.5 } } ] }
        ] },

        { id: "B", nome: "Giorno B", sub: "Femorali/Glutei + Spinta verticale", hue: "b", blocchi: [
          { rest: 120, ramp: 150, ex: [
            { name: "Stacco Rumeno (RDL) bilanciere", v: "uhghy9pFIPY", n: 3, reps: "8–10", r: 9, k: "bil", load: "60 kg", rir: "1–2",
              m: { femorali: 1, glutei: 0.5 } },
            { name: "Plank", v: "A2b2EmIg0dA", n: 3, reps: "40 s", hold: 40, k: "core", load: "corpo libero",
              m: { core: 1 } } ] },
          { rest: 90, ex: [
            { name: "Overhead Press bilanciere", v: "bMksDb5a3P0", n: 3, reps: "6–8", r: 7, k: "bil", load: "40 kg", rir: "1–2",
              m: { spalle_ant: 1, tricipiti: 0.5, spalle_lat: 0.5 } },
            { name: "Chin-up", v: "e1YSApl-QcM", n: 3, reps: "6–10", r: 8, k: "corpo", load: "corpo libero", rir: "1–2",
              cue: "Presa supina.", m: { dorsali: 1, bicipiti: 0.5 } } ] },
          { rest: 60, ex: [
            { name: "Push-up Diamond", v: "_6AvEX9-k8E", n: 3, reps: "10–15", r: 12, k: "corpo", myo: true, load: "corpo libero", rir: "1–2",
              m: { tricipiti: 0.5, petto: 0.5 } },
            { name: "Alzate posteriori da seduto", paio: "leggeri", v: "l7y9jIKD1Ls", n: 3, reps: "12–15", r: 13, k: "iso", myo: true, load: "5 kg", rir: "0–1",
              cue: "Sul bordo della sedia, petto sulle cosce. Apri le braccia di lato coi gomiti appena piegati, fino all'altezza delle spalle. Leggero, senza slancio.", m: { spalle_post: 1, dorsali: 0.5 } } ] },
          { rest: 45, ex: [
            { name: "Calf Raise in piedi", paio: "metallo", v: "H6WptvjXkgw", n: 3, reps: "15–20", r: 17, k: "iso", myo: true, load: "26 kg tot", rir: "0–1",
              cue: "Su un gradino: tallone giù fino al massimo allungamento, pausa 1 s in basso.", m: { polpacci: 1 } },
            { name: "Curl manubri", paio: "leggeri", v: "XE_pHwbst04", n: 3, reps: "10–12", r: 11, k: "iso", myo: true, load: "12 kg", rir: "0–1",
              m: { bicipiti: 1 } } ] },
          { rest: 60, ex: [
            { name: "Croci a terra con manubri", paio: "leggeri", v: "bgC53-J-6gA", n: 3, reps: "12–15", r: 13, k: "iso", myo: true, load: "8 kg", rir: "0–1",
              cue: "Sdraiato a terra, ginocchia piegate. Gomiti appena piegati e fermi: apri finché i gomiti toccano il pavimento, poi richiudi sopra il petto. Fermi stretti.", m: { petto: 1 } },
            { name: "Sliding leg curl con asciugamano", v: "p-V7uBUHeLc", v2: "gnb_hAG1dGY", n: 3, reps: "10–12", r: 11, k: "corpo", myo: true, load: "corpo libero", rir: "1",
              cue: "Pavimento liscio, ponte tenuto, talloni al sedere, giù in 2–3 s. Più dura: una gamba → Nordic (＋).", m: { femorali: 1 } } ] }
        ] },

        { id: "C", nome: "Giorno C", sub: "Gambe unilaterali + Braccia/Spalle", hue: "c", blocchi: [
          { rest: 90, ex: [
            { name: "Bulgarian Split Squat", paio: "metallo", v: "hiLF_pF3EJM", n: 3, reps: "8–10/gamba", r: 9, side: true, k: "man", load: "2 × 9 kg", rir: "1–2",
              m: { quadricipiti: 1, glutei: 0.5 } },
            { name: "Hollow Body Hold", v: "0yPin8hSc8o", n: 3, reps: "30 s", hold: 30, k: "core", load: "corpo libero",
              m: { core: 1 } } ] },
          { rest: 90, ramp: 75, ex: [
            { name: "Hip Thrust a terra bilanciere", v: "onl9grCVQFs", n: 3, reps: "10–12", r: 11, k: "bil", load: "70 kg", rir: "1–2",
              cue: "Pausa 1 s in alto.", m: { glutei: 1, femorali: 0.5 } },
            { name: "Single-Leg RDL manubrio", paio: "metallo", v: "Zfr6wizR8rs", n: 3, reps: "10–12/gamba", r: 11, side: true, k: "man", load: "14 kg", rir: "1–2",
              m: { femorali: 1, glutei: 0.5 } } ] },
          { rest: 75, ex: [
            { name: "Alzate laterali", paio: "leggeri", v: "nnH63icHYXY", n: 3, reps: "12–20", r: 15, k: "iso", myo: true, load: "7 kg", rir: "0–1",
              cue: "Gomiti appena piegati, sali fino alle spalle, scendi in 2 s.", m: { spalle_lat: 1 } },
            { name: "Trazioni presa prona", v: "MhokcbRLP5w", n: 3, reps: "6–10", r: 8, k: "corpo", load: "corpo libero", rir: "1–2",
              m: { dorsali: 1, bicipiti: 0.5 } } ] },
          { rest: 45, ex: [
            { name: "Estensioni tricipiti sopra la testa", paio: "leggeri", v: "IJ6J7EKprsc", n: 3, reps: "10–12", r: 11, k: "iso", myo: true, load: "2 × 8 kg", rir: "0–1",
              m: { tricipiti: 1 } },
            { name: "Curl manubri", paio: "metallo", v: "XE_pHwbst04", n: 3, reps: "10–12", r: 11, k: "iso", myo: true, load: "12 kg", rir: "0–1",
              m: { bicipiti: 1 } } ] }
        ] }
      ]
    },

    vacanza: {
      label: "Vacanza",
      prima: [
        { t: "Setup tessuto — leggi prima", warn: true, p: "<b>Trazioni:</b> una colonna di tessuto per mano (ganci a ~50 cm), ginocchia piegate. <b>Rematori:</b> stessa altezza sui due lati. <b>Curl:</b> parte centrale dell'amaca. <b>Mai caricare un solo gancio</b>: tutte le tirate sono a due mani. I video sono girati su TRX: il movimento è lo stesso." },
        { t: "Riscaldamento", v: "OT-wTpxP9uo", p: "3 min + <b>dead hang 2 × 20–30 s</b> nei giorni A e C. Il pull-up va sempre per primo, quando la presa è fresca." }
      ],
      giorni: [
        { id: "A", nome: "Vacanza A", sub: "Trazione verticale + Spinta", hue: "a", blocchi: [
          { rest: 90, ex: [
            { name: "Pull-up al tessuto", v: "Z6o1sy-sw_I", v2: "6qx__9sj-HE", n: 4, reps: "5–8", r: 6, k: "corpo", load: "corpo libero", rir: "1–2",
              m: { dorsali: 1, bicipiti: 0.5 } },
            { name: "Pike push-up", v: "lIZ_C4VJnmc", n: 4, reps: "6–10", r: 8, k: "corpo", load: "corpo libero", rir: "1–2",
              m: { spalle_ant: 1, tricipiti: 0.5, spalle_lat: 0.5 } } ] },
          { rest: 75, ex: [
            { name: "Rematore inverso al tessuto", v: "ypIQZWKMbkU", n: 3, reps: "8–12", r: 10, k: "corpo", load: "corpo libero", rir: "1–2",
              cue: "Più orizzontale = più duro.", m: { dorsali: 1, bicipiti: 0.5, spalle_post: 0.5 } },
            { name: "Push-up declinati", v: "_wGqRX_E1Rk", n: 3, reps: "8–12", r: 10, k: "corpo", myo: true, load: "piedi su sedia", rir: "1–2",
              m: { petto: 1, tricipiti: 0.5, spalle_ant: 0.5 } } ] },
          { rest: 75, ex: [
            { name: "Squat monopodalico assistito", v: "htMldsOurDQ", n: 3, reps: "8–10/gamba", r: 9, side: true, k: "corpo", load: "corpo libero", rir: "1–2",
              m: { quadricipiti: 1, glutei: 0.5 } },
            { name: "Hanging knee raise", v: "l7OroezzX9k", n: 3, reps: "10–15", r: 12, k: "core", load: "corpo libero",
              m: { core: 1 } } ] },
          { rest: 45, ex: [
            { name: "Face pull al tessuto", v: "Jbyoxer58j4", n: 2, reps: "15", r: 15, k: "corpo", myo: true, load: "corpo libero", rir: "1",
              m: { spalle_post: 1 } } ] }
        ] },

        { id: "B", nome: "Vacanza B", sub: "Braccia + Gambe", hue: "b", blocchi: [
          { rest: 90, ex: [
            { name: "Chin-up al tessuto", v: "e1YSApl-QcM", n: 4, reps: "5–8", r: 6, k: "corpo", load: "corpo libero", rir: "1–2",
              cue: "Presa supina.", m: { dorsali: 1, bicipiti: 0.5 } },
            { name: "Reverse lunge + zaino", v: "94AXT7D3bKY", n: 4, reps: "10–12/gamba", r: 11, side: true, k: "corpo", load: "zaino", rir: "1–2",
              m: { quadricipiti: 1, glutei: 0.5 } } ] },
          { rest: 75, ex: [
            { name: "Dip su sedia profondi", v: "rjdpMVtMehw", n: 3, reps: "10–15", r: 12, k: "corpo", myo: true, load: "corpo libero", rir: "1–2",
              m: { tricipiti: 1, petto: 0.5 } },
            { name: "Single-leg hip thrust", v: "qCObDXTe4KY", n: 3, reps: "10–15/gamba", r: 12, side: true, k: "corpo", load: "spalle su sedia", rir: "1–2",
              m: { glutei: 1, femorali: 0.5 } } ] },
          { rest: 60, ex: [
            { name: "Curl al tessuto", v: "xG57S0fgXAk", n: 3, reps: "10–15", r: 12, k: "corpo", myo: true, load: "presa centrale", rir: "0–1",
              cue: "Gomiti alti e fermi, mani verso la fronte. Più ti inclini, più è duro.", m: { bicipiti: 1 } },
            { name: "Sliding leg curl con asciugamano", v: "p-V7uBUHeLc", v2: "gnb_hAG1dGY", n: 3, reps: "10–12", r: 11, k: "corpo", myo: true, load: "corpo libero", rir: "1",
              cue: "Ponte tenuto, talloni al sedere, giù in 2–3 s. Più dura: Nordic (＋).", m: { femorali: 1 } } ] },
          { rest: 45, ex: [
            { name: "Plank", v: "A2b2EmIg0dA", n: 3, reps: "40 s", hold: 40, k: "core", load: "corpo libero",
              m: { core: 1 } },
            { name: "Estensioni tricipiti al tessuto", v: "mFeBpsQovvU", n: 3, reps: "10–15", r: 12, k: "corpo", myo: true, load: "corpo libero", rir: "0–1",
              cue: "Di spalle al tessuto, una colonna per mano. Più ti inclini, più è duro. Sempre a due mani.", m: { tricipiti: 1 } } ] }
        ] },

        { id: "C", nome: "Vacanza C", sub: "Spinta pesante + Trazione", hue: "c", blocchi: [
          { rest: 90, ex: [
            { name: "Archer push-up", v: "MxVbNel13Ek", n: 4, reps: "6–8/lato", r: 7, side: true, k: "corpo", load: "corpo libero", rir: "1–2",
              m: { petto: 1, tricipiti: 0.5 } },
            { name: "Rematore al tessuto", v: "ypIQZWKMbkU", n: 4, reps: "8–10", r: 9, k: "corpo", load: "presa larga", rir: "1–2",
              m: { dorsali: 1, spalle_post: 0.5, bicipiti: 0.5 } } ] },
          { rest: 90, ex: [
            { name: "Pike push-up piedi rialzati", v: "lIZ_C4VJnmc", n: 3, reps: "6–10", r: 8, k: "corpo", load: "corpo libero", rir: "1–2",
              m: { spalle_ant: 1, tricipiti: 0.5, spalle_lat: 0.5 } },
            { name: "Scapular pull-up + Pull-up", v: "-ZIpSoTRsuE", n: 3, reps: "5 scap + max", r: 11, k: "corpo", load: "corpo libero", rir: "1–2",
              m: { dorsali: 1, bicipiti: 0.5 } } ] },
          { rest: 60, ex: [
            { name: "Diamond push-up", v: "_6AvEX9-k8E", n: 3, reps: "10–15", r: 12, k: "corpo", myo: true, load: "corpo libero", rir: "1–2",
              m: { tricipiti: 0.5, petto: 0.5 } },
            { name: "Face pull al tessuto", v: "Jbyoxer58j4", n: 3, reps: "12–15", r: 13, k: "corpo", myo: true, load: "corpo libero", rir: "1",
              m: { spalle_post: 1 } } ] },
          { rest: 60, ex: [
            { name: "Hanging knee raise", v: "l7OroezzX9k", v2: "r-LQKNxGJB0", n: 3, reps: "10–15", r: 12, k: "core", load: "corpo libero",
              cue: "Più duro: L-sit (＋).", m: { core: 1 } },
            { name: "Push-up al tessuto", v: "aW2kB1FduV8", n: 3, reps: "8–12", r: 10, k: "corpo", myo: true, load: "corpo libero", rir: "1",
              cue: "In piedi, una colonna di tessuto per mano, corpo inclinato in avanti. Scendi finché le mani arrivano ai lati del petto. Più i piedi sono indietro, più è duro. Sempre a due mani.",
              m: { petto: 1, tricipiti: 0.5, spalle_ant: 0.5 } } ] },
          { rest: 45, ex: [
            { name: "Calf raise su gradino", v: "H6WptvjXkgw", n: 3, reps: "20–25", r: 22, k: "iso", myo: true, load: "corpo libero",
              m: { polpacci: 1 } } ] }
        ] }
      ]
    }
  }
};

/* Quanto conta ogni muscolo per l'obiettivo attuale (priorita' braccia + petto). */
var PRIORITA = {
  petto: 1, bicipiti: 1, tricipiti: 1,
  spalle_lat: 0.8, dorsali: 0.7,
  quadricipiti: 0.5, femorali: 0.5, glutei: 0.5,
  spalle_post: 0.4, polpacci: 0.3, spalle_ant: 0.2, core: 0.2
};

var NOMI_MUSCOLI = {
  petto: "Petto", bicipiti: "Bicipiti", tricipiti: "Tricipiti", spalle_lat: "Spalle laterali",
  dorsali: "Dorsali", quadricipiti: "Quadricipiti", femorali: "Femorali", glutei: "Glutei",
  spalle_post: "Spalle posteriori", polpacci: "Polpacci", spalle_ant: "Spalle anteriori", core: "Core"
};

if (typeof module !== "undefined") module.exports = { SCHEDA: SCHEDA, PRIORITA: PRIORITA, NOMI_MUSCOLI: NOMI_MUSCOLI };
