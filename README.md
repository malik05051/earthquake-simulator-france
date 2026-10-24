# Simulateur de séismes — France / Earthquake Simulator — France

*[English below](#english)*

Simulateur de séismes pour la France métropolitaine, en français et en anglais, distribué sous forme d’AppImage Linux. C’est une application distincte, construite sur le même moteur que le simulateur pour le Japon de ce dépôt (`../desktop`), mais adaptée à la France.

> Modèle simplifié à but pédagogique. Il ne doit pas servir à la prévention des risques. En cas de séisme réel, suivez les consignes officielles (FR-Alert, préfecture).

## Lancer

```
chmod +x QuakeSimulatorFrance-*.AppImage
./QuakeSimulatorFrance-*.AppImage
```

## Ce qui est simulé

- **Ondes P et S** (6,0 et 3,5 km/s) et secousses sur environ 280 stations actives des réseaux RESIF (large bande FR et accélérométrique RA).
- **Intensité macrosismique EMS-98** (I à XII), avec une équation de prédiction d’intensité simplifiée, calée sur Le Teil 2019, La Laigne 2023 et Lambesc 1909. Les intensités sont données par département, avec l’intensité épicentrale.
- **Bulletins** : localisation automatique au bout d’environ 2 minutes (magnitude ML provisoire), intensités ressenties, puis bulletin révisé (Mw).
- **Messages tsunami** dans le style du CENALT : *Information*, *Vigilance* ou *Alerte*, pour chacun des 26 départements littoraux, avec l’heure d’arrivée estimée. Le littoral en *Alerte* clignote.
- **Alerte précoce fictive**, désactivable : la France n’a **pas** de système public d’alerte sismique précoce. Cette fonction n’existe que pour la simulation et elle est signalée comme telle.
- **Deux échelles d’intensité**, au choix dans les réglages : EMS-98 (européenne, par défaut) ou shindo (japonaise, JMA). Le shindo est une conversion approximative depuis l’EMS-98 (intensité instrumentale JMA ≈ 0,8 × EMS − 1,2).
- **Épicentres nommés** comme le font les organismes français, par distance et direction depuis une commune (« 12 km NE de Grenoble »).

## Utilisation

- **Nouveau séisme** : cliquez sur la carte ou choisissez un préréglage (Le Teil 2019, La Laigne 2023, Lambesc 1909, Arette 1967, mer Ligure 1887, Bâle 1356, Ubaye 2014, scénario au large de Nice). Les paramètres historiques sont approximatifs.
- **Vues** : informations (1), temps réel (2), tsunami (3).
- **Commandes** : Espace pour lecture/pause, R pour réinitialiser, N pour un nouveau séisme, ← / → pour avancer ou reculer de 5 s.
- **Réglages** : langue, volume, annonces vocales, alerte précoce fictive, économie d’énergie, et sons d’alerte (des tons originaux synthétisés, que vous pouvez remplacer par vos propres fichiers).

## Développement

```
npm install
npm start
npm test
npm run dist      # AppImage dans dist/
```

`tools/prepare_data.py` reconstruit `src/data/` à partir des couches Natural Earth simplifiées avec mapshaper et de la liste des stations RESIF (service FDSN).

## Données

- Départements, littoral, terres et villes : Natural Earth (domaine public).
- Stations : RESIF, Réseau sismologique et géodésique français (métadonnées publiques du service FDSN).
- Rendu de la carte : MapLibre GL JS (BSD-3-Clause).

---

<a id="english"></a>

## English

An earthquake simulator for metropolitan France, in French and English, packaged as a Linux AppImage. It is a separate app built on the same engine as this repository's Japan simulator (`../desktop`), adapted to France.

> Simplified model for education. Not for risk-prevention decisions. In a real earthquake, follow official instructions (FR-Alert, prefecture).

- **Shaking:** P and S waves (6.0 and 3.5 km/s) and shaking at about 280 active RESIF stations (FR broadband and RA accelerometric networks).
- **Intensity:** EMS-98 macroseismic intensity (I–XII) from a simplified intensity prediction equation calibrated on Le Teil 2019, La Laigne 2023 and Lambesc 1909, reported per département together with the epicentral intensity.
- **Bulletins:** an automatic location after about 2 minutes (provisional ML), felt intensities, then a revised bulletin (Mw).
- **Tsunami:** CENALT-style messages (*Information*, *Vigilance* or *Alerte*) for each of the 26 coastal départements, with estimated arrival times. Coasts on *Alerte* blink.
- **Fictional early warning**, which you can turn off: France has **no** public earthquake early-warning system, and the app labels this feature as fictional.
- **Two intensity scales**, chosen in Settings: EMS-98 (European, default) or shindo (Japanese, JMA). Shindo is an approximate conversion from EMS-98 (JMA instrumental intensity ≈ 0.8 × EMS − 1.2).
- **Epicenter names:** distance and direction from a commune ("12 km NE of Grenoble"), the way French agencies report them.
- **Language:** switch between French and English in Settings. The whole interface, dates, numbers and spoken announcements follow the chosen language.
