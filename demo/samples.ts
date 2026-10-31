// Sample responses in the style of a German website chatbot (fictitious companies).
// For offline mode and tests only – demo.ts produces real measurements with API_KEY.

export const SAMPLES: { id: string; text: string }[] = [
  {
    id: "delivery",
    text: `Gerne erkläre ich Ihnen, wie die Lieferung bei der Gärtnerei Lindenhof abläuft. Bestellungen, die bis 14 Uhr eingehen, verschicken wir in der Regel noch am selben Tag. Die Lieferzeit beträgt innerhalb Deutschlands ca. 2–3 Werktage. Für größere Pflanzen und Kübelpflanzen arbeiten wir mit einer Spedition zusammen – hier kann die Zustellung bis zu 7 Werktage dauern.

Die Versandkosten richten sich nach dem Bestellwert:

- Bis 49 € Bestellwert: 5,90 € Versandkosten
- Ab 49 €: versandkostenfrei
- Speditionsversand: pauschal 39 €

Sie können Ihre Bestellung auch kostenlos in unserer Gärtnerei abholen. Wählen Sie dazu im Bestellprozess die Option „Abholung vor Ort“ aus. Wir benachrichtigen Sie per E-Mail, sobald Ihre Pflanzen bereitstehen. Die Ware liegt dann 5 Tage für Sie bereit.

Bitte beachten Sie, dass wir empfindliche Pflanzen im Winter (z. B. bei Frost) erst bei milderem Wetter verschicken. In diesem Fall informieren wir Sie vorab per E-Mail. Haben Sie noch Fragen zu Ihrer Bestellung? Dann melden Sie sich gerne bei uns.`,
  },
  {
    id: "returns",
    text: `Sie können Artikel innerhalb von 30 Tagen nach Erhalt zurückgeben. Das gilt für alle Produkte aus unserem Onlineshop, ausgenommen sind lebende Pflanzen und individuell angefertigte Pflanzgefäße.

So funktioniert die Rücksendung:

1. Melden Sie die Rücksendung über das Formular in Ihrem Kundenkonto an.
2. Sie erhalten anschließend ein Rücksendeetikett per E-Mail.
3. Verpacken Sie den Artikel möglichst in der Originalverpackung und geben Sie das Paket bei einer DHL-Filiale ab.

Die Rücksendung ist für Sie kostenlos. Sobald das Paket bei uns eingegangen und geprüft ist, erstatten wir den Kaufpreis inkl. der ursprünglichen Versandkosten. Die Erstattung erfolgt auf dem Zahlungsweg, den Sie bei der Bestellung gewählt haben, und dauert in der Regel 5 bis 7 Werktage.

Falls ein Artikel beschädigt bei Ihnen angekommen ist, schicken Sie uns bitte zusätzlich ein Foto des Schadens an service@lindenhof-beispiel.de. Wir kümmern uns dann umgehend um Ersatz bzw. eine Gutschrift.`,
  },
  {
    id: "plant-care",
    text: `Ein Olivenbaum braucht vor allem einen sonnigen Standort und durchlässige Erde. Im Sommer fühlt er sich auf Balkon oder Terrasse am wohlsten. Gießen Sie ihn erst, wenn die oberste Erdschicht gut abgetrocknet ist, denn Staunässe verträgt er schlecht.

Von April bis September können Sie alle zwei Wochen einen Dünger für mediterrane Pflanzen geben. Im Herbst und Winter düngen Sie nicht.

Bei der Überwinterung kommt es auf die Temperatur an. Leichten Frost bis etwa minus 5 Grad übersteht ein ausgewachsener Baum meist ohne Schaden. Bei stärkerem Frost sollten Sie ihn an einen hellen, kühlen Ort bringen, ideal sind 5 bis 10 Grad. Ein unbeheiztes Gewächshaus oder ein heller Treppenaufgang eignen sich gut.

Gelbe Blätter deuten häufig auf zu viel Wasser hin. Lassen Sie die Erde dann etwas länger trocknen. Wenn Sie unsicher sind, bringen Sie gern ein Foto oder ein Blatt in unsere Gärtnerei mit – unsere Mitarbeitenden schauen sich das an.`,
  },
  {
    id: "opening-hours",
    text: `Unsere Gärtnerei ist von Montag bis Freitag von 8 bis 18 Uhr und samstags von 9 bis 14 Uhr geöffnet. An Sonn- und Feiertagen haben wir geschlossen. Derzeit gelten wegen der Inventur am 15. November verkürzte Öffnungszeiten bis 12 Uhr.`,
  },
  {
    id: "agency",
    text: `Wir entwickeln Websites, Onlineshops und individuelle Webanwendungen für kleine und mittlere Unternehmen aus der Region. Unser Schwerpunkt liegt auf WordPress und Shopware, für komplexere Anforderungen setzen wir außerdem auf eigene Lösungen mit Laravel.

Ein typisches Projekt läuft in vier Phasen ab: Analyse, Konzept und Design, Umsetzung sowie Livegang mit Einweisung. Für eine Unternehmenswebsite mit 8 bis 12 Unterseiten sollten Sie mit einer Projektdauer von ca. 6 bis 8 Wochen rechnen.

Zu den Kosten: Eine einfache Website beginnt bei 3.500 € netto, ein Onlineshop bei etwa 8.000 € netto. Der genaue Preis hängt z. B. von der Anzahl der Seiten, gewünschten Funktionen und der Anbindung an bestehende Systeme ab. Deshalb erstellen wir Ihnen nach einem kostenlosen Erstgespräch ein verbindliches Angebot.

Für die laufende Betreuung bieten wir Wartungsverträge ab 49 € pro Monat an. Darin enthalten sind Updates, Backups und ein monatliches Kontingent von 1 Stunde für kleine Änderungen. Sie können den Vertrag monatlich kündigen, ein Rabatt von 10 % gilt bei jährlicher Zahlung.

Möchten Sie ein Erstgespräch vereinbaren? Sie erreichen uns unter 0571 123456 oder über das Kontaktformular auf https://www.agentur-beispiel.de/kontakt.`,
  },
];
