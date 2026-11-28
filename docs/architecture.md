# SA.DIT — architettura e decisioni (branch sperimentale)

## Stato e branch
- **Base stabile**: `prototype/media-validation` (origine del branch sperimentale).
- **Esperimento**: `experiment/web-speech-recognition`. Il supporto Mac rimane sospeso.
- Stack Windows: Go 1.26 / Wails 3.1 / WebView2 / PeerJS 1.5.5.
- Ruoli: **Interprete** (pubblica PIN), **Sala** (si collega con PIN).
- La chat usa PeerJS DataConnection, separatamente dai flussi multimediali.

## Modalità di sottotitolazione
1. **Riconoscimento esterno**: l'Interprete condivide una finestra mediante
   `getDisplayMedia`; la Sala trasmette il microfono via WebRTC e riceve il video.
   La finestra di proiezione usa il collegamento WebRTC locale esistente.
2. **Riconoscimento integrato**: l'Interprete usa `SpeechRecognition` nella WebView2;
   la Sala trasmette **sempre il proprio microfono all'Interprete** via WebRTC
   (audio unidirezionale Sala → Interprete) e riceve messaggi testuali tramite
   DataConnection per la proiezione. Nella modalità integrata non esiste un
   flusso video: è il testo a sostituire il video.
   La modalità viene annunciata all'apertura della connessione dati.
   Lo stesso PIN identifica entrambe le modalità.

## Protocollo testuale
- `{type:"session-mode", mode:"external"|"integrated"}` annuncia la modalità.
- `{type:"transcript", revision: N, final: "...", interim: "..."}` invia
  uno snapshot cumulativo idempotente; la Sala accetta solo revisioni crescenti.
- La proiezione locale riceve gli snapshot tramite eventi Wails, senza HTML remoto.
- Il testo va inserito con `textContent` e visualizzato con `white-space: pre-wrap`
  per preservare ritorni a capo ed evitare HTML non sicuro.

## Comandi vocali
- File indipendente `voice-commands.json`, array di oggetti `{"t":"frase","r":"sostituzione"}`.
- I valori iniziali replicano i 22 comandi attivi nel `tagwords` di DIT.tafono
  (`voice.ditlab.it/index.html` fornito il 26 novembre 2026).
- Lettura: prima directory EXE, poi configurazione utente.
  Scrittura: file già trovato; se assente, accanto all'EXE quando possibile,
  altrimenti configurazione utente. Se il file manca vengono caricati i default.
- La dialog è separata da Setup, scorre internamente ed espone Annulla/Salva e chiudi.
- Post-processing basato su DIT.tafono: sostituzioni case-insensitive in ordine,
  maiuscole dopo terminatori di frase, comando `#M`, maiuscola iniziale,
  pulizia spazi prima della punteggiatura. I newline restano testuali.

## Affidabilità e sicurezza
- Dopo `onend` inatteso e `network`, ripartenza con backoff;
  non ripartire dopo stop esplicito o errori non recuperabili.
- Risultati parziali distinti da quelli finali; log compatto e colorato.
- Non salvare trascrizioni in file; il DataChannel resta confinato alla sessione.
- Interprete e Sala devono appartenere alla stessa modalità di protocollo:
  l'evento `session-mode` decide se la Sala offre solo audio oppure audio
  più canale video. La richiesta di autorizzazione microfono è necessaria
  **in entrambe** le modalità.
- Il PIN PeerJS è un identificatore temporaneo, non autenticazione forte.
- L'overlay trasparente è previsto solo per la modalità integrata;
  va verificato sui runtime Windows in uso.

## Verifiche
- Test automatici JS per post-processing, modalità e riconnessione.
- Test Go del dizionario; build GitHub Actions sul branch sperimentale.
- Prova manuale su due PC: verifica audio Sala → Interprete in entrambe le
  modalità; modalità esterna invariata; modalità interna, newline,
  avvio/arresto, ricollegamento dopo `network`, proiezione.

## Interfaccia e periferiche (novembre 2026)
- Interprete: Setup distingue cuffie e microfono; `interpreterMicrophoneId` è salvato in `preferences.json`.
- Riconoscimento integrato: testo provvisorio e definitivo solo nel registro; errori di rete recuperabili nascosti, non quelli irreversibili.
- I comandi vocali restano in `voice-commands.json` accanto all'eseguibile ove scrivibile.

## Proiezione testuale e trasparenza
- Nella modalità testo i controlli Crop sono nascosti; i pulsanti ± regolano il font (16–96 px).
- La finestra nativa usa sfondo RGBA trasparente. Dopo il cambio di cornice viene
  ripristinato esplicitamente il colore di sfondo con alpha 0; questo è un
  tentativo di aggirare il comportamento WebView2, da confermare su Windows.
- Non ricreare automaticamente la proiezione durante una sessione: farebbe
  perdere la connessione video della modalità esterna.

### Nota sulla selezione del microfono e punteggiatura
- WebView2 non ha garantito l'uso della traccia selezionata da `SpeechRecognition.start(audioTrack)` nel test pratico: la modalità integrata usa temporaneamente il microfono predefinito, senza opzione di selezione.
- Non inserire punti né altri caratteri di punteggiatura automaticamente: conservare quelli riconosciuti da Edge e le sole sostituzioni dei comandi vocali espliciti.
- Gli eventi di acquisizione del microfono e avvio ASR restano nel log diagnostico invisibile.

## Solo testo definitivo verso la Sala
- L'Interprete visualizza i risultati `interim` esclusivamente nel proprio log.
- Gli eventi `transcript` contengono soltanto `{revision,final}` e sono emessi
  dopo `isFinal` e post-processing, oppure quando si azzera la trascrizione.
- La Sala non riceve né mostra `interim`, anche se una versione precedente del
  protocollo eventualmente lo contenesse.
- Nessuna punteggiatura va generata automaticamente a fine segmento.
  Edge può produrla autonomamente; i comandi vocali espliciti possono
  sostituire una frase come «punto fermo» con «. ».
- Rimossa la logica che spostava punteggiatura tra righe del log: serviva
  solo all'aspetto, ma poteva rendere poco leggibili i risultati reali.
- La trasparenza con `SetBackgroundColour` dopo `SetFrameless` non ha risolto
  il problema su Windows; resta una limitazione aperta da verificare con una
  differente gestione nativa della finestra.

## 26 novembre 2026: post-processing, chiusura e proiezione
- Riconoscimento integrato: Edge (soli risultati `isFinal`) viene ripulito
  dal singolo punto finale automatico; segmenti vuoti o di un solo segno
  di punteggiatura sono ignorati. Poi si applicano i comandi vocali
  configurati (incluso «punto fermo»), poi la revisione finale.
- La revisione rende minuscola l'iniziale della frase successiva quando la
  precedente non finisce in punto, ? o !; negli altri casi usa maiuscola.
  Dopo . , ; : ? ! usa un solo spazio se non segue un ritorno a capo.
  Non aggiunge un punto finale automatico.
- Chiudendo la finestra principale con la X viene inviato `session-end`
  alla controparte via PeerJS, poi l'applicazione esce; i controlli remoti
  vengono resettati e il log riporta la disconnessione. La correzione è
  presente anche nel branch `prototype/media-validation`.
- Trasparenza rinviata: con barra titolo visibile funziona inizialmente;
  dopo aver attivato `Frameless` una volta, la trasparenza non si ripristina
  finché non si riavvia l'app con l'opzione barra nascosta disattivata.
  Ora due temi opachi (bianco su nero / nero su bianco) e font ±.

### Correzione riconoscimento (26 novembre 2026)
- Ricontrollato `voice.ditlab.it/index.html` del pacchetto originale DIT.tafono:
  `recognition.onend` richiama immediatamente `recognition.start()` tramite il
  toggle se il riavvio è abilitato. Nessun timer o backoff.
- Eliminato il backoff inventato di 500 ms–15 s. `onend` riavvia subito;
  un'eccezione sincrona di `start()` è invece segnalata senza loop serrati.
- In aggiunta alla pulizia iniziale, dopo le sostituzioni sono scartati tutti
  i risultati composti solo da segni di punteggiatura/simboli/spazi.
- Quando Edge aggiunge `?`, `!` o `.` subito dopo un comando vocale esplicito
  di punteggiatura a fine segmento, quel segno terminale automatico viene eliminato
  prima della sostituzione, evitando la punteggiatura doppia.

### Correzione dei comandi vocali isolati
- Un segmento finale costituito solo da «punto fermo» è **valido**: chiude il
  segmento precedente anche se il post-processing restituisce solo `.`.
- Il filtro dei risultati di sola punteggiatura esclude soltanto quelli senza
  un comando vocale di punteggiatura effettivamente pronunciato.
- `punto fermo?` viene ripulito del segno aggiunto da Edge **prima** delle
  sostituzioni; il risultato è un singolo punto esplicito. Il punto viene
  deduplicato se il testo precedente termina già con lo stesso segno.


### Pipeline definitiva dei segmenti Edge (revisione)
- A: su ogni risultato definitivo applicare trim; eliminare tutti i segni
  **forti terminali** (., !, ?) anche ripetuti; scartare i segmenti
  rimasti vuoti o costituiti soltanto da punteggiatura/simboli.
  Non rimuovere la punteggiatura interna di Edge, che può essere corretta.
- B: eseguire le keyword in ordine di configurazione. Le sostituzioni che
  contengono un solo segno convenzionale (., !, ?, ,, ;, :) sono protette
  da marcatori privati temporanei. La punteggiatura originale di Edge
  immediatamente prima o dopo un marcatore viene scartata; i marcatori
  adiacenti fra loro non si eliminano. Infine i marcatori diventano i
  segni espliciti. Gli altri comandi (newline, #M, …) restano normali.
- C: normalizzare spazi prima/dopo punteggiatura, preservare i newline
  richiesti e correggere le iniziali dopo . ! ?. Il testo proiettato è
  cumulativo; un comando «punto fermo» isolato può chiudere il precedente.
- Nessuna pulizia dei segni forti dopo B: i segni pronunciati hanno priorità.
- Questa sezione sostituisce le descrizioni precedenti del trattamento
  del solo punto finale e della punteggiatura Edge finale conservata.


## Branch experiment/kroko-native
- Web Speech API replaced by a local WebView2 AudioWorklet + Wails 3 binary
  stream `kroko-audio` + sherpa-onnx-go native streaming decoder.
- PCM mono 16 kHz signed 16-bit, chunks of 100ms, one recognizer/stream.
- Endpoint recognized by Kroko becomes a final transcript; provisional output
  remains local. Explicit punctuation is kept (no Edge terminal cleanup).
- The portable Windows artifact bundles sherpa-onnx DLLs and the verified
  Italian Community model (SHA-256 of original .data pinned in script).
- This branch is experimental; ASR latency and packaging require real tests.

### Kroko: microfono e finalizzazione
- Setup Interprete: selezione distinta per cuffie e microfono di acquisizione Kroko;
  il microfono viene salvato in `interpreterMicrophoneId` e passato a
  `getUserMedia({deviceId:{exact:...}})` quando specificato. La modifica
  durante l'ascolto riavvia l'acquisizione preservando il testo cumulativo.
- Endpointing sperimentale: rule1=1.5 s (prima 2.4), rule2=0.65 s (prima 1.2),
  rule3=20 s invariato. Solo l'endpoint genera testo definitivo; il testo
  provvisorio resta locale. Verificare frammentazione e latenza su respeaking.
