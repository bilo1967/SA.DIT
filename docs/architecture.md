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
