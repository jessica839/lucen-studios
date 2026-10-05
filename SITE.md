# Marketing site

The marketing site is static HTML at `https://www.gamperklimmek.com`. Vercel serves clean URLs with `trailingSlash: false`; its configuration is in `vercel.json`. Root HTML files remain the English source templates. This reference was created because the `SITE.md` linked from `CLAUDE.md` was absent from this checkout.

## Internationalization

`i18n.js` contains the EN/DE/FR dictionaries, plus existing ES/IT data. Existing root pages retain browser language detection and their client-side translation behavior. The public language buttons expose EN/DE/FR.

On generated pages, `<html lang="de|fr" data-static-lang="de|fr">` selects the language immediately. Initial page load does **not** call `applyTranslations`; the HTML already contains translated content. `t()` remains available for dynamic calculator text. A language button on a static page stores `gk_lang` and navigates to its matching hreflang URL; if no alternate exists, it uses the previous translation fallback. Pages without `data-static-lang` retain their previous behavior.

### Statische Sprachseiten

Nach jeder Textänderung an den HTML-Vorlagen, den Übersetzungen oder den Metadaten die Sprachseiten neu bauen und prüfen:

```sh
npm run build:lang
npm test
```

Node.js 20 oder neuer genügt; es gibt keine Paketabhängigkeiten und kein notwendiges `npm install`. Die Skripte lösen ihre Dateipfade relativ zum Repository auf.

Der Build erzeugt `de/<seite>.html` und `fr/<seite>.html` für `index`, `businesses`, `calculator`, `story`, `work`, `operators` und `legal`. Die Startseiten sind öffentlich `/de` und `/fr`; weitere Seiten beispielsweise `/de/businesses`. Die generierten Dateien mit der Änderung übernehmen; sie nicht von Hand bearbeiten. Es wird weder veröffentlicht noch automatisch deployt.

Die Quellen sind:

- Die sieben HTML-Dateien im Stammverzeichnis als Strukturvorlagen und `i18n.js` als Übersetzungsquelle.
- `scripts/lang-meta.json` für DE/FR-Titel (50–60 Zeichen), Beschreibungen (120–155 Zeichen), die Domain, geschützte Produktnamen und die enge Allowlist unveränderter Namen, Adressen und technischer Kennungen. Zahlen und Symbole brauchen keine Übersetzung.
- `scripts/lang-bindings.json` für explizite Zuordnungen bisher unmarkierter Textknoten und Attribute zu Übersetzungskeys. Der Generator markiert diese **nur in der erzeugten Kopie**, damit die EN-Vorlagen unverändert bleiben. Neue unmarkierte Prosa muss hier eine geprüfte Zuordnung erhalten; beliebige englische Sätze gehören nicht in die Allowlist. Die ergänzten `static.*`-Übersetzungen stehen vor dem Engine-Abschnitt in `i18n.js`.

`[data-i18n]` ersetzt den Elementinhalt. Zusammen mit `[data-i18n-attr]` wird ausschließlich das bezeichnete Attribut übersetzt; `[data-i18n-ph]` setzt den Platzhalter. Ergänzende Attributzuordnungen erhalten `data-static-i18n-<attribut>`, damit ein Element gleichzeitig Text und zugängliche Beschriftungen übersetzen kann. Kommentare und Skript-/Style-Inhalte sind keine Übersetzungstexte. Fehlende Keys und unbekannte unmarkierte Texte führen zu einer Fehlerliste und verhindern das Schreiben der Ausgaben.

Interne Links führen, sofern vorhanden, zur gleichen Sprachfassung; ausgeschlossene Ziele bleiben auf ihren ursprünglichen Routen. Assets erhalten Root-Pfade, lokale Skripte einen zehnstelligen SHA-256-Inhaltshash als `?v=…`. Bei Skriptänderungen deshalb ebenfalls neu bauen. Fragmente, reine Query-URLs und externe Protokolle bleiben erhalten. Ein `noscript`-Stil macht Elemente mit Scroll-Einblendung auch ohne JavaScript sichtbar.

Canonical, Open-Graph-/Twitter-Metadaten und Seiten-JSON-LD werden pro Sprache gesetzt. Organisationsdaten bleiben erhalten. Alle drei Fassungen erhalten denselben EN/DE/FR/x-default-Satz; an den EN-Dateien wird ausschließlich der markierte `static-language-alternates`-Block eingefügt. Die Sitemap enthält jede der 21 Fassungen mit vollständigem Alternate-Satz; vorhandene andere Einträge bleiben bestehen.

`scripts/check-lang-pages.mjs` liest die Dateien mit einem eigenen Parser und prüft Übersetzungen, Metadaten, Links, Sitemap, Preise und Organisationsdaten. Für die Sprachprobe wird kein JavaScript ausgeführt: Gezählt werden eindeutige deutsche, französische und englische Stoppwörter im sichtbaren Body-Text. Mehr als 60 % **der erkannten Stoppworttreffer** müssen zur Zielsprache gehören; Eigennamen und Fachbegriffe zählen nicht zum Nenner. Anschließend muss ein erneuter Build bytegleiche Dateien liefern, einschliesslich aller EN-Vorlagen und noch nicht getrackter Ausgaben. Zusätzliche Regressionstests prüfen Parser-Grenzfälle und das i18n-Laufzeitverhalten.

Für die Prüfung dieses Sprachseiten-Changes vergleicht `node scripts/check-lang-pages.mjs --check-en-baseline` zusätzlich die EN-Vorlagen mit Git `HEAD`: Nur der hreflang-Block darf abweichen. Diese optionale Prüfung braucht Git. Der normale Test braucht kein Git und erlaubt spätere bewusste Textänderungen an den Vorlagen.

Ausgeschlossen bleiben `insurance` (fest englische Texte), `start` und `resources` (unvollständige Übersetzungsabdeckung), `ki-transparenz-kit` und `event-quiz` (bereits deutsch) sowie ES/IT. Andere Vorlagen wie `operators-new`, `dive-suite`, `kit/` und E-Mail-Vorlagen gehören ebenfalls nicht zum definierten Sieben-Seiten-Build.

### Unveränderte Laufzeitdienste und offene Punkte

`cookie-consent.js` bleibt unverändert. Consent-Voreinstellung, GA-Ladereihenfolge und Consent-Gating bleiben erhalten; Cookie-Banner und dynamisch erzeugte Consent-Platzhalter sind weiterhin englisch. Fremde Buchungsformulare bestimmen ihre Sprache selbst. Einzelne fest codierte dynamische Meldungen, etwa `Sending...` beim E-Mail-Versand des Rechners, sind durch den statischen HTML-Build nicht übersetzt.

`currency.js` und sämtliche vorhandenen `data-price-*`-Werte bleiben unverändert. Die HTML-Quellen enthalten teilweise andere Preise als die Referenztabelle in `CLAUDE.md` (beispielsweise CHF 2,900 beim Implementation Sprint). Der Sprachbuild korrigiert keine Preise. Die offiziellen Produktnamen Business Systems Review und Implementation Sprint bleiben auch auf DE/FR-Seiten erhalten.
