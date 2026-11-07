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
- **Intensité macrosismique EMS-98** (I à XII), calculée par une équation de prédiction d’intensité de la forme utilisée pour la France (Bakun & Scotti 2006, Baumont et al. 2018 : atténuation géométrique −3,5·log R), à partir de la distance à la faille et non à l’épicentre. La faille est un rectangle dont la taille vient de la magnitude (Blaser et al. 2010) : un grand séisme secoue fortement toute une bande de territoire. Calage sur Le Teil 2019, La Laigne 2023, Arette 1967, Lambesc 1909 et Bâle 1356 (intensité épicentrale à un degré près). Les intensités sont données par département, avec l’intensité épicentrale.
- **Limites** : magnitude de 2 à 50 et profondeur de 0 à 1000 km (saisie exacte possible dans les champs numériques). Au-delà de Mw 9,6, plus fort que tout séisme connu, les valeurs sont fictives.
- **Bulletins** : localisation automatique au bout d’environ 2 minutes (magnitude ML provisoire), intensités ressenties, puis bulletin révisé (Mw).
- **Messages tsunami** dans le style du CENALT : *Information*, *Vigilance* ou *Alerte*, pour chacun des 26 départements littoraux, avec la hauteur estimée en mètres, l’heure d’arrivée et des observations marégraphiques simulées. Les hauteurs viennent d’un modèle physique (voir plus bas), et le littoral clignote tant qu’un message est en cours.
- **Alerte précoce fictive**, désactivable : la France n’a **pas** de système public d’alerte sismique précoce. Cette fonction n’existe que pour la simulation et elle est signalée comme telle.
- **Deux échelles d’intensité**, au choix dans les réglages : EMS-98 (européenne, par défaut) ou shindo (japonaise, JMA). Le shindo est une conversion approximative depuis l’EMS-98 (intensité instrumentale JMA ≈ 0,8 × EMS − 1,2).
- **Épicentres nommés** comme le font les organismes français, par distance et direction depuis une commune (« 12 km NE de Grenoble »).

## Utilisation

- **Nouveau séisme** : cliquez sur la carte ou choisissez un préréglage (Le Teil 2019, La Laigne 2023, Lambesc 1909, Arette 1967, mer Ligure 1887, Bâle 1356, Ubaye 2014, scénario au large de Nice). Les paramètres historiques sont approximatifs.
- **Vues** : informations (1), temps réel (2), tsunami (3).
- **Commandes** : Espace pour lecture/pause, R pour réinitialiser, N pour un nouveau séisme, ← / → pour avancer ou reculer de 5 s.
- **Réglages** : échelle d’intensité, langue, volume, annonces vocales, alerte précoce fictive, économie d’énergie et sons d’alerte.
- **Sons** : les mêmes sons que le simulateur pour le Japon (ceux du projet Scratch d’origine), associés aux événements français équivalents. Vous pouvez remplacer chacun par votre propre fichier.

## Modèle de tsunami

Les hauteurs de tsunami sont calculées, pas tirées d’une table.

1. **Source.** La longueur, la largeur et le glissement de la faille viennent de la magnitude (lois d’échelle de Blaser et al., 2010). La faille est orientée selon les isobathes locales. Le soulèvement du fond vaut environ 45 % du glissement, moins pour les séismes profonds ou non chevauchants, et seule la partie de la rupture sous la mer compte.
2. **Temps de trajet.** L’onde se propage sur une grille de profondeurs (environ 0,05°, issue de la bathymétrie Natural Earth) à la vitesse √(g·profondeur). Elle ne traverse pas les terres : elle contourne la Corse ou passe par les détroits.
3. **Hauteurs.** La hauteur au large diminue avec la distance (davantage dans l’axe de la faille que perpendiculairement). Les ondes qui contournent des terres, ou qui passent par un détroit étroit vers un grand bassin (Gibraltar), perdent de l’énergie. La loi de Green donne ensuite la hauteur au rivage, en mètres, au niveau du marégraphe et non du run-up.
4. **Observations.** Pour chaque département, la première vague arrive à l’heure calculée, puis un maximum est mesuré 10 à 25 minutes plus tard, autour de l’estimation.

C’est une estimation rapide (environ 0,1 s par séisme), pas un solveur complet : les résonances de port, le détail des côtes et le run-up ne sont pas modélisés. Exemples : scénario M7,0 au large de Nice, 2,3 m dans les Alpes-Maritimes ; un séisme de type Lisbonne 1755 donne environ 0,5 m en Bretagne et presque rien en Méditerranée, comme en réalité.

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
- Profondeurs océaniques : bathymétrie Natural Earth 10m (domaine public), convertie en grille par `tools/build_depth_grid.py`.
- Sons d’alerte (`src/sounds/`) : repris tels quels du projet Scratch d’origine ([walbcglgh/jp_eew_simulator](https://github.com/walbcglgh/jp_eew_simulator), MPL-2.0). Leur licence suit celle de ce projet ; certains pourraient imiter des carillons d’alerte diffusés à la télévision, vérifiez avant toute redistribution.

---

<a id="english"></a>

## English

An earthquake simulator for metropolitan France, in French and English, packaged as a Linux AppImage. It is a separate app built on the same engine as this repository's Japan simulator (`../desktop`), adapted to France.

> Simplified model for education. Not for risk-prevention decisions. In a real earthquake, follow official instructions (FR-Alert, prefecture).

- **Shaking:** P and S waves (6.0 and 3.5 km/s) and shaking at about 280 active RESIF stations (FR broadband and RA accelerometric networks).
- **Intensity:** EMS-98 macroseismic intensity (I–XII) from an intensity prediction equation of the form used for France (Bakun & Scotti 2006, Baumont et al. 2018: geometric spreading −3.5·log R), using the distance to a finite fault sized from the magnitude (Blaser et al. 2010) rather than to the epicentre. Calibrated on Le Teil 2019, La Laigne 2023, Arette 1967, Lambesc 1909 and Basel 1356 (epicentral intensity within one degree). Reported per département together with the epicentral intensity.
- **Limits:** magnitude 2 to 50 and depth 0 to 1000 km, with number fields for exact values. Above Mw 9.6, larger than any recorded quake, the results are fictional.
- **Bulletins:** an automatic location after about 2 minutes (provisional ML), felt intensities, then a revised bulletin (Mw).
- **Tsunami:** CENALT-style messages (*Information*, *Vigilance* or *Alerte*) for each of the 26 coastal départements, with estimated arrival times. Coasts on *Alerte* blink.
- **Fictional early warning**, which you can turn off: France has **no** public earthquake early-warning system, and the app labels this feature as fictional.
- **Two intensity scales**, chosen in Settings: EMS-98 (European, default) or shindo (Japanese, JMA). Shindo is an approximate conversion from EMS-98 (JMA instrumental intensity ≈ 0.8 × EMS − 1.2).
- **Epicenter names:** distance and direction from a commune ("12 km NE of Grenoble"), the way French agencies report them.
- **Sounds:** the same alert sounds as the Japan simulator (from the original Scratch project), mapped to the equivalent French events. Each can be replaced by your own file. Their licensing follows the original project; some may imitate broadcast alert chimes.
- **Tsunami model:** heights in metres are calculated from the earthquake source (Blaser et al. 2010 scaling, uplift from slip), travel times over a real ocean-depth grid at √(g·depth) with waves going around land and through straits, and Green's-law shoaling to the coast. Simulated tide-gauge observations follow the arrivals.
- **Language:** switch between French and English in Settings. The whole interface, dates, numbers and spoken announcements follow the chosen language.
