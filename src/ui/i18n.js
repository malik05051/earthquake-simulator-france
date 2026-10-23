// French / English strings. `t(key, vars)` looks up the current language; `{name}` placeholders
// are filled from vars. Static HTML uses data-i18n / data-i18n-title attributes.

const STRINGS = {
  fr: {
    appTitle: 'Simulateur de séismes — France',
    viewInfo: 'Informations sismiques (1)', viewRealtime: 'Temps réel (2)', viewTsunami: 'Tsunami (3)', settings: 'Réglages',
    history: 'Historique des séismes', clear: 'Effacer', historyEmpty: 'Les séismes simulés apparaîtront ici.',
    simulated: 'Simulé', paused: 'En pause', finished: 'Terminé', idle: 'En attente',
    newQuake: 'Nouveau séisme', newQuakeTitle: 'Nouveau séisme', setupHint: "Cliquez sur la carte pour placer l'épicentre, ou choisissez un préréglage.",
    preset: 'Préréglage', custom: 'Personnalisé', epicenter: 'Épicentre', latlon: 'Lat. / Long.',
    magnitude: 'Magnitude', depth: 'Profondeur', veryShallow: 'Très superficiel', start: 'Lancer la simulation',
    volume: 'Volume', speech: 'Annonces vocales', autoswitch: 'Changer de vue automatiquement', follow: "Zoomer sur l'épicentre au lancement",
    lowpower: 'Économie d’énergie (moins d’images par seconde)', eewToggle: 'Alerte précoce fictive (la France n’en a pas)',
    language: 'Langue', sounds: 'Sons d’alerte', builtin: 'Son intégré', choose: 'Choisir…', reset: 'Réinitialiser',
    disclaimer: 'Modèle simplifié à but pédagogique. Ne pas utiliser pour la prévention des risques. En cas de séisme, suivez les consignes officielles (FR-Alert, préfecture).',
    play: 'Lecture / pause (Espace)', replay: 'Rejouer depuis le début', resetSim: 'Réinitialiser : effacer le séisme en cours (R)',
    zoomIn: 'Zoom avant', zoomOut: 'Zoom arrière', fit: 'Recentrer sur la France', markers: 'Afficher ou masquer les marqueurs',
    soundSet: 'Son choisi : {name}', soundBad: 'Impossible de lire ce fichier audio',
    // cards
    noQuake: 'Aucun séisme', noQuakeHint: 'Appuyez sur « Nouveau séisme » et cliquez sur la carte.',
    waitingQuake: 'En attente du séisme', noReportYet: 'Pas encore de bulletin',
    autoLoc: 'Localisation automatique', felt: 'Intensités ressenties', final: 'Bulletin révisé',
    maxIntensity: 'Intensité<br>max.', epiIntensity: 'Intensité<br>épicentrale', estMax: 'Intensité<br>max. estimée',
    rtMax: 'Intensité max.<br>en temps réel', shaking: 'Secousses détectées', waitingWaves: 'En attente de l’arrivée des ondes',
    occurred: 'survenu le {date} à {time}', aroundTime: 'Vers {time}', magAuto: 'Magnitude (automatique)',
    byDept: 'Intensités par département', deptFelt: 'ressenti', eewTitle: 'Alerte précoce (fictive)',
    eewAlert: 'Alerte', eewInfo: 'Info', eewFinal: 'finale', eewNote: 'Simulation : la France ne dispose pas de système public d’alerte sismique précoce.',
    eewStrong: 'Fortes secousses attendues. Mettez-vous à l’abri.',
    tsunamiNone: 'Pas de risque de tsunami', tsunamiPending: 'Tsunami : évaluation en cours',
    tsunamiActive: 'Messages tsunami en cours', tsunamiInfo: 'Information tsunami',
    tsunamiTitle: { alerte: 'Alerte tsunami', vigilance: 'Vigilance tsunami', information: 'Information tsunami' },
    tsunamiShort: { alerte: 'Alerte', vigilance: 'Vigilance', information: 'Information' },
    tsunamiAdvice: { alerte: 'Éloignez-vous immédiatement du littoral et gagnez les hauteurs.', vigilance: 'Évitez les plages, ports et zones basses du littoral.', information: 'Faible variation possible du niveau de la mer.' },
    tsunamiNoneLong: 'Aucun message tsunami en cours.', arrivingNow: 'Arrivée en cours (estimée)', expected: 'Prévu vers {time}',
    coastColours: 'Couleur du littoral', mapColours: 'Couleurs de la carte (EMS-98)', mapForecast: 'Couleurs (prévision)',
    source: 'Source simulée : réseau RESIF / localisation automatique',
    // speech
    sayEew: 'Alerte précoce fictive. Séisme détecté à {place}. Intensité maximale estimée {cls}.',
    sayEewAlert: 'Alerte précoce fictive. Fortes secousses attendues : {areas}.',
    sayAuto: 'Localisation automatique. Séisme de magnitude {mag}, {place}, profondeur {depth}.',
    sayFelt: 'Intensités ressenties. Intensité maximale {cls}, {areas}.',
    sayFinal: 'Bulletin révisé. Magnitude {mag}. {tsunami}',
    sayTsunami: '{title} pour {areas}. {advice}',
    km: '{d} kilomètres',
  },
  en: {
    appTitle: 'Earthquake Simulator — France',
    viewInfo: 'Earthquake information (1)', viewRealtime: 'Real-time (2)', viewTsunami: 'Tsunami (3)', settings: 'Settings',
    history: 'Earthquake history', clear: 'Clear', historyEmpty: 'Simulated earthquakes will appear here.',
    simulated: 'Simulated', paused: 'Paused', finished: 'Finished', idle: 'Idle',
    newQuake: 'New quake', newQuakeTitle: 'New earthquake', setupHint: 'Click the map to place the epicenter, or pick a preset.',
    preset: 'Preset', custom: 'Custom', epicenter: 'Epicenter', latlon: 'Lat / Lon',
    magnitude: 'Magnitude', depth: 'Depth', veryShallow: 'Very shallow', start: 'Start simulation',
    volume: 'Volume', speech: 'Spoken announcements', autoswitch: 'Switch views automatically', follow: 'Zoom to the epicenter on start',
    lowpower: 'Power saver (lower frame rate)', eewToggle: 'Fictional early warning (France has none)',
    language: 'Language', sounds: 'Alert sounds', builtin: 'Built-in sound', choose: 'Choose…', reset: 'Reset',
    disclaimer: 'Simplified model for education. Not for risk-prevention decisions. In a real earthquake, follow official instructions (FR-Alert, prefecture).',
    play: 'Play / pause (Space)', replay: 'Replay from the start', resetSim: 'Reset: clear the current quake (R)',
    zoomIn: 'Zoom in', zoomOut: 'Zoom out', fit: 'Fit France', markers: 'Show or hide markers',
    soundSet: 'Sound set: {name}', soundBad: 'Could not read that audio file',
    noQuake: 'No earthquake', noQuakeHint: 'Press “New quake” and click the map.',
    waitingQuake: 'Waiting for the earthquake', noReportYet: 'No bulletin yet',
    autoLoc: 'Automatic location', felt: 'Felt intensities', final: 'Revised bulletin',
    maxIntensity: 'Max<br>intensity', epiIntensity: 'Epicentral<br>intensity', estMax: 'Est. max<br>intensity',
    rtMax: 'Real-time<br>max intensity', shaking: 'Shaking detected', waitingWaves: 'Waiting for the waves to arrive',
    occurred: 'occurred {date} at {time}', aroundTime: 'Around {time}', magAuto: 'Magnitude (automatic)',
    byDept: 'Intensity by département', deptFelt: 'felt', eewTitle: 'Early warning (fictional)',
    eewAlert: 'Alert', eewInfo: 'Info', eewFinal: 'final', eewNote: 'Simulation: France has no public earthquake early-warning system.',
    eewStrong: 'Strong shaking expected. Take cover.',
    tsunamiNone: 'No tsunami risk', tsunamiPending: 'Tsunami: being assessed',
    tsunamiActive: 'Tsunami messages in effect', tsunamiInfo: 'Tsunami information',
    tsunamiTitle: { alerte: 'Tsunami alert', vigilance: 'Tsunami watch', information: 'Tsunami information' },
    tsunamiShort: { alerte: 'Alert', vigilance: 'Watch', information: 'Information' },
    tsunamiAdvice: { alerte: 'Move away from the coast immediately and head for higher ground.', vigilance: 'Stay away from beaches, harbours and low coastal areas.', information: 'Slight sea-level change possible.' },
    tsunamiNoneLong: 'No tsunami messages in effect.', arrivingNow: 'Arriving now (estimated)', expected: 'Expected around {time}',
    coastColours: 'Coastline colours', mapColours: 'Map colours (EMS-98)', mapForecast: 'Colours (forecast)',
    source: 'Simulated source: RESIF network / automatic location',
    sayEew: 'Fictional early warning. Earthquake detected {place}. Estimated maximum intensity {cls}.',
    sayEewAlert: 'Fictional early warning. Strong shaking expected in {areas}.',
    sayAuto: 'Automatic location. Magnitude {mag} earthquake, {place}, depth {depth}.',
    sayFelt: 'Felt intensities. Maximum intensity {cls}, {areas}.',
    sayFinal: 'Revised bulletin. Magnitude {mag}. {tsunami}',
    sayTsunami: '{title} for {areas}. {advice}',
    km: '{d} kilometers',
  },
};

let lang = 'fr';

export function setLang(l) { lang = STRINGS[l] ? l : 'fr'; document.documentElement.lang = lang; }
export function getLang() { return lang; }

export function t(key, vars) {
  let s = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  if (vars && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  return s;
}

export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.innerHTML = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  document.title = t('appTitle');
}
